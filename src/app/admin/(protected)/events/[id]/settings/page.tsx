import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/auth";
import { loadEventBundle } from "@/lib/events";
import { env } from "@/lib/env";
import { isoToJstInput } from "@/lib/datetime";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EVENT_STATUS_LABELS, type Member } from "@/lib/types";
import { setEventMembers, setEventStatus, updateEvent, uploadEventImage } from "../../../actions";
import { TierEditor } from "./tier-editor";

export default async function SettingsPage({ params }: PageProps<"/admin/events/[id]/settings">) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const bundle = await loadEventBundle(supabase, { id });
  if (!bundle) notFound();
  const { event, tiers, members } = bundle;
  const { data: allMembers } = await supabase.from("members").select("*").order("group_name").order("sort_order");
  const selected = new Set(members.map((m) => m.id));
  const url = `${env.appUrl}/${event.slug}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, width: 180 });

  const needsMembers = tiers.some((t) => t.requires_member);
  const checks = [
    { ok: tiers.length > 0, label: "特典（段）を登録する", href: "#tiers" },
    { ok: !needsMembers || members.length > 0, label: "選べるメンバーを選ぶ", href: "#members" },
    { ok: !!event.image_url, label: "告知画像を登録する（任意）", href: "#image", optional: true },
    { ok: !!event.event_date, label: "公演日を入れる（個人情報の削除日の計算に使います）", href: "#basic" },
  ];
  const ready = checks.every((c) => c.ok || c.optional);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3 lg:col-span-2">
        <h2 className="font-bold">公開までのチェックリスト</h2>
        <ul className="space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className={c.ok ? "text-emerald-600" : c.optional ? "text-gray-400" : "text-amber-600"} aria-hidden>
                {c.ok ? "✓" : "○"}
              </span>
              <a href={c.href} className={c.ok ? "text-gray-500" : "font-semibold underline"}>
                {c.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/${event.slug}?preview=1`} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            お客様の画面をプレビュー
          </a>
          <ActionForm action={setEventStatus}>
            <input type="hidden" name="id" value={event.id} />
            {event.status === "open" ? (
              <>
                <input type="hidden" name="status" value="closed" />
                <SubmitButton variant="secondary">受付を終了する</SubmitButton>
              </>
            ) : (
              <>
                <input type="hidden" name="status" value="open" />
                <SubmitButton disabled={!ready}>受付を開始する</SubmitButton>
              </>
            )}
          </ActionForm>
          <span className="text-sm text-gray-600">いまの状態: {EVENT_STATUS_LABELS[event.status]}</span>
        </div>
      </Card>

      <Card className="scroll-mt-4 space-y-4" id="basic">
        <h2 className="font-bold">基本情報</h2>
        <ActionForm action={updateEvent} className="space-y-4">
          <input type="hidden" name="id" value={event.id} />
          <Field label="公演名" required htmlFor="title">
            <Input id="title" name="title" defaultValue={event.title} required />
          </Field>
          <Field label="URL名" required htmlFor="slug" hint="受付が始まったあとに変えると、配ったQRコードが使えなくなります">
            <Input id="slug" name="slug" defaultValue={event.slug} required pattern="[a-z0-9][a-z0-9\-]{1,62}" />
          </Field>
          <Field label="フォームの説明文" htmlFor="description">
            <Textarea id="description" name="description" rows={3} defaultValue={event.description} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="状態" htmlFor="status">
              <Select id="status" name="status" defaultValue={event.status}>
                {Object.entries(EVENT_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="公演日" htmlFor="event_date">
              <Input id="event_date" name="event_date" type="date" defaultValue={event.event_date ?? ""} />
            </Field>
            <Field label="受付開始（任意）" htmlFor="opens_at">
              <Input id="opens_at" name="opens_at" type="datetime-local" defaultValue={isoToJstInput(event.opens_at)} />
            </Field>
            <Field label="受付終了（任意）" htmlFor="closes_at">
              <Input id="closes_at" name="closes_at" type="datetime-local" defaultValue={isoToJstInput(event.closes_at)} />
            </Field>
          </div>
          <Field label="個人情報の保存期間（公演日からの日数）" htmlFor="retention_days" hint="過ぎると送付先・電話・メールを自動で消します">
            <Input id="retention_days" name="retention_days" type="number" min={0} defaultValue={event.retention_days} />
          </Field>
          <SubmitButton>保存</SubmitButton>
        </ActionForm>
      </Card>

      <div className="space-y-6">
        <Card className="space-y-3">
          <h2 className="font-bold">受付URLとQRコード</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="space-y-2 text-sm">
              <p className="font-mono break-all">{url}</p>
              <a className="inline-block rounded-lg border border-gray-300 px-3 py-2 font-semibold hover:bg-gray-50" href={`/admin/events/${event.id}/qr`} download>
                QRコード（PNG）をダウンロード
              </a>
              {event.status !== "open" && <p className="text-xs text-amber-700">状態を「受付中」にすると回答を受け付けます。</p>}
            </div>
          </div>
        </Card>

        <Card className="scroll-mt-4 space-y-3" id="image">
          <h2 className="font-bold">告知画像</h2>
          {event.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.image_url} alt="" className="max-h-64 rounded-lg border" />
          )}
          <ActionForm action={uploadEventImage} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={event.id} />
            <input type="file" name="image" accept="image/*" className="text-sm" />
            <SubmitButton variant="secondary">アップロード</SubmitButton>
          </ActionForm>
          {event.image_url && (
            <ActionForm action={uploadEventImage}>
              <input type="hidden" name="id" value={event.id} />
              <input type="hidden" name="remove" value="1" />
              <SubmitButton variant="ghost">画像を外す</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card className="scroll-mt-4 space-y-3" id="members">
          <h2 className="font-bold">選べるメンバー</h2>
          <ActionForm action={setEventMembers} className="space-y-3">
            <input type="hidden" name="id" value={event.id} />
            <div className="grid grid-cols-2 gap-2">
              {((allMembers ?? []) as Member[]).map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="member_id" value={m.id} defaultChecked={selected.has(m.id)} />
                  {m.name}
                  {!m.active && <span className="text-xs text-gray-400">（卒業）</span>}
                </label>
              ))}
            </div>
            <SubmitButton variant="secondary">保存</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card className="scroll-mt-4 space-y-4 lg:col-span-2" id="tiers">
        <div>
          <h2 className="font-bold">特典（段）</h2>
          <p className="text-xs text-gray-500">
            招待した人数の選択肢は、ここで登録した「必要人数」になります。上の段に届くと下の段の特典もすべてもらえます。
          </p>
        </div>
        <TierEditor eventId={event.id} tiers={tiers} />
      </Card>
    </div>
  );
}
