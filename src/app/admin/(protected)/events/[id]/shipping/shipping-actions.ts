"use server";

import { revalidatePath } from "next/cache";
import { audit, requireStaff } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { parseTrackingRows } from "@/lib/shipping";
import { loadSubmissions, shippingItems } from "@/lib/admin-data";
import { sendMail, shippedMail } from "@/lib/mail";
import type { ActionResult } from "../../../actions";
import { loadShippingTargets } from "./targets";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** 発送対象を「発送準備」にする（CSV 出力の前後で使う） */
export async function markPreparing(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const targets = (await loadShippingTargets(ctx.supabase, eventId)).filter((s) => s.status === "verified");
  if (targets.length === 0) return { ok: false, message: "「人数確認済」の発送対象はありません" };
  const ids = targets.map((s) => s.id);
  const { error } = await ctx.supabase.from("submissions").update({ status: "preparing" }).in("id", ids);
  if (error) return { ok: false, message: error.message };
  await audit(ctx, "shipping.mark_preparing", "event", eventId, { count: ids.length });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: `${ids.length} 件を「発送準備」にしました` };
}

/** 追跡番号の CSV を取り込み、該当の回答を「発送済」にする */
export async function importTracking(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const defaultCarrier = str(fd, "carrier");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "CSV ファイルを選んでください" };
  const { entries, errors } = parseTrackingRows(parseCsv(await file.text()));
  if (entries.length === 0) return { ok: false, message: ["取り込める行がありません", ...errors].join(" / ") };

  const { data: subs, error } = await ctx.supabase
    .from("submissions")
    .select("id, receipt_no, status")
    .eq("event_id", eventId)
    .in("receipt_no", entries.map((e) => e.receiptNo));
  if (error) return { ok: false, message: error.message };
  const byReceipt = new Map((subs ?? []).map((s) => [s.receipt_no as number, s]));

  const missing: number[] = [];
  const shipments = [];
  for (const e of entries) {
    const s = byReceipt.get(e.receiptNo);
    if (!s || s.status === "invalid") {
      missing.push(e.receiptNo);
      continue;
    }
    shipments.push({
      submission_id: s.id,
      tracking_number: e.trackingNumber,
      carrier: e.carrier || defaultCarrier,
      shipped_at: new Date().toISOString(),
    });
  }
  if (shipments.length) {
    const { error: upErr } = await ctx.supabase.from("shipments").upsert(shipments, { onConflict: "submission_id" });
    if (upErr) return { ok: false, message: upErr.message };
    const { error: stErr } = await ctx.supabase
      .from("submissions")
      .update({ status: "shipped" })
      .in("id", shipments.map((s) => s.submission_id));
    if (stErr) return { ok: false, message: stErr.message };
  }
  await audit(ctx, "shipping.import_tracking", "event", eventId, { count: shipments.length, missing });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  const notes = [
    `${shipments.length} 件を「発送済」にしました`,
    missing.length ? `見つからない受付番号: ${missing.join(", ")}` : "",
    ...errors,
  ].filter(Boolean);
  return { ok: missing.length === 0 && errors.length === 0, message: notes.join(" / ") };
}

/** 追跡番号なしで、発送準備の回答をまとめて発送済にする */
export async function markShippedWithoutTracking(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const carrier = str(fd, "carrier");
  const targets = (await loadShippingTargets(ctx.supabase, eventId)).filter((s) => s.status === "preparing");
  if (targets.length === 0) return { ok: false, message: "「発送準備」の回答はありません" };
  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("shipments")
    .upsert(targets.map((s) => ({ submission_id: s.id, carrier, tracking_number: "", shipped_at: now })), { onConflict: "submission_id" });
  if (error) return { ok: false, message: error.message };
  await ctx.supabase.from("submissions").update({ status: "shipped" }).in("id", targets.map((s) => s.id));
  await audit(ctx, "shipping.mark_shipped", "event", eventId, { count: targets.length, carrier });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: `${targets.length} 件を「発送済」にしました` };
}

/** 発送済でまだ完了メールを送っていない回答に、発送完了メールを送る */
export async function sendShippedMails(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const { data: event } = await ctx.supabase.from("events").select("title").eq("id", eventId).single();
  const list = (await loadSubmissions(ctx.supabase, eventId, { statuses: ["shipped"] })).filter(
    (s) => s.shipment && !s.shipment.notified_at && s.email,
  );
  if (list.length === 0) return { ok: false, message: "送信するメールはありません" };
  let sent = 0;
  let failed = 0;
  for (const s of list) {
    const ok = await sendMail(
      shippedMail({
        to: s.email!,
        eventTitle: event?.title ?? "",
        receiptNo: s.receipt_no,
        nickname: s.nickname,
        carrier: s.shipment!.carrier,
        trackingNumber: s.shipment!.tracking_number,
        items: shippingItems(s),
      }),
    );
    if (ok) {
      sent++;
      await ctx.supabase.from("shipments").update({ notified_at: new Date().toISOString() }).eq("id", s.shipment!.id);
    } else {
      failed++;
    }
  }
  await audit(ctx, "shipping.send_mails", "event", eventId, { sent, failed });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return {
    ok: failed === 0,
    message: `${sent} 件送信しました` + (failed ? ` / ${failed} 件は送れませんでした（メール設定を確認してください）` : ""),
  };
}
