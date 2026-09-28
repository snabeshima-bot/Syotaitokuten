import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/auth";
import { loadEventBundle } from "@/lib/events";
import { env } from "@/lib/env";
import { isoToJstInput } from "@/lib/datetime";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DELIVERY_LABELS, EVENT_STATUS_LABELS, type Member, type RewardTier } from "@/lib/types";
import { deleteTier, saveTier, setEventMembers, updateEvent, uploadEventImage } from "../../../actions";

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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
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

        <Card className="space-y-3">
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

        <Card className="space-y-3">
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

      <Card className="space-y-4 lg:col-span-2">
        <div>
          <h2 className="font-bold">特典（段）</h2>
          <p className="text-xs text-gray-500">
            招待した人数の選択肢は、ここで登録した「必要人数」になります。上の段に届くと下の段の特典もすべてもらえます。
          </p>
        </div>
        <div className="space-y-3">
          {tiers.map((t) => (
            <TierForm key={t.id} eventId={event.id} tier={t} />
          ))}
          <TierForm eventId={event.id} tier={null} nextOrder={(tiers.at(-1)?.sort_order ?? 0) + 1} />
        </div>
      </Card>
    </div>
  );
}

function TierForm({ eventId, tier, nextOrder = 0 }: { eventId: string; tier: RewardTier | null; nextOrder?: number }) {
  return (
    <div className={tier ? "rounded-lg border border-gray-200 p-3" : "rounded-lg border-2 border-dashed border-brand-200 p-3"}>
      <ActionForm action={saveTier}>
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="id" value={tier?.id ?? ""} />
        <div className="grid gap-2 md:grid-cols-[90px_1fr_1fr_130px_120px_70px_auto] md:items-end">
          <Field label="必要人数">
            <Input name="min_count" type="number" min={1} defaultValue={tier?.min_count} required />
          </Field>
          <Field label="特典名">
            <Input name="name" defaultValue={tier?.name} required placeholder={tier ? "" : "新しい特典"} />
          </Field>
          <Field label="説明">
            <Input name="description" defaultValue={tier?.description} />
          </Field>
          <Field label="受け渡し">
            <Select name="delivery" defaultValue={tier?.delivery ?? "ship"}>
              {Object.entries(DELIVERY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 pb-3 text-sm">
            <input type="checkbox" name="requires_member" defaultChecked={tier?.requires_member ?? true} />
            メンバーを選ぶ
          </label>
          <Field label="並び順">
            <Input name="sort_order" type="number" defaultValue={tier?.sort_order ?? nextOrder} />
          </Field>
          <SubmitButton variant={tier ? "secondary" : "primary"}>{tier ? "保存" : "追加"}</SubmitButton>
        </div>
      </ActionForm>
      {tier && (
        <ActionForm action={deleteTier} confirm={`「${tier.name}」を削除しますか？`} className="mt-1">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="id" value={tier.id} />
          <button className="text-xs text-red-600 hover:underline">削除</button>
        </ActionForm>
      )}
    </div>
  );
}
