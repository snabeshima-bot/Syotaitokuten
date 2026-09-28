import type { RewardTier } from "./types";

/** 招待人数で受け取れる特典（累積）。必要人数の昇順 */
export function eligibleTiers<T extends Pick<RewardTier, "min_count" | "sort_order">>(
  tiers: T[],
  count: number,
): T[] {
  return sortTiers(tiers).filter((t) => t.min_count <= count);
}

export function sortTiers<T extends Pick<RewardTier, "min_count" | "sort_order">>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.min_count - b.min_count || a.sort_order - b.sort_order);
}

/** フォームで選べる「招待した人数」の選択肢（段の必要人数） */
export function countChoices(tiers: Pick<RewardTier, "min_count">[]): number[] {
  return [...new Set(tiers.map((t) => t.min_count))].sort((a, b) => a - b);
}

/** 発送が必要な特典を含むか */
export function needsShipping(tiers: Pick<RewardTier, "delivery">[]): boolean {
  return tiers.some((t) => t.delivery === "ship");
}

/** 招待人数に対して、希望メンバーの選択が必要な特典 */
export function tiersRequiringMember<T extends RewardTier>(tiers: T[], count: number): T[] {
  return eligibleTiers(tiers, count).filter((t) => t.requires_member);
}
