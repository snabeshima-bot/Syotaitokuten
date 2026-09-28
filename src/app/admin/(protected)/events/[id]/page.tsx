import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { loadEventBundle } from "@/lib/events";
import { effectiveCount, hasMissingMember, loadSubmissions } from "@/lib/admin-data";
import { Input, Select } from "@/components/ui";
import { STATUS_TONES, SUBMISSION_STATUS_LABELS, type SubmissionStatus } from "@/lib/types";
import { formatJst } from "@/lib/datetime";
import { formatReceiptNo } from "@/lib/normalize";
import { SubmissionTable } from "./submission-table";


export default async function SubmissionsPage({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const status = one("status");
  const q = one("q").trim().toLowerCase();
  const memberId = one("member");
  const flag = one("flag");

  const { supabase } = await requireStaff();
  const bundle = await loadEventBundle(supabase, { id });
  const all = await loadSubmissions(supabase, id);
  const list = all.filter((s) => {
    if (status && s.status !== status) return false;
    if (memberId && !s.rewards.some((r) => r.member_id === memberId)) return false;
    if (flag === "duplicate" && !s.duplicate_suspected) return false;
    if (flag === "missing_member" && !hasMissingMember(s)) return false;
    if (flag === "unconfirmed" && s.confirmed_count !== null) return false;
    if (q) {
      const hay = [formatReceiptNo(s.receipt_no), s.ticket_number, s.nickname, s.email, s.full_name, s.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const counts = Object.fromEntries(
    (Object.keys(SUBMISSION_STATUS_LABELS) as SubmissionStatus[]).map((k) => [k, all.filter((s) => s.status === k).length]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/admin/events/${id}`} className="rounded-full bg-white px-3 py-1 shadow-sm">
          すべて {all.length}
        </Link>
        {(Object.keys(SUBMISSION_STATUS_LABELS) as SubmissionStatus[]).map((k) => (
          <Link key={k} href={`/admin/events/${id}?status=${k}`} className="rounded-full bg-white px-3 py-1 shadow-sm">
            {SUBMISSION_STATUS_LABELS[k]} {counts[k]}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="受付番号・チケット番号・名前・メール・電話" className="w-72" />
        <Select name="status" defaultValue={status} className="w-36">
          <option value="">状態: すべて</option>
          {Object.entries(SUBMISSION_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select name="member" defaultValue={memberId} className="w-40">
          <option value="">メンバー: すべて</option>
          {bundle?.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select name="flag" defaultValue={flag} className="w-44">
          <option value="">絞り込みなし</option>
          <option value="unconfirmed">人数が未確認</option>
          <option value="duplicate">重複の疑い</option>
          <option value="missing_member">メンバー未選択あり</option>
        </Select>
        <button className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white">絞り込む</button>
      </form>

      <SubmissionTable
        eventId={id}
        rows={list.map((s) => ({
          id: s.id,
          receiptNo: formatReceiptNo(s.receipt_no),
          ticket: s.ticket_number,
          nickname: s.nickname,
          claimed: s.claimed_count,
          confirmed: s.confirmed_count,
          effective: effectiveCount(s),
          status: s.status,
          statusLabel: SUBMISSION_STATUS_LABELS[s.status],
          tone: STATUS_TONES[s.status],
          duplicate: s.duplicate_suspected,
          missingMember: hasMissingMember(s),
          items: s.rewards.map((r) => (r.tier.requires_member ? `${r.tier.name}（${r.member?.name ?? "未選択"}）` : r.tier.name)),
          createdAt: formatJst(s.created_at),
        }))}
      />
      {list.length === 0 && <p className="text-sm text-gray-500">該当する回答はありません。</p>}
    </div>
  );
}
