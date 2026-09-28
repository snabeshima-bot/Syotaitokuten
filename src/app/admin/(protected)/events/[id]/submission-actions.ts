"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, requireStaff } from "@/lib/auth";
import { normalizePhone, normalizePostalCode } from "@/lib/normalize";
import type { SubmissionStatus } from "@/lib/types";
import type { ActionResult } from "../../actions";

const STATUSES = ["received", "verified", "preparing", "shipped", "on_hold", "invalid"] as const;
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** 確定人数を入れて特典の明細を組み直す。空欄なら申告人数に戻す */
export async function confirmCount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const id = str(fd, "submission_id");
  const raw = str(fd, "confirmed_count");
  const count = raw === "" ? null : Number(raw);
  if (count !== null && (!Number.isInteger(count) || count < 0)) return { ok: false, message: "人数は0以上の整数で入力してください" };
  const { error } = await ctx.supabase.rpc("set_confirmed_count", { p_submission_id: id, p_count: count });
  if (error) return { ok: false, message: error.message };
  if (fd.get("mark_verified") === "on") {
    await ctx.supabase.from("submissions").update({ status: "verified" }).eq("id", id).eq("status", "received");
  }
  await audit(ctx, "submission.confirm_count", "submission", id, { confirmed_count: count });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: count === null ? "申告人数に戻しました" : `確定人数を ${count} 人にしました` };
}

export async function bulkUpdateStatus(ids: string[], eventId: string, status: SubmissionStatus): Promise<ActionResult> {
  const ctx = await requireStaff();
  if (!STATUSES.includes(status)) return { ok: false, message: "状態が正しくありません" };
  if (ids.length === 0) return { ok: false, message: "回答を選んでください" };
  const { error } = await ctx.supabase.from("submissions").update({ status }).in("id", ids).eq("event_id", eventId);
  if (error) return { ok: false, message: error.message };
  await audit(ctx, "submission.bulk_status", "event", eventId, { ids, status });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: `${ids.length} 件を更新しました` };
}

const detailSchema = z.object({
  status: z.enum(STATUSES),
  nickname: z.string().min(1, "ニックネームを入力してください"),
  email: z.union([z.literal(""), z.email("メールアドレスの形式が正しくありません")]),
  full_name: z.string(),
  phone: z.string(),
  postal_code: z.string(),
  address1: z.string(),
  address2: z.string(),
  staff_note: z.string(),
  duplicate_suspected: z.boolean(),
});

/** 回答の内容（状態・連絡先・送付先・メモ・希望メンバー）を直す */
export async function updateSubmission(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const id = str(fd, "submission_id");
  const parsed = detailSchema.safeParse({
    status: str(fd, "status"),
    nickname: str(fd, "nickname"),
    email: str(fd, "email"),
    full_name: str(fd, "full_name"),
    phone: normalizePhone(str(fd, "phone")),
    postal_code: normalizePostalCode(str(fd, "postal_code")),
    address1: str(fd, "address1"),
    address2: str(fd, "address2"),
    staff_note: String(fd.get("staff_note") ?? ""),
    duplicate_suspected: fd.get("duplicate_suspected") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const { error } = await ctx.supabase
    .from("submissions")
    .update({
      ...d,
      email: d.email || null,
      full_name: d.full_name || null,
      phone: d.phone || null,
      postal_code: d.postal_code || null,
      address1: d.address1 || null,
      address2: d.address2 || null,
    })
    .eq("id", id)
    .eq("event_id", eventId);
  if (error) return { ok: false, message: error.message };

  // 希望メンバー: reward_<rewardId> = memberId
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("reward_")) continue;
    const rewardId = key.slice("reward_".length);
    const { error: rErr } = await ctx.supabase
      .from("submission_rewards")
      .update({ member_id: String(value) || null })
      .eq("id", rewardId)
      .eq("submission_id", id);
    if (rErr) return { ok: false, message: rErr.message };
  }
  await audit(ctx, "submission.update", "submission", id, { status: d.status });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: "保存しました" };
}
