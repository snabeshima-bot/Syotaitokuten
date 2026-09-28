import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow, Member, RewardTier } from "./types";
import { sortTiers } from "./rewards";

export type EventBundle = {
  event: EventRow;
  tiers: RewardTier[];
  members: Member[];
};

/** 公演・段・選べるメンバーをまとめて読む */
export async function loadEventBundle(
  supabase: SupabaseClient,
  by: { slug: string } | { id: string },
): Promise<EventBundle | null> {
  const query = supabase.from("events").select("*");
  const { data: event } = await ("slug" in by ? query.eq("slug", by.slug) : query.eq("id", by.id)).maybeSingle<EventRow>();
  if (!event) return null;
  const [{ data: tiers }, { data: em }] = await Promise.all([
    supabase.from("reward_tiers").select("*").eq("event_id", event.id),
    supabase
      .from("event_members")
      .select("sort_order, members(*)")
      .eq("event_id", event.id)
      .order("sort_order"),
  ]);
  const members = ((em ?? []) as unknown as { members: Member }[]).map((r) => r.members).filter(Boolean);
  return { event, tiers: sortTiers((tiers ?? []) as RewardTier[]), members };
}

export function isAccepting(event: EventRow, now = new Date()): boolean {
  if (event.status !== "open") return false;
  if (event.opens_at && now < new Date(event.opens_at)) return false;
  if (event.closes_at && now > new Date(event.closes_at)) return false;
  return true;
}

export function rewardLabel(tier: Pick<RewardTier, "name">, memberName?: string | null): string {
  return memberName ? `${tier.name}（${memberName}）` : tier.name;
}
