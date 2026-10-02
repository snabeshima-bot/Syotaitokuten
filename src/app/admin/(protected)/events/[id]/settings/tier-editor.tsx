"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select, cx } from "@/components/ui";
import { DELIVERY_LABELS, type RewardTier } from "@/lib/types";
import { saveTiers, type TierDraft } from "../../../actions";

type Row = TierDraft & { key: string };

const toRow = (t: RewardTier): Row => ({
  key: t.id,
  id: t.id,
  min_count: t.min_count,
  name: t.name,
  description: t.description,
  requires_member: t.requires_member,
  delivery: t.delivery,
});

/** 特典（段）を表でまとめて編集する。行の追加・削除・並び替えをして最後に1回保存 */
export function TierEditor({ eventId, tiers }: { eventId: string; tiers: RewardTier[] }) {
  const [rows, setRows] = useState<Row[]>(tiers.map(toRow));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    setRows((rs) => {
      const next = [...rs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
    setDirty(true);
  };
  const add = () => {
    const last = rows.at(-1)?.min_count ?? 0;
    const suggestion = [1, 3, 5, 10, 15, 20, 30, 40, 50].find((n) => n > last) ?? last + 10;
    setRows((rs) => [
      ...rs,
      { key: `new-${Date.now()}`, min_count: suggestion, name: "", description: "", requires_member: true, delivery: "ship" },
    ]);
    setDirty(true);
  };
  const sortByCount = () => {
    setRows((rs) => [...rs].sort((a, b) => a.min_count - b.min_count));
    setDirty(true);
  };

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveTiers(
        eventId,
        rows.map(({ key: _key, ...r }) => {
          void _key;
          return { ...r, min_count: Number(r.min_count) };
        }),
      );
      if (r) setMessage({ ok: r.ok, text: r.message });
      if (r?.ok) setDirty(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="w-16 p-1">並び</th>
              <th className="w-24 p-1">必要人数</th>
              <th className="p-1">特典名</th>
              <th className="p-1">説明（任意）</th>
              <th className="w-28 p-1">受け渡し</th>
              <th className="w-24 p-1">メンバー選択</th>
              <th className="w-12 p-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="p-1">
                  <div className="flex gap-0.5">
                    <button type="button" className="rounded border px-1.5 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上へ">
                      ↑
                    </button>
                    <button type="button" className="rounded border px-1.5 disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="下へ">
                      ↓
                    </button>
                  </div>
                </td>
                <td className="p-1">
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} value={r.min_count} onChange={(e) => update(r.key, { min_count: Number(e.target.value) })} aria-label="必要人数" />
                    <span className="text-xs">人〜</span>
                  </div>
                </td>
                <td className="p-1">
                  <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="例: 2nd SMILE デコチェキ" aria-label="特典名" />
                </td>
                <td className="p-1">
                  <Input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} aria-label="説明" />
                </td>
                <td className="p-1">
                  <Select value={r.delivery} onChange={(e) => update(r.key, { delivery: e.target.value as Row["delivery"] })} aria-label="受け渡し">
                    {Object.entries(DELIVERY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="p-1 pt-3 text-center">
                  <input type="checkbox" className="size-5" checked={r.requires_member} onChange={(e) => update(r.key, { requires_member: e.target.checked })} aria-label="希望メンバーを選ぶ" />
                </td>
                <td className="p-1 pt-2">
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      setRows((rs) => rs.filter((x) => x.key !== r.key));
                      setDirty(true);
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={add}>
          ＋ 段を追加
        </Button>
        <Button variant="ghost" onClick={sortByCount}>
          人数の順に並べる
        </Button>
        <Button onClick={save} disabled={pending || !dirty} className="ml-auto">
          {pending ? "保存中…" : "特典を保存"}
        </Button>
      </div>
      {dirty && !message && <p className="text-xs text-amber-700">保存していない変更があります。</p>}
      {message && <p className={cx("text-sm", message.ok ? "text-emerald-700" : "text-red-600")}>{message.text}</p>}
    </div>
  );
}
