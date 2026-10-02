"use client";

import { Card, Field, Input, cx } from "@/components/ui";
import { formatPhone } from "@/lib/input-helpers";
import { normalizePostalCode } from "@/lib/normalize";
import type { RewardTier } from "@/lib/types";

export type AddressValues = {
  full_name: string;
  phone: string;
  postal_code: string;
  address1: string;
  address2: string;
};

/** 特典ごとの希望メンバー選択 */
export function MemberPicker({
  tier,
  members,
  value,
  error,
  onChange,
}: {
  tier: Pick<RewardTier, "id" | "name" | "description">;
  members: { id: string; name: string }[];
  value: string | undefined;
  error?: string;
  onChange: (memberId: string) => void;
}) {
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold">{tier.name}</h2>
        {tier.description && <p className="text-xs text-gray-500">{tier.description}</p>}
      </div>
      <p className="text-sm">
        希望メンバーを選んでください<span className="ml-1 text-red-600">*</span>
      </p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${tier.name}の希望メンバー`}>
        {members.map((m) => {
          const checked = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(m.id)}
              className={cx(
                "rounded-lg border-2 px-3 py-3 text-sm font-semibold transition",
                checked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-700",
              )}
            >
              {checked && <span aria-hidden>✓ </span>}
              {m.name}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </Card>
  );
}

/** 送付先の入力（郵便番号から住所を自動入力、電話番号は自動でハイフン） */
export function AddressFields({
  values,
  errors,
  onChange,
}: {
  values: AddressValues;
  errors: Record<string, string>;
  onChange: (key: keyof AddressValues, value: string) => void;
}) {
  async function lookupAddress(code: string) {
    const digits = normalizePostalCode(code);
    if (digits.length !== 7) return;
    try {
      const res = await fetch(`/api/zip?code=${digits}`);
      const json = (await res.json()) as { address: string | null };
      if (json.address && !values.address1) onChange("address1", json.address);
    } catch {
      // 自動入力できなくても手入力できる
    }
  }

  return (
    <Card className="space-y-5">
      <h2 className="font-bold">送付先</h2>
      <Field label="お名前（フルネーム）" required error={errors.full_name} htmlFor="full_name">
        <Input id="full_name" value={values.full_name} onChange={(e) => onChange("full_name", e.target.value)} autoComplete="name" aria-invalid={!!errors.full_name} />
      </Field>
      <Field label="電話番号" required error={errors.phone} hint="ハイフンは自動で入ります" htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          onBlur={(e) => onChange("phone", formatPhone(e.target.value))}
          autoComplete="tel"
          placeholder="090-1234-5678"
          aria-invalid={!!errors.phone}
        />
      </Field>
      <Field label="郵便番号" required error={errors.postal_code} hint="入力すると住所が自動で入ります" htmlFor="postal_code">
        <Input
          id="postal_code"
          inputMode="numeric"
          value={values.postal_code}
          onChange={(e) => {
            onChange("postal_code", e.target.value);
            void lookupAddress(e.target.value);
          }}
          autoComplete="postal-code"
          placeholder="160-0022"
          aria-invalid={!!errors.postal_code}
        />
      </Field>
      <Field label="住所（都道府県・市区町村・町名）" required error={errors.address1} htmlFor="address1">
        <Input id="address1" value={values.address1} onChange={(e) => onChange("address1", e.target.value)} autoComplete="address-line1" aria-invalid={!!errors.address1} />
      </Field>
      <Field label="番地・建物名・部屋番号" error={errors.address2} hint="番地の書き忘れが多いのでご注意ください" htmlFor="address2">
        <Input id="address2" value={values.address2} onChange={(e) => onChange("address2", e.target.value)} autoComplete="address-line2" />
      </Field>
    </Card>
  );
}

/** 個人情報の取り扱い（利用目的・保存期間・問い合わせ先） */
export function PrivacyNotice({
  organizerName,
  contact,
  retentionDays,
}: {
  organizerName: string;
  contact: string;
  retentionDays: number;
}) {
  return (
    <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
      <p className="font-semibold">個人情報の取り扱いについて</p>
      <ul className="list-disc space-y-0.5 pl-4">
        <li>ご入力の情報は、招待特典の発送と、それに関するご連絡にのみ使います。</li>
        <li>送付先・電話番号・メールアドレスは暗号化して保管し、公演日から{retentionDays}日後に削除します。</li>
        <li>法令に基づく場合を除き、本人の同意なく第三者に提供しません（配送業者への宛名の受け渡しを除く）。</li>
        <li>
          お問い合わせ: {organizerName}
          {contact && `（${contact}）`}
        </li>
      </ul>
    </div>
  );
}
