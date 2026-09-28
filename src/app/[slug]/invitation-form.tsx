"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Card, Field, Input, cx } from "@/components/ui";
import { countChoices, eligibleTiers, needsShipping, tiersRequiringMember } from "@/lib/rewards";
import { buildSubmissionSchema, flattenErrors } from "@/lib/validation";
import { formatPostalCode, formatReceiptNo, normalizePostalCode } from "@/lib/normalize";
import { DELIVERY_LABELS, type RewardTier } from "@/lib/types";
import { submitInvitation, type SubmitResult } from "./actions";

type Props = {
  slug: string;
  title: string;
  description: string;
  imageUrl: string | null;
  tiers: RewardTier[];
  members: { id: string; name: string }[];
  turnstileSiteKey: string | null;
};

type Step = "intro" | "inviter" | "count" | "members" | "address" | "confirm";

type FormState = {
  ticket_number: string;
  nickname: string;
  email: string;
  claimed_count: number;
  members: Record<string, string>;
  full_name: string;
  phone: string;
  postal_code: string;
  address1: string;
  address2: string;
};

const STEP_FIELDS: Record<Step, string[]> = {
  intro: [],
  inviter: ["ticket_number", "nickname", "email"],
  count: ["claimed_count"],
  members: ["members."],
  address: ["full_name", "phone", "postal_code", "address1", "address2"],
  confirm: [],
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

export function InvitationForm({ slug, title, description, imageUrl, tiers, members, turnstileSiteKey }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [form, setForm] = useState<FormState>({
    ticket_number: "",
    nickname: "",
    email: "",
    claimed_count: 0,
    members: {},
    full_name: "",
    phone: "",
    postal_code: "",
    address1: "",
    address2: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  const schema = useMemo(() => buildSubmissionSchema(tiers, members.map((m) => m.id)), [tiers, members]);
  const choices = countChoices(tiers);
  const earned = eligibleTiers(tiers, form.claimed_count);
  const memberTiers = tiersRequiringMember(tiers, form.claimed_count);
  const shipping = needsShipping(earned);
  const steps: Step[] = ["intro", "inviter", "count", ...(memberTiers.length ? (["members"] as const) : []), ...(shipping ? (["address"] as const) : []), "confirm"];
  const stepIndex = steps.indexOf(step);

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const { [key]: _removed, ...rest } = e;
      void _removed;
      return rest;
    });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  };
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name;

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, result]);

  function validateStep(s: Step): boolean {
    const r = schema.safeParse(form);
    const all = r.success ? {} : flattenErrors(r.error);
    const prefixes = STEP_FIELDS[s];
    const stepErrors = Object.fromEntries(
      Object.entries(all).filter(([k]) => prefixes.some((p) => (p.endsWith(".") ? k.startsWith(p) : k === p))),
    );
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setMessage(null);
    setStep(steps[stepIndex + 1]);
  }

  function back() {
    setErrors({});
    setMessage(null);
    setStep(steps[stepIndex - 1]);
  }

  async function lookupAddress(code: string) {
    const digits = normalizePostalCode(code);
    if (digits.length !== 7 || form.address1) return;
    try {
      const res = await fetch(`/api/zip?code=${digits}`);
      const json = (await res.json()) as { address: string | null };
      if (json.address) setForm((f) => (f.address1 ? f : { ...f, address1: json.address! }));
    } catch {
      // 自動入力できなくても手入力できる
    }
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const r = await submitInvitation(slug, { ...form, turnstile_token: token });
      if (r.ok) {
        setResult(r);
      } else {
        setMessage(r.message);
        if (r.errors) {
          setErrors(r.errors);
          const firstStep = steps.find((s) =>
            Object.keys(r.errors!).some((k) => STEP_FIELDS[s].some((p) => (p.endsWith(".") ? k.startsWith(p) : k === p))),
          );
          if (firstStep) setStep(firstStep);
        }
        if (turnstileSiteKey) {
          window.turnstile?.reset();
          setToken(undefined);
        }
      }
    });
  }

  if (result) {
    return (
      <div ref={topRef} className="space-y-4">
        <Card className="space-y-4 text-center">
          <p className="text-sm font-semibold text-brand-600">受付が完了しました</p>
          <div>
            <p className="text-xs text-gray-500">受付番号</p>
            <p className="text-4xl font-bold tracking-widest">{formatReceiptNo(result.receiptNo)}</p>
          </div>
          <p className="rounded-lg bg-brand-50 p-3 text-sm font-semibold text-brand-700">
            この画面をスタッフにお見せください
          </p>
          <ul className="space-y-1 text-left text-sm">
            {result.items.map((item) => (
              <li key={item} className="rounded-md bg-gray-50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            招待人数はスタッフが確認します。確認の結果、特典の内容が変わる場合があります。
            {result.shipping && "発送が完了したらメールでお知らせします。"}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg leading-snug font-bold">{title}</h1>
        {step !== "intro" && (
          <ol className="flex gap-1 pt-2" aria-label="進み具合">
            {steps.slice(1).map((s, i) => (
              <li key={s} className={cx("h-1.5 flex-1 rounded-full", i < stepIndex ? "bg-brand-500" : "bg-gray-200")} />
            ))}
          </ol>
        )}
      </header>

      {message && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      {step === "intro" && (
        <Card className="space-y-4">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="招待特典の一覧" className="w-full rounded-lg" />
          )}
          {description && <p className="text-sm whitespace-pre-wrap text-gray-700">{description}</p>}
          <div className="space-y-1">
            <p className="text-sm font-semibold">招待特典</p>
            <ul className="space-y-1 text-sm">
              {tiers.map((t) => (
                <li key={t.id} className="flex gap-3 rounded-md bg-gray-50 px-3 py-2">
                  <span className="shrink-0 font-bold text-brand-600">{t.min_count}人以上</span>
                  <span>
                    {t.name}
                    {t.description && <span className="block text-xs text-gray-500">{t.description}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">上の段に届くと、下の段の特典もすべてもらえます。</p>
          </div>
          <Button className="w-full" onClick={() => setStep("inviter")}>
            入力をはじめる
          </Button>
        </Card>
      )}

      {step === "inviter" && (
        <Card className="space-y-5">
          <h2 className="font-bold">招待者ご本人様の情報</h2>
          <Field label="チケット番号" required error={errors.ticket_number} htmlFor="ticket_number">
            <Input
              id="ticket_number"
              value={form.ticket_number}
              onChange={(e) => set("ticket_number", e.target.value)}
              autoComplete="off"
              aria-invalid={!!errors.ticket_number}
            />
          </Field>
          <Field label="お名前（ニックネーム可）" required error={errors.nickname} htmlFor="nickname">
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => set("nickname", e.target.value)}
              autoComplete="nickname"
              aria-invalid={!!errors.nickname}
            />
          </Field>
          <Field label="メールアドレス" required error={errors.email} hint="受付完了・発送完了のお知らせを送ります" htmlFor="email">
            <Input
              id="email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
          </Field>
        </Card>
      )}

      {step === "count" && (
        <Card className="space-y-4">
          <h2 className="font-bold">招待した人数</h2>
          <p className="text-xs text-gray-500">人数はあとでスタッフが確認します。</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="招待した人数">
            {choices.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.claimed_count === c}
                onClick={() => set("claimed_count", c)}
                className={cx(
                  "rounded-lg border-2 py-3 text-lg font-bold transition",
                  form.claimed_count === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-700",
                )}
              >
                {c}人<span className="text-xs font-semibold">以上</span>
              </button>
            ))}
          </div>
          {errors.claimed_count && <p className="text-xs font-medium text-red-600">{errors.claimed_count}</p>}
          {form.claimed_count > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-semibold">もらえる特典</p>
              <ul className="space-y-1 text-sm">
                {earned.map((t) => (
                  <li key={t.id} className="rounded-md bg-brand-50 px-3 py-2">
                    {t.name}
                    {t.delivery === "hand" && <span className="ml-2 text-xs text-gray-500">（{DELIVERY_LABELS.hand}）</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {step === "members" && (
        <div className="space-y-4">
          {memberTiers.map((t) => (
            <Card key={t.id} className="space-y-3">
              <div>
                <h2 className="font-bold">{t.name}</h2>
                {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
              </div>
              <p className="text-sm">
                希望メンバーを選んでください<span className="ml-1 text-red-600">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${t.name}の希望メンバー`}>
                {members.map((m) => {
                  const checked = form.members[t.id] === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => {
                        set("members", { ...form.members, [t.id]: m.id });
                        clearError(`members.${t.id}`);
                      }}
                      className={cx(
                        "rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition",
                        checked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-700",
                      )}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
              {errors[`members.${t.id}`] && <p className="text-xs font-medium text-red-600">{errors[`members.${t.id}`]}</p>}
            </Card>
          ))}
        </div>
      )}

      {step === "address" && (
        <Card className="space-y-5">
          <h2 className="font-bold">送付先</h2>
          <Field label="お名前（フルネーム）" required error={errors.full_name} htmlFor="full_name">
            <Input id="full_name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" aria-invalid={!!errors.full_name} />
          </Field>
          <Field label="電話番号（ハイフンあり）" required error={errors.phone} hint="例: 090-1234-5678" htmlFor="phone">
            <Input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" aria-invalid={!!errors.phone} />
          </Field>
          <Field label="郵便番号" required error={errors.postal_code} hint="入力すると住所が自動で入ります" htmlFor="postal_code">
            <Input
              id="postal_code"
              inputMode="numeric"
              value={form.postal_code}
              onChange={(e) => {
                set("postal_code", e.target.value);
                void lookupAddress(e.target.value);
              }}
              autoComplete="postal-code"
              placeholder="160-0022"
              aria-invalid={!!errors.postal_code}
            />
          </Field>
          <Field label="住所（都道府県・市区町村・町名）" required error={errors.address1} htmlFor="address1">
            <Input id="address1" value={form.address1} onChange={(e) => set("address1", e.target.value)} autoComplete="address-level1" aria-invalid={!!errors.address1} />
          </Field>
          <Field label="番地・建物名・部屋番号" error={errors.address2} htmlFor="address2">
            <Input id="address2" value={form.address2} onChange={(e) => set("address2", e.target.value)} autoComplete="address-line2" />
          </Field>
        </Card>
      )}

      {step === "confirm" && (
        <Card className="space-y-4">
          <h2 className="font-bold">入力内容の確認</h2>
          <dl className="divide-y divide-gray-100 text-sm">
            <Row label="チケット番号" value={form.ticket_number} />
            <Row label="お名前（ニックネーム可）" value={form.nickname} />
            <Row label="メールアドレス" value={form.email} />
            <Row label="招待した人数" value={`${form.claimed_count}人以上`} />
            <Row
              label="特典"
              value={earned.map((t) => (t.requires_member ? `${t.name}（${memberName(form.members[t.id]) ?? "未選択"}）` : t.name)).join("\n")}
            />
            {shipping && (
              <>
                <Row label="お名前（フルネーム）" value={form.full_name} />
                <Row label="電話番号" value={form.phone} />
                <Row
                  label="送付先"
                  value={`〒${formatPostalCode(normalizePostalCode(form.postal_code))}\n${form.address1}${form.address2 ? `\n${form.address2}` : ""}`}
                />
              </>
            )}
          </dl>
          {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} />}
          <Button className="w-full" onClick={submit} disabled={pending || (!!turnstileSiteKey && !token)}>
            {pending ? "送信中…" : "この内容で送信する"}
          </Button>
        </Card>
      )}

      {step !== "intro" && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={back} disabled={pending} className="flex-1">
            戻る
          </Button>
          {step !== "confirm" && (
            <Button onClick={next} className="flex-[2]">
              次へ
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string | undefined) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (t) => onToken(t),
        "expired-callback": () => onToken(undefined),
      });
    };
    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
    };
  }, [siteKey, onToken]);
  return <div ref={ref} className="flex justify-center" />;
}
