import { requireStaff } from "@/lib/auth";
import { loadEventBundle } from "@/lib/events";
import { effectiveCount, loadSubmissions } from "@/lib/admin-data";
import { Card } from "@/components/ui";
import { DELIVERY_LABELS } from "@/lib/types";

export default async function SummaryPage({ params }: PageProps<"/admin/events/[id]/summary">) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const [bundle, submissions] = await Promise.all([loadEventBundle(supabase, { id }), loadSubmissions(supabase, id)]);
  if (!bundle) return null;
  const valid = submissions.filter((s) => s.status !== "invalid");

  // 特典 × メンバー
  const qty = new Map<string, number>();
  for (const s of valid) {
    for (const r of s.rewards) {
      const key = `${r.tier_id}:${r.member_id ?? ""}`;
      qty.set(key, (qty.get(key) ?? 0) + 1);
    }
  }
  const get = (tierId: string, memberId: string) => qty.get(`${tierId}:${memberId}`) ?? 0;

  // 招待人数の分布（確定があれば確定人数）
  const byCount = new Map<number, number>();
  valid.forEach((s) => byCount.set(effectiveCount(s), (byCount.get(effectiveCount(s)) ?? 0) + 1));
  const totalInvited = valid.reduce((sum, s) => sum + effectiveCount(s), 0);
  const unconfirmed = valid.filter((s) => s.confirmed_count === null).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="回答（無効を除く）" value={`${valid.length} 件`} />
        <Stat label="招待人数の合計" value={`${totalInvited} 人`} />
        <Stat label="人数が未確認" value={`${unconfirmed} 件`} />
      </div>

      <Card className="space-y-3 overflow-x-auto">
        <div>
          <h2 className="font-bold">特典の必要数</h2>
          <p className="text-xs text-gray-500">無効以外の回答から集計しています。制作・発注の数の目安にしてください。</p>
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="p-2">特典</th>
              <th className="p-2">受け渡し</th>
              {bundle.members.map((m) => (
                <th key={m.id} className="p-2 text-right">
                  {m.name}
                </th>
              ))}
              <th className="p-2 text-right text-amber-700">未選択</th>
              <th className="p-2 text-right">合計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bundle.tiers.map((t) => {
              const total = [...qty.entries()].filter(([k]) => k.startsWith(`${t.id}:`)).reduce((a, [, v]) => a + v, 0);
              return (
                <tr key={t.id}>
                  <td className="p-2">
                    <span className="mr-2 text-xs font-bold text-brand-600">{t.min_count}人〜</span>
                    {t.name}
                  </td>
                  <td className="p-2 text-xs text-gray-500">{DELIVERY_LABELS[t.delivery]}</td>
                  {bundle.members.map((m) => (
                    <td key={m.id} className="p-2 text-right tabular-nums">
                      {t.requires_member ? get(t.id, m.id) || "" : ""}
                    </td>
                  ))}
                  <td className="p-2 text-right text-amber-700 tabular-nums">{t.requires_member ? get(t.id, "") || "" : ""}</td>
                  <td className="p-2 text-right font-bold tabular-nums">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">招待人数の分布</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {[...byCount.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([count, n]) => (
              <li key={count} className="rounded-lg bg-gray-50 px-3 py-2">
                {count}人: <b>{n}</b> 件
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}
