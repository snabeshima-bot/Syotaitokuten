import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member, RewardTier, Shipment, Submission, SubmissionReward, SubmissionStatus } from "./types";
import { rewardLabel } from "./events";
import type { ShippingRow } from "./shipping";

export type SubmissionWithRewards = Submission & {
  rewards: (SubmissionReward & { tier: RewardTier; member: Member | null })[];
  shipment: Shipment | null;
};

/** 回答に特典の明細と発送記録を付けて読む（受付番号の昇順） */
export async function loadSubmissions(
  supabase: SupabaseClient,
  eventId: string,
  opts: { statuses?: SubmissionStatus[]; ids?: string[] } = {},
): Promise<SubmissionWithRewards[]> {
  let query = supabase
    .from("submissions")
    .select("*, rewards:submission_rewards(*, tier:reward_tiers(*), member:members(*)), shipment:shipments(*)")
    .eq("event_id", eventId)
    .order("receipt_no");
  if (opts.statuses?.length) query = query.in("status", opts.statuses);
  if (opts.ids?.length) query = query.in("id", opts.ids);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as Submission & {
      rewards: SubmissionWithRewards["rewards"];
      shipment: Shipment | Shipment[] | null;
    };
    return {
      ...r,
      rewards: [...r.rewards].sort((a, b) => a.tier.min_count - b.tier.min_count || a.tier.sort_order - b.tier.sort_order),
      shipment: Array.isArray(r.shipment) ? (r.shipment[0] ?? null) : r.shipment,
    };
  });
}

/** 希望メンバーが必要なのに未選択の特典があるか */
export function hasMissingMember(s: SubmissionWithRewards): boolean {
  return s.rewards.some((r) => r.tier.requires_member && !r.member_id);
}

export function effectiveCount(s: Pick<Submission, "claimed_count" | "confirmed_count">): number {
  return s.confirmed_count ?? s.claimed_count;
}

/** 発送する特典（手渡しを除く）のラベル */
export function shippingItems(s: SubmissionWithRewards): string[] {
  return s.rewards.filter((r) => r.tier.delivery === "ship").map((r) => rewardLabel(r.tier, r.member?.name));
}

export function allItems(s: SubmissionWithRewards): string[] {
  return s.rewards.map((r) => rewardLabel(r.tier, r.member?.name));
}

/** 発送できる状態か（送付先あり・発送特典あり・メンバー未選択なし） */
export function isShippable(s: SubmissionWithRewards): boolean {
  return (
    s.status !== "invalid" &&
    s.status !== "on_hold" &&
    !!s.full_name &&
    !!s.postal_code &&
    !!s.address1 &&
    shippingItems(s).length > 0 &&
    !hasMissingMember(s)
  );
}

export function toShippingRow(s: SubmissionWithRewards): ShippingRow {
  return {
    receipt_no: s.receipt_no,
    ticket_number: s.ticket_number,
    nickname: s.nickname,
    email: s.email,
    full_name: s.full_name ?? "",
    phone: s.phone ?? "",
    postal_code: s.postal_code ?? "",
    address1: s.address1 ?? "",
    address2: s.address2 ?? "",
    items: shippingItems(s),
  };
}
