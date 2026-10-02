"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import type { RewardTier } from "@/lib/types";
import { AddressFields, MemberPicker, type AddressValues } from "../fields";
import { updateInvitation } from "./actions";

type Props = {
  token: string;
  title: string;
  receiptNo: string;
  nickname: string;
  rewards: { tier: RewardTier; memberId: string | null }[];
  members: { id: string; name: string }[];
  needsAddress: boolean;
  address: AddressValues;
};

export function EditForm({ token, title, receiptNo, nickname, rewards, members, needsAddress, address: initial }: Props) {
  const [choices, setChoices] = useState<Record<string, string>>(
    Object.fromEntries(rewards.filter((r) => r.memberId).map((r) => [r.tier.id, r.memberId!])),
  );
  const [address, setAddress] = useState<AddressValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const missing = rewards.filter((r) => r.tier.requires_member && !choices[r.tier.id]);
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((r) => [`members.${r.tier.id}`, `${r.tier.name}の希望メンバーを選んでください`])));
      setMessage({ ok: false, text: "希望メンバーを選んでください。" });
      return;
    }
    startTransition(async () => {
      const r = await updateInvitation(token, needsAddress, { members: choices, ...address });
      if (r.ok) {
        setErrors({});
        setMessage({ ok: true, text: "修正を保存しました。" });
      } else {
        setErrors(r.errors ?? {});
        setMessage({ ok: false, text: r.message });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-gray-600">
          受付番号 <b className="font-mono">{receiptNo}</b> ・ {nickname} 様
        </p>
        <p className="mt-1 text-xs text-gray-500">希望メンバーと送付先を修正できます。チケット番号や人数を変えたい場合はスタッフにお声がけください。</p>
      </header>
      {message && (
        <p className={message.ok ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" : "rounded-lg bg-red-50 p-3 text-sm text-red-700"} role="status">
          {message.text}
        </p>
      )}
      {rewards
        .filter((r) => r.tier.requires_member)
        .map((r) => (
          <MemberPicker
            key={r.tier.id}
            tier={r.tier}
            members={members}
            value={choices[r.tier.id]}
            error={errors[`members.${r.tier.id}`]}
            onChange={(id) => setChoices((c) => ({ ...c, [r.tier.id]: id }))}
          />
        ))}
      {rewards.some((r) => !r.tier.requires_member) && (
        <Card className="text-sm">
          <p className="font-semibold">そのほかの特典</p>
          <ul className="mt-1 list-disc pl-5">
            {rewards
              .filter((r) => !r.tier.requires_member)
              .map((r) => (
                <li key={r.tier.id}>{r.tier.name}</li>
              ))}
          </ul>
        </Card>
      )}
      {needsAddress && <AddressFields values={address} errors={errors} onChange={(k, v) => setAddress((a) => ({ ...a, [k]: v }))} />}
      <div className="sticky bottom-0 -mx-4 bg-[#f8f7fc]/95 px-4 py-3 backdrop-blur">
        <Button className="w-full py-3.5 text-base" onClick={save} disabled={pending}>
          {pending ? "保存中…" : "修正を保存する"}
        </Button>
      </div>
    </div>
  );
}
