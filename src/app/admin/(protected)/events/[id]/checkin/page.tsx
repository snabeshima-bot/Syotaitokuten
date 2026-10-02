import { requireStaff } from "@/lib/auth";
import { loadEventBundle } from "@/lib/events";
import { countChoices } from "@/lib/rewards";
import { CheckinDesk } from "./checkin-desk";

export default async function CheckinPage({ params }: PageProps<"/admin/events/[id]/checkin">) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const bundle = await loadEventBundle(supabase, { id });
  if (!bundle) return null;
  return <CheckinDesk eventId={id} choices={countChoices(bundle.tiers)} />;
}
