"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Button, Card, Field, Input, cx } from "@/components/ui";
import { countChoices, eligibleTiers, needsShipping, tiersRequiringMember } from "@/lib/rewards";
import { buildSubmissionSchema, flattenErrors } from "@/lib/validation";
import { formatPostalCode, formatReceiptNo, normalizePostalCode } from "@/lib/normalize";
import { suggestEmail } from "@/lib/input-helpers";
import { DELIVERY_LABELS, type RewardTier } from "@/lib/types";
import { submitInvitation, type SubmitResult } from "./actions";
import { AddressFields, MemberPicker, PrivacyNotice, type AddressValues } from "./fields";

type Props = {
  slug: string;
  title: string;
  description: string;
  imageUrl: string | null;
  tiers: RewardTier[];
  members: { id: string; name: string }[];
  turnstileSiteKey: string | null;
  privacy: { organizerName: string; contact: string; retentionDays: number };
  /** スタッフのプレビュー。送信はできない */
  preview?: boolean;
};

type Step = "intro" | "inviter" | "count" | "members" | "address" | "confirm";

type FormState = AddressValues & {
  ticket_number: string;
  nickname: string;
  email: string;
  claimed_count: number;
  members: Record<string, string>;
  consent: boolean;
};

const EMPTY: FormState = {
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
  consent: false,
};

const STEP_FIELDS: Record<Step, string[]> = {
  intro: [],
  inviter: ["ticket_number", "nickname", "email"],
  count: ["claimed_count"],
  members: ["members."],
  address: ["full_name", "phone", "postal_code", "address1", "address2"],
  confirm: ["consent"],
};

const matches = (key: string, prefixes: string[]) => prefixes.some((p) => (p.endsWith(".") ? key.startsWith(p) : key === p));

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

export function InvitationForm({ slug, title, description, imageUrl, tiers, members, turnstileSiteKey, privacy, preview = false }: Props) {
  const draftKey = `invite-draft:${slug}`;
  const [step, setStep] = useState<Step>("intro");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [restored, setRestored] = useState(false);
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
  const steps: Step[] = [
    "intro",
    "inviter",
    "count",
    ...(memberTiers.length ? (["members"] as const) : []),
    ...(shipping ? (["address"] as const) : []),
    "confirm",
  ];
  const stepIndex = steps.indexOf(step);
  const emailSuggestion = suggestEmail(form.email);

  // 入力途中の内容はこのタブの中だけに保持する（タブを閉じると消える sessionStorage）
  useEffect(() => {
    if (preview) return;
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) {
        const { form: f, step: s } = JSON.parse(saved) as { form: FormState; step: Step };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存済みの下書きを最初の1回だけ戻す
        setForm({ ...EMPTY, ...f, consent: false });
        setStep(s === "confirm" ? "intro" : s);
        setRestored(true);
      }
    } catch {
      // 読めなければ最初から
    }
  }, [draftKey, preview]);

  useEffect(() => {
    if (preview || result || step === "intro") return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ form: { ...form, consent: false }, step }));
    } catch {
      // 保存できなくても入力は続けられる
    }
  }, [draftKey, form, step, preview, result]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, result]);

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  };
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name;

  function validateStep(s: Step): boolean {
    const r = schema.safeParse(form);
    const all = r.success ? {} : flattenErrors(r.error);
    const stepErrors = Object.fromEntries(Object.entries(all).filter(([k]) => matches(k, STEP_FIELDS[s])));
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

  function resetDraft() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {}
    setForm(EMPTY);
    setRestored(false);
  }

  function submit() {
    if (preview) {
      setMessage("プレビューのため送信できません。");
      return;
    }
    if (!validateStep("confirm")) return;
    setMessage(null);
    startTransition(async () => {
      const r = await submitInvitation(slug, { ...form, turnstile_token: token });
      if (r.ok) {
        try {
          sessionStorage.removeItem(draftKey);
        } catch {}
        setResult(r);
      } else {
        setMessage(r.message);
        if (r.errors) {
          setErrors(r.errors);
          const firstStep = steps.find((s) => Object.keys(r.errors!).some((k) => matches(k, STEP_FIELDS[s])));
          if (firstStep) setStep(firstStep);
        }
        if (turnstileSiteKey) {
          window.turnstile?.reset();
          setToken(undefined);
        }
      }
    });
  }

  if (result) return <Done topRef={topRef} result={result} />;

  return (
    <div ref={topRef} className="scroll-mt-4 space-y-4">
      {preview && (
        <p className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-900">
          スタッフ用プレビューです。お客様にはこの表示は出ません。送信はできません。
        </p>
      )}
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

      {restored && step !== "intro" && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 text-sm">
          <span className="flex-1">途中まで入力した内容を戻しました。</span>
          <button type="button" className="shrink-0 text-xs font-semibold text-brand-700 underline" onClick={() => { resetDraft(); setStep("inviter"); }}>
            最初からやり直す
          </button>
        </div>
      )}

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
            <p className="text-xs text-gray-500">上の段に届くと、下の段の特典もすべてもらえます。入力は2〜3分で終わります。</p>
          </div>
          <Button className="w-full" onClick={() => setStep("inviter")}>
            入力をはじめる
          </Button>
        </Card>
      )}

      {step === "inviter" && (
        <Card className="space-y-5">
          <h2 className="font-bold">招待者ご本人様の情報</h2>
          <Field label="チケット番号" required error={errors.ticket_number} hint="ご自身のチケットに書かれている番号" htmlFor="ticket_number">
            <Input
              id="ticket_number"
              value={form.ticket_number}
              onChange={(e) => set("ticket_number", e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="next"
              aria-invalid={!!errors.ticket_number}
            />
          </Field>
          <Field label="お名前（ニックネーム可）" required error={errors.nickname} htmlFor="nickname">
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => set("nickname", e.target.value)}
              autoComplete="nickname"
              enterKeyHint="next"
              aria-invalid={!!errors.nickname}
            />
          </Field>
          <Field label="メールアドレス" required error={errors.email} hint="受付完了・発送完了のお知らせと、修正用のリンクを送ります" htmlFor="email">
            <Input
              id="email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              enterKeyHint="done"
              aria-invalid={!!errors.email}
            />
          </Field>
          {emailSuggestion && (
            <p className="-mt-3 text-sm">
              もしかして{" "}
              <button type="button" className="font-semibold text-brand-700 underline" onClick={() => set("email", emailSuggestion)}>
                {emailSuggestion}
              </button>{" "}
              ですか？
            </p>
          )}
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
            <MemberPicker
              key={t.id}
              tier={t}
              members={members}
              value={form.members[t.id]}
              error={errors[`members.${t.id}`]}
              onChange={(memberId) => {
                set("members", { ...form.members, [t.id]: memberId });
                clearError(`members.${t.id}`);
              }}
            />
          ))}
        </div>
      )}

      {step === "address" && <AddressFields values={form} errors={errors} onChange={(k, v) => set(k, v)} />}

      {step === "confirm" && (
        <Card className="space-y-4">
          <h2 className="font-bold">入力内容の確認</h2>
          <dl className="divide-y divide-gray-100 text-sm">
            <Row label="チケット番号" value={form.ticket_number} onEdit={() => setStep("inviter")} />
            <Row label="お名前（ニックネーム可）" value={form.nickname} onEdit={() => setStep("inviter")} />
            <Row label="メールアドレス" value={form.email} onEdit={() => setStep("inviter")} />
            <Row label="招待した人数" value={`${form.claimed_count}人以上`} onEdit={() => setStep("count")} />
            <Row
              label="特典"
              value={earned.map((t) => (t.requires_member ? `${t.name}（${memberName(form.members[t.id]) ?? "未選択"}）` : t.name)).join("\n")}
              onEdit={memberTiers.length ? () => setStep("members") : undefined}
            />
            {shipping && (
              <>
                <Row label="お名前（フルネーム）" value={form.full_name} onEdit={() => setStep("address")} />
                <Row label="電話番号" value={form.phone} onEdit={() => setStep("address")} />
                <Row
                  label="送付先"
                  value={`〒${formatPostalCode(normalizePostalCode(form.postal_code))}\n${form.address1}${form.address2 ? `\n${form.address2}` : ""}`}
                  onEdit={() => setStep("address")}
                />
              </>
            )}
          </dl>
          <PrivacyNotice {...privacy} />
          <label className={cx("flex items-start gap-3 rounded-lg border-2 p-3 text-sm", errors.consent ? "border-red-400" : "border-gray-200")}>
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-brand-600"
              checked={form.consent}
              onChange={(e) => set("consent", e.target.checked)}
            />
            <span>上記の個人情報の取り扱いに同意します</span>
          </label>
          {errors.consent && <p className="-mt-2 text-xs font-medium text-red-600">{errors.consent}</p>}
          {turnstileSiteKey && !preview && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} />}
          <Button className="w-full py-3.5 text-base" onClick={submit} disabled={pending || (!!turnstileSiteKey && !preview && !token)}>
            {pending ? "送信中…" : "この内容で送信する"}
          </Button>
        </Card>
      )}

      {step !== "intro" && (
        <div className="sticky bottom-0 -mx-4 flex gap-2 bg-[#f8f7fc]/95 px-4 py-3 backdrop-blur">
          <Button variant="secondary" onClick={back} disabled={pending} className="flex-1">
            戻る
          </Button>
          {step !== "confirm" && (
            <Button onClick={next} className="flex-[2] py-3">
              次へ
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Done({ topRef, result }: { topRef: React.RefObject<HTMLDivElement | null>; result: Extract<SubmitResult, { ok: true }> }) {
  const [qr, setQr] = useState<string | null>(null);
  const receipt = formatReceiptNo(result.receiptNo);
  useEffect(() => {
    // スタッフが当日受付画面で読み取るQR（受付番号だけを含む）
    QRCode.toDataURL(`receipt:${receipt}`, { width: 240, margin: 1 }).then(setQr, () => setQr(null));
  }, [receipt]);
  return (
    <div ref={topRef} className="space-y-4">
      <Card className="space-y-4 text-center">
        <p className="text-sm font-semibold text-brand-600">受付が完了しました</p>
        <div>
          <p className="text-xs text-gray-500">受付番号</p>
          <p className="text-4xl font-bold tracking-widest" data-testid="receipt-no">
            {receipt}
          </p>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`受付番号 ${receipt} のQRコード`} className="mx-auto size-40" />
        )}
        <p className="rounded-lg bg-brand-50 p-3 text-sm font-semibold text-brand-700">この画面をスタッフにお見せください</p>
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
          受付完了メールにある修正用のリンクから、受付期間中は希望メンバーと送付先を直せます。
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-start gap-2 py-2">
      <div className="flex-1">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="font-medium whitespace-pre-wrap">{value}</dd>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-brand-700 underline">
          変更
        </button>
      )}
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
