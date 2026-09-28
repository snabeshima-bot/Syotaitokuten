import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { hasMissingMember, isShippable, loadSubmissions } from "@/lib/admin-data";
import { Card, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EXPORT_FORMATS } from "@/lib/shipping";
import { importTracking, markPreparing, markShippedWithoutTracking, sendShippedMails } from "./shipping-actions";

export default async function ShippingPage({ params }: PageProps<"/admin/events/[id]/shipping">) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const all = await loadSubmissions(supabase, id);
  const active = all.filter((s) => s.status === "verified" || s.status === "preparing");
  const targets = active.filter(isShippable);
  const verified = targets.filter((s) => s.status === "verified").length;
  const preparing = targets.filter((s) => s.status === "preparing").length;
  const unconfirmed = all.filter((s) => s.status === "received").length;
  const missingMember = active.filter(hasMissingMember).length;
  const noAddress = active.filter((s) => !hasMissingMember(s) && !isShippable(s)).length;
  const unnotified = all.filter((s) => s.status === "shipped" && s.shipment && !s.shipment.notified_at && s.email).length;
  const base = `/admin/events/${id}/shipping`;

  return (
    <div className="space-y-4">
      <Card className="space-y-2 text-sm">
        <h2 className="font-bold">発送の状況</h2>
        <p>
          発送対象 <b>{targets.length}</b> 件（人数確認済 {verified} ／ 発送準備 {preparing}）
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-gray-600">
          {unconfirmed > 0 && (
            <li>
              人数が未確認の回答が {unconfirmed} 件あります（<Link className="text-brand-700 underline" href={`/admin/events/${id}?status=received`}>確認する</Link>）。確認するまで発送対象になりません。
            </li>
          )}
          {missingMember > 0 && (
            <li className="text-amber-700">
              希望メンバーが未選択の回答が {missingMember} 件あります（<Link className="underline" href={`/admin/events/${id}?flag=missing_member`}>確認する</Link>）。
            </li>
          )}
          {noAddress > 0 && <li>送付先がない、または発送する特典がない回答が {noAddress} 件あります（対象外）。</li>}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="font-bold">1. 発送準備にする</h3>
          <p className="text-xs text-gray-500">「人数確認済」の発送対象を「発送準備」にします。この時点以降の回答と区別できます。</p>
          <ActionForm action={markPreparing}>
            <input type="hidden" name="event_id" value={id} />
            <SubmitButton variant="secondary" disabled={verified === 0}>
              {verified} 件を発送準備にする
            </SubmitButton>
          </ActionForm>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-bold">2. 宛名データを出力する</h3>
          <p className="text-xs text-gray-500">発送対象（人数確認済・発送準備）を出力します。</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(EXPORT_FORMATS).map(([k, label]) => (
              <a key={k} href={`${base}/export?format=${k}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
                CSV: {label}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/print?mode=labels`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
              宛名ラベルを印刷（A4 12面）
            </Link>
            <Link href={`${base}/print?mode=picking`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
              ピッキングリストを印刷
            </Link>
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-bold">3. 追跡番号を取り込む</h3>
          <p className="text-xs text-gray-500">
            1行目に「受付番号」「追跡番号（お問い合わせ番号）」の列があるCSV。見出しがない場合は 1列目=受付番号、2列目=追跡番号 として読みます。取り込んだ回答は「発送済」になります。
          </p>
          <ActionForm action={importTracking} className="space-y-2">
            <input type="hidden" name="event_id" value={id} />
            <input type="file" name="file" accept=".csv,text/csv" className="block text-sm" required />
            <Input name="carrier" placeholder="配送方法（CSVにない場合）例: クリックポスト" />
            <SubmitButton>取り込む</SubmitButton>
          </ActionForm>
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">追跡番号なしで発送済にする</summary>
            <ActionForm action={markShippedWithoutTracking} className="mt-2 space-y-2" confirm={`「発送準備」の ${preparing} 件を発送済にしますか？`}>
              <input type="hidden" name="event_id" value={id} />
              <Input name="carrier" placeholder="配送方法 例: 定形郵便" />
              <SubmitButton variant="secondary" disabled={preparing === 0}>
                発送準備の {preparing} 件を発送済にする
              </SubmitButton>
            </ActionForm>
          </details>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-bold">4. 発送完了メールを送る</h3>
          <p className="text-xs text-gray-500">発送済で、まだ完了メールを送っていない回答に送ります。</p>
          <ActionForm action={sendShippedMails} confirm={`${unnotified} 件にメールを送信しますか？`}>
            <input type="hidden" name="event_id" value={id} />
            <SubmitButton disabled={unnotified === 0}>{unnotified} 件に送信する</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
