"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, Select } from "@/components/ui";
import { SUBMISSION_STATUS_LABELS, type SubmissionStatus } from "@/lib/types";
import { bulkUpdateStatus } from "./submission-actions";

export type SubmissionRow = {
  id: string;
  receiptNo: string;
  ticket: string;
  nickname: string;
  claimed: number;
  confirmed: number | null;
  effective: number;
  status: SubmissionStatus;
  statusLabel: string;
  tone: "gray" | "pink" | "green" | "amber" | "red" | "blue";
  duplicate: boolean;
  missingMember: boolean;
  items: string[];
  createdAt: string;
};

export function SubmissionTable({ eventId, rows }: { eventId: string; rows: SubmissionRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SubmissionStatus>("verified");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">{selected.size} 件を選択中</span>
        <Select value={status} onChange={(e) => setStatus(e.target.value as SubmissionStatus)} className="w-36">
          {Object.entries(SUBMISSION_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={pending || selected.size === 0}
          onClick={() =>
            startTransition(async () => {
              const r = await bulkUpdateStatus([...selected], eventId, status);
              setMessage(r?.message ?? null);
              if (r?.ok) setSelected(new Set());
            })
          }
        >
          状態をまとめて変更
        </Button>
        {message && <span className="text-emerald-700">{message}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  aria-label="すべて選択"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              <th className="p-2">受付番号</th>
              <th className="p-2">チケット番号</th>
              <th className="p-2">ニックネーム</th>
              <th className="p-2">人数（申告→確定）</th>
              <th className="p-2">特典</th>
              <th className="p-2">状態</th>
              <th className="p-2">受付日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? "bg-brand-50" : undefined}>
                <td className="p-2">
                  <input type="checkbox" aria-label={`${r.receiptNo} を選択`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="p-2 font-mono">
                  <Link href={`/admin/events/${eventId}/submissions/${r.id}`} className="text-brand-700 hover:underline">
                    {r.receiptNo}
                  </Link>
                </td>
                <td className="p-2 font-mono">{r.ticket}</td>
                <td className="p-2">{r.nickname}</td>
                <td className="p-2 whitespace-nowrap">
                  {r.claimed}人
                  {r.confirmed === null ? (
                    <span className="ml-1 text-xs text-amber-700">未確認</span>
                  ) : (
                    <span className={r.confirmed === r.claimed ? "ml-1 text-gray-500" : "ml-1 font-bold text-red-600"}>→ {r.confirmed}人</span>
                  )}
                </td>
                <td className="p-2 text-xs text-gray-700">{r.items.join(" / ")}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={r.tone}>{r.statusLabel}</Badge>
                    {r.duplicate && <Badge tone="red">重複?</Badge>}
                    {r.missingMember && <Badge tone="amber">メンバー未選択</Badge>}
                  </div>
                </td>
                <td className="p-2 text-xs whitespace-nowrap text-gray-500">{r.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
