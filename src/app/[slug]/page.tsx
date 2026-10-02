import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAccepting, loadEventBundle } from "@/lib/events";
import { isStaffSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { InvitationForm } from "./invitation-form";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return loadEventBundle(createAdminClient(), { slug });
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const bundle = await load((await params).slug);
  return { title: bundle && bundle.event.status !== "draft" ? bundle.event.title : "招待特典 受付" };
}

export default async function EventPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const bundle = await load(slug);
  if (!bundle) notFound();
  const { event, tiers, members } = bundle;
  // ?preview=1 は2段階認証済みのスタッフだけ。準備中・受付期間外でもフォームを確認できる（送信は不可）
  const isPreview = preview === "1" && (await isStaffSession());
  if (event.status === "draft" && !isPreview) notFound();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-6">
      {isPreview || isAccepting(event) ? (
        <InvitationForm
          slug={event.slug}
          title={event.title}
          description={event.description}
          imageUrl={event.image_url}
          tiers={tiers}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          turnstileSiteKey={env.turnstileSiteKey ?? null}
          privacy={{ organizerName: env.organizerName, contact: env.privacyContact, retentionDays: event.retention_days }}
          preview={isPreview}
        />
      ) : (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">{event.title}</h1>
          <p className="text-sm text-gray-600">
            {event.status === "open" && event.opens_at && new Date() < new Date(event.opens_at)
              ? "受付開始前です。開始までお待ちください。"
              : "この公演の受付は終了しました。"}
          </p>
        </div>
      )}
    </main>
  );
}
