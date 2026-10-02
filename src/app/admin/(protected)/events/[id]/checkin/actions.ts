"use server";

import { revalidatePath } from "next/cache";
import { audit, requireStaff } from "@/lib/auth";
import { formatReceiptNo } from "@/lib/normalize";
import { rewardLabel } from "@/lib/events";
import type { RewardTier, SubmissionStatus } from "@/lib/types";

export type CheckinCard = {
  id: string;
  receiptNo: string;
  ticketNumber: string;
  nickname: string;
  claimed: number;
  confirmed: number | null;
  status: SubmissionStatus;
  duplicate: boolean;
  rewards: string[];
};

/** 当日受付で表示する内容。送付先などの個人情報は含めない */
async function loadCard(eventId: string, by: { receiptNo: number } | { id: string }): Promise<CheckinCard | null> {
  const { supabase } = await requireStaff();
  let q = supabase
    .from("submissions")
    .select("id, receipt_no, ticket_number, nickname, claimed_count, confirmed_count, status, duplicate_suspected, rewards:submission_rewards(member:members(name), tier:reward_tiers(*))")
    .eq("event_id", eventId);
  q = "id" in by ? q.eq("id", by.id) : q.eq("receipt_no", by.receiptNo);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const rewards = (data.rewards as unknown as { member: { name: string } | null; tier: RewardTier }[])
    .sort((a, b) => a.tier.min_count - b.tier.min_count)
    .map((r) => (r.tier.requires_member ? rewardLabel(r.tier, r.member?.name ?? "未選択") : r.tier.name));
  return {
    id: data.id,
    receiptNo: formatReceiptNo(data.receipt_no),
    ticketNumber: data.ticket_number,
    nickname: data.nickname,
    claimed: data.claimed_count,
    confirmed: data.confirmed_count,
    status: data.status,
    duplicate: data.duplicate_suspected,
    rewards,
  };
}

/** 受付番号（QRの "receipt:000123" や数字だけでも可）で呼び出す */
export async function lookupReceipt(eventId: string, input: string): Promise<{ card: CheckinCard } | { error: string }> {
  const digits = input.replace(/^receipt:/, "").replace(/[^0-9０-９]/g, "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!digits) return { error: "受付番号を入力してください" };
  const card = await loadCard(eventId, { receiptNo: Number(digits) });
  if (!card) return { error: `受付番号 ${formatReceiptNo(Number(digits))} はこの公演にありません` };
  return { card };
}

/** その場で人数を確定し、状態を「人数確認済」にする */
export async function confirmAtDesk(eventId: string, submissionId: string, count: number): Promise<{ card: CheckinCard } | { error: string }> {
  const ctx = await requireStaff();
  if (!Number.isInteger(count) || count < 0 || count > 999) return { error: "人数が正しくありません" };
  const { error } = await ctx.supabase.rpc("set_confirmed_count", { p_submission_id: submissionId, p_count: count });
  if (error) return { error: error.message };
  await ctx.supabase.from("submissions").update({ status: "verified" }).eq("id", submissionId).eq("status", "received");
  await audit(ctx, "submission.confirm_count", "submission", submissionId, { confirmed_count: count, via: "checkin" });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  const card = await loadCard(eventId, { id: submissionId });
  return card ? { card } : { error: "回答が見つかりません" };
}
