"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAccepting, loadEventBundle, rewardLabel } from "@/lib/events";
import { eligibleTiers, needsShipping } from "@/lib/rewards";
import { buildSubmissionSchema, flattenErrors, pruneForCount, type SubmissionInput } from "@/lib/validation";
import { verifyTurnstile } from "@/lib/turnstile";
import { receiptMail, sendMail } from "@/lib/mail";
import { env } from "@/lib/env";

export type SubmitResult =
  | { ok: true; receiptNo: number; items: string[]; shipping: boolean }
  | { ok: false; message: string; errors?: Record<string, string> };

const DB_ERRORS: Record<string, string> = {
  duplicate_ticket: "このチケット番号はすでに受付済みです。内容を変更したい場合はスタッフにお声がけください。",
  event_closed: "この公演の受付は終了しました。",
  member_required: "希望メンバーを選んでください。",
  address_required: "送付先を入力してください。",
  invalid_count: "招待した人数を選んでください。",
  rate_limited: "短時間に送信が続いたため、受付を一時的に止めています。しばらくしてからお試しください。",
};

export async function submitInvitation(
  slug: string,
  input: SubmissionInput & { turnstile_token?: string },
): Promise<SubmitResult> {
  const supabase = createAdminClient();
  const bundle = await loadEventBundle(supabase, { slug });
  if (!bundle || bundle.event.status === "draft") return { ok: false, message: "公演が見つかりません。" };
  const { event, tiers, members } = bundle;
  if (!isAccepting(event)) return { ok: false, message: DB_ERRORS.event_closed };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  if (!(await verifyTurnstile(input.turnstile_token, ip ?? null))) {
    return { ok: false, message: "ロボットでないことの確認に失敗しました。もう一度お試しください。" };
  }

  const parsed = buildSubmissionSchema(tiers, members.map((m) => m.id)).safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "入力内容を確認してください。", errors: flattenErrors(parsed.error) };
  }
  const data = pruneForCount(parsed.data, tiers);
  const ipHash = ip ? createHash("sha256").update(`${env.ipHashSalt}:${ip}`).digest("hex") : null;

  const { data: rows, error } = await supabase.rpc("submit_invitation", {
    p: { ...data, event_id: event.id, ip_hash: ipHash },
  });
  if (error) {
    const message = DB_ERRORS[error.message];
    if (!message) console.error("[submit] 登録に失敗:", error);
    return { ok: false, message: message ?? "送信に失敗しました。時間をおいてもう一度お試しください。" };
  }
  const receiptNo = (rows as { receipt_no: number }[])[0].receipt_no;

  const earned = eligibleTiers(tiers, data.claimed_count);
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name;
  const items = earned.map((t) => rewardLabel(t, t.requires_member ? memberName(data.members[t.id]) : null));
  const shipping = needsShipping(earned);

  await sendMail(
    receiptMail({
      to: data.email,
      eventTitle: event.title,
      receiptNo,
      nickname: data.nickname,
      count: data.claimed_count,
      items,
      shipping,
    }),
  );

  return { ok: true, receiptNo, items, shipping };
}
