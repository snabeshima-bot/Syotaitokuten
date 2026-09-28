import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isShippable, loadSubmissions } from "@/lib/admin-data";

/** 発送対象: 人数確認済・発送準備で、送付先と発送特典がそろっている回答 */
export async function loadShippingTargets(supabase: SupabaseClient, eventId: string) {
  const list = await loadSubmissions(supabase, eventId, { statuses: ["verified", "preparing"] });
  return list.filter(isShippable);
}
