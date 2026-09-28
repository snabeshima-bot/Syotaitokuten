import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { loadEventBundle } from "@/lib/events";
import { effectiveCount, loadSubmissions } from "@/lib/admin-data";
import { Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { STATUS_TONES, SUBMISSION_STATUS_LABELS, DELIVERY_LABELS } from "@/lib/types";
import { formatJst } from "@/lib/datetime";
import { formatPostalCode, formatReceiptNo } from "@/lib/normalize";
import { confirmCount, updateSubmission } from "../../submission-actions";

export default async function SubmissionDetail({ params }: PageProps<"/admin/events/[id]/submissions/[sid]">) {
  const { id, sid } = await params;
  const { supabase } = await requireStaff();
  const [bundle, [s]] = await Promise.all([loadEventBundle(supabase, { id }), loadSubmissions(supabase, id, { ids: [sid] })]);
  if (!bundle || !s) notFound();

  const { data: others } = s.email || s.phone
    ? await supabase
        .from("submissions")
        .select("id, receipt_no, ticket_number, nickname")
        .eq("event_id", id)
        .neq("id", s.id)
        .or([s.email ? `email.ilike.${s.email.replace(/[,()]/g, "")}` : "", s.phone ? `phone.eq.${s.phone.replace(/[,()]/g, "")}` : ""].filter(Boolean).join(","))
    : { data: [] };

  return (
    <div className="space-y-4">
      <Link href={`/admin/events/${id}`} className="text-sm text-gray-600 hover:underline">
        ← 回答一覧
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-2xl font-bold">{formatReceiptNo(s.receipt_no)}</h2>
        <Badge tone={STATUS_TONES[s.status]}>{SUBMISSION_STATUS_LABELS[s.status]}</Badge>
        {s.duplicate_suspected && <Badge tone="red">重複の疑い</Badge>}
        <span className="text-xs text-gray-500">受付 {formatJst(s.created_at)} ・ 更新 {formatJst(s.updated_at)}</span>
      </div>

      {s.purged_at && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">保存期間を過ぎたため、送付先と連絡先は削除済みです（{formatJst(s.purged_at)}）。</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3">
            <h3 className="font-bold">招待人数の確認</h3>
            <p className="text-sm">
              申告: <b>{s.claimed_count}人</b> ／ 確定: <b>{s.confirmed_count === null ? "未確認" : `${s.confirmed_count}人`}</b>
            </p>
            <ActionForm action={confirmCount} className="space-y-3">
              <input type="hidden" name="event_id" value={id} />
              <input type="hidden" name="submission_id" value={s.id} />
              <Field label="確定人数" hint="変えると特典が組み直されます。空欄にすると申告人数に戻ります">
                <Input name="confirmed_count" type="number" min={0} defaultValue={s.confirmed_count ?? s.claimed_count} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="mark_verified" defaultChecked={s.status === "received"} />
                状態を「人数確認済」にする
              </label>
              <SubmitButton>確定する</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="space-y-2">
            <h3 className="font-bold">特典（{effectiveCount(s)}人で計算）</h3>
            <ul className="space-y-1 text-sm">
              {s.rewards.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2">
                  <span>
                    <span className="mr-2 text-xs font-bold text-brand-600">{r.tier.min_count}人〜</span>
                    {r.tier.name}
                    {r.tier.requires_member && (
                      <span className={r.member ? "ml-1" : "ml-1 font-bold text-amber-700"}>（{r.member?.name ?? "未選択"}）</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs whitespace-nowrap text-gray-500">{DELIVERY_LABELS[r.tier.delivery]}</span>
                </li>
              ))}
            </ul>
          </Card>

          {s.shipment && (
            <Card className="space-y-1 text-sm">
              <h3 className="font-bold">発送</h3>
              <p>発送日: {formatJst(s.shipment.shipped_at, false)}</p>
              {s.shipment.carrier && <p>配送方法: {s.shipment.carrier}</p>}
              {s.shipment.tracking_number && <p>追跡番号: {s.shipment.tracking_number}</p>}
              <p>完了メール: {s.shipment.notified_at ? formatJst(s.shipment.notified_at) : "未送信"}</p>
            </Card>
          )}

          {others && others.length > 0 && (
            <Card className="space-y-2">
              <h3 className="font-bold text-red-700">同じメール・電話の回答</h3>
              <ul className="space-y-1 text-sm">
                {others.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/events/${id}/submissions/${o.id}`} className="font-mono text-brand-700 hover:underline">
                      {formatReceiptNo(o.receipt_no)}
                    </Link>{" "}
                    {o.ticket_number} / {o.nickname}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card>
          <ActionForm action={updateSubmission} className="space-y-4">
            <input type="hidden" name="event_id" value={id} />
            <input type="hidden" name="submission_id" value={s.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="状態">
                <Select name="status" defaultValue={s.status}>
                  {Object.entries(SUBMISSION_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" name="duplicate_suspected" defaultChecked={s.duplicate_suspected} />
                重複の疑い
              </label>
              <Field label="チケット番号">
                <Input value={s.ticket_number} readOnly className="bg-gray-50" />
              </Field>
              <Field label="ニックネーム">
                <Input name="nickname" defaultValue={s.nickname} required />
              </Field>
              <Field label="メールアドレス">
                <Input name="email" type="email" defaultValue={s.email ?? ""} />
              </Field>
              <Field label="電話番号">
                <Input name="phone" defaultValue={s.phone ?? ""} />
              </Field>
              <Field label="お名前（フルネーム）">
                <Input name="full_name" defaultValue={s.full_name ?? ""} />
              </Field>
              <Field label="郵便番号">
                <Input name="postal_code" defaultValue={formatPostalCode(s.postal_code)} />
              </Field>
              <Field label="住所">
                <Input name="address1" defaultValue={s.address1 ?? ""} />
              </Field>
              <Field label="番地・建物名">
                <Input name="address2" defaultValue={s.address2 ?? ""} />
              </Field>
            </div>
            {s.rewards.some((r) => r.tier.requires_member) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {s.rewards
                  .filter((r) => r.tier.requires_member)
                  .map((r) => (
                    <Field key={r.id} label={`${r.tier.name} の希望メンバー`}>
                      <Select name={`reward_${r.id}`} defaultValue={r.member_id ?? ""}>
                        <option value="">未選択</option>
                        {bundle.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
              </div>
            )}
            <Field label="スタッフメモ">
              <Textarea name="staff_note" rows={3} defaultValue={s.staff_note} />
            </Field>
            <SubmitButton>保存</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
