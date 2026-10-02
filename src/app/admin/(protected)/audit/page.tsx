import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Card } from "@/components/ui";
import { formatJst } from "@/lib/datetime";

const ACTION_LABELS: Record<string, string> = {
  "submission.reveal": "個人情報を表示",
  "submission.update": "回答を編集",
  "submission.confirm_count": "人数を確定",
  "submission.bulk_status": "状態をまとめて変更",
  "shipping.export": "宛名CSVを出力",
  "shipping.print_labels": "宛名ラベルを印刷",
  "shipping.print_picking": "ピッキングリストを印刷",
  "shipping.import_tracking": "追跡番号を取り込み",
  "shipping.mark_preparing": "発送準備にする",
  "shipping.mark_shipped": "発送済にする",
  "shipping.send_mails": "発送完了メールを送信",
  "event.create": "公演を作成",
  "event.update": "公演を編集",
  "event.image": "告知画像を変更",
  "event.members": "メンバーを変更",
  "tier.create": "特典を追加",
  "tier.update": "特典を編集",
  "tier.delete": "特典を削除",
  "tiers.save": "特典をまとめて保存",
  "member.create": "メンバーを追加",
  "member.update": "メンバーを編集",
  purge_personal_data: "個人情報の自動削除",
};

/** 個人情報に関わる操作（強調表示する） */
const SENSITIVE = new Set(["submission.reveal", "shipping.export", "shipping.print_labels", "purge_personal_data"]);

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { only } = await searchParams;
  const { supabase } = await requireStaff();
  let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (only === "pii") query = query.in("action", [...SENSITIVE]);
  const [{ data: logs }, { data: staff }] = await Promise.all([query, supabase.from("staff").select("user_id, display_name")]);
  const nameOf = new Map((staff ?? []).map((s) => [s.user_id, s.display_name || "（名前未設定）"]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">操作ログ</h1>
        <Link href="/admin/audit" className="text-sm text-brand-700 underline">すべて</Link>
        <Link href="/admin/audit?only=pii" className="text-sm text-brand-700 underline">個人情報に関わる操作だけ</Link>
      </div>
      <p className="text-xs text-gray-500">最新300件。ログは追記のみで、画面からは消せません。</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="p-2">日時</th>
              <th className="p-2">スタッフ</th>
              <th className="p-2">操作</th>
              <th className="p-2">対象</th>
              <th className="p-2">内容</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(logs ?? []).map((l) => (
              <tr key={l.id} className={SENSITIVE.has(l.action) ? "bg-amber-50" : undefined}>
                <td className="p-2 whitespace-nowrap text-gray-600">{formatJst(l.created_at)}</td>
                <td className="p-2">{l.staff_user_id ? (nameOf.get(l.staff_user_id) ?? "（削除済み）") : "システム"}</td>
                <td className="p-2">{ACTION_LABELS[l.action] ?? l.action}</td>
                <td className="p-2 font-mono text-xs text-gray-500">
                  {l.target_type}
                  {l.target_id ? `:${String(l.target_id).slice(0, 8)}` : ""}
                </td>
                <td className="max-w-xs truncate p-2 font-mono text-xs text-gray-500">{JSON.stringify(l.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
