import { z } from "zod";
import { needsShipping, tiersRequiringMember, eligibleTiers } from "./rewards";
import { normalizePhone, normalizePostalCode, normalizeTicketNumber, toHalfWidth } from "./normalize";
import type { RewardTier } from "./types";

const text = (max: number) => z.string().transform((v) => v.trim()).pipe(z.string().max(max));

const baseSchema = z.object({
  ticket_number: z
    .string()
    .transform(normalizeTicketNumber)
    .pipe(z.string().min(1, "チケット番号を入力してください").max(64)),
  nickname: text(50).pipe(z.string().min(1, "お名前（ニックネーム可）を入力してください")),
  email: z
    .string()
    .transform((v) => toHalfWidth(v))
    .pipe(z.email("メールアドレスの形式が正しくありません").max(254)),
  claimed_count: z.coerce.number().int().min(1, "招待した人数を選んでください"),
  members: z.record(z.string(), z.string()).default({}),
  full_name: text(50).default(""),
  phone: z.string().transform(normalizePhone).default(""),
  postal_code: z.string().transform(normalizePostalCode).default(""),
  address1: text(200).default(""),
  address2: text(200).default(""),
});

export type SubmissionInput = z.input<typeof baseSchema>;
export type SubmissionData = z.output<typeof baseSchema>;

/**
 * 公演の段とメンバーに合わせた送信内容のスキーマ。
 * 招待人数に応じて、希望メンバーと送付先の必須チェックを切り替える。
 */
export function buildSubmissionSchema(tiers: RewardTier[], memberIds: string[]) {
  const counts = new Set(tiers.map((t) => t.min_count));
  return baseSchema.superRefine((data, ctx) => {
    if (!counts.has(data.claimed_count)) {
      ctx.addIssue({ code: "custom", path: ["claimed_count"], message: "招待した人数を選んでください" });
      return;
    }
    for (const tier of tiersRequiringMember(tiers, data.claimed_count)) {
      const memberId = data.members[tier.id];
      if (!memberId || !memberIds.includes(memberId)) {
        ctx.addIssue({
          code: "custom",
          path: ["members", tier.id],
          message: `${tier.name}の希望メンバーを選んでください`,
        });
      }
    }
    if (needsShipping(eligibleTiers(tiers, data.claimed_count))) {
      if (!data.full_name) {
        ctx.addIssue({ code: "custom", path: ["full_name"], message: "お名前（フルネーム）を入力してください" });
      }
      if (!/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(data.phone)) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "電話番号をハイフンありで入力してください（例: 090-1234-5678）" });
      }
      if (!/^\d{7}$/.test(data.postal_code)) {
        ctx.addIssue({ code: "custom", path: ["postal_code"], message: "郵便番号を7桁で入力してください" });
      }
      if (!data.address1) {
        ctx.addIssue({ code: "custom", path: ["address1"], message: "住所を入力してください" });
      }
    }
  });
}

/** zod のエラーを「項目のパス → メッセージ」にする（members は members.<tierId>） */
export function flattenErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** 選んだ人数で不要になった特典の希望メンバーや送付先を落とす */
export function pruneForCount(data: SubmissionData, tiers: RewardTier[]): SubmissionData {
  const required = new Set(tiersRequiringMember(tiers, data.claimed_count).map((t) => t.id));
  const members = Object.fromEntries(Object.entries(data.members).filter(([k]) => required.has(k)));
  if (needsShipping(eligibleTiers(tiers, data.claimed_count))) return { ...data, members };
  return { ...data, members, full_name: "", phone: "", postal_code: "", address1: "", address2: "" };
}
