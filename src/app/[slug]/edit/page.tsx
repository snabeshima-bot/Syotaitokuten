import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPiiFields, hashEditToken } from "@/lib/crypto";
import { loadEventBundle } from "@/lib/events";
import { formatPostalCode, formatReceiptNo } from "@/lib/normalize";
import type { RewardTier, Submission } from "@/lib/types";
import { EditForm } from "./edit-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "招待特典の修正", referrer: "no-referrer" };

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-700 shadow-sm">{children}</div>
    </main>
  );
}

export default async function EditPage({ params, searchParams }: PageProps<"/[slug]/edit">) {
  const { slug } = await params;
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 40) return <Message>このリンクは無効です。</Message>;

  const supabase = createAdminClient();
  const bundle = await loadEventBundle(supabase, { slug });
  const { data } = await supabase
    .from("submissions")
    .select("*, rewards:submission_rewards(id, tier_id, member_id)")
    .eq("edit_token_hash", hashEditToken(token))
    .maybeSingle();
  const row = data as (Submission & { rewards: { id: string; tier_id: string; member_id: string | null }[] }) | null;
  if (!bundle || !row || row.event_id !== bundle.event.id || row.purged_at || !row.edit_token_expires_at || new Date(row.edit_token_expires_at) < new Date()) {
    return <Message>このリンクは無効か、有効期限が切れています。</Message>;
  }
  const { event, tiers, members } = bundle;
  const closed = event.status !== "open" || (event.closes_at && new Date() > new Date(event.closes_at));
  if (closed || !["received", "verified"].includes(row.status)) {
    return <Message>受付が終了したか、発送の準備に入ったため、この画面からは修正できません。必要な場合はスタッフにお問い合わせください。</Message>;
  }

  const s = decryptPiiFields(row);
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const rewards = row.rewards
    .map((r) => ({ ...r, tier: tierById.get(r.tier_id) }))
    .filter((r): r is typeof r & { tier: RewardTier } => !!r.tier)
    .sort((a, b) => a.tier.min_count - b.tier.min_count);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-6">
      <EditForm
        token={token}
        title={event.title}
        receiptNo={formatReceiptNo(s.receipt_no)}
        nickname={s.nickname}
        rewards={rewards.map((r) => ({ tier: r.tier, memberId: r.member_id }))}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        needsAddress={rewards.some((r) => r.tier.delivery === "ship")}
        address={{
          full_name: s.full_name ?? "",
          phone: s.phone ?? "",
          postal_code: formatPostalCode(s.postal_code),
          address1: s.address1 ?? "",
          address2: s.address2 ?? "",
        }}
      />
    </main>
  );
}
