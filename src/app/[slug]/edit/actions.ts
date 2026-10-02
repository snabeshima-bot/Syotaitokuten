"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPii, hashEditToken, piiHash } from "@/lib/crypto";
import { normalizePhone, normalizePostalCode } from "@/lib/normalize";
import { flattenErrors } from "@/lib/validation";

export type EditResult = { ok: true } | { ok: false; message: string; errors?: Record<string, string> };

const DB_ERRORS: Record<string, string> = {
  edit_link_invalid: "このリンクは無効か、有効期限が切れています。",
  edit_locked: "受付が終了したか、発送の準備に入ったため修正できません。スタッフにお問い合わせください。",
  member_required: "希望メンバーを選んでください。",
  address_required: "送付先を入力してください。",
};

const schema = (needsAddress: boolean) =>
  z
    .object({
      members: z.record(z.string(), z.string()).default({}),
      full_name: z.string().trim().max(50).default(""),
      phone: z.string().transform(normalizePhone).default(""),
      postal_code: z.string().transform(normalizePostalCode).default(""),
      address1: z.string().trim().max(200).default(""),
      address2: z.string().trim().max(200).default(""),
    })
    .superRefine((d, ctx) => {
      if (!needsAddress) return;
      if (!d.full_name) ctx.addIssue({ code: "custom", path: ["full_name"], message: "お名前（フルネーム）を入力してください" });
      if (!/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(d.phone))
        ctx.addIssue({ code: "custom", path: ["phone"], message: "電話番号をハイフンありで入力してください（例: 090-1234-5678）" });
      if (!/^\d{7}$/.test(d.postal_code)) ctx.addIssue({ code: "custom", path: ["postal_code"], message: "郵便番号を7桁で入力してください" });
      if (!d.address1) ctx.addIssue({ code: "custom", path: ["address1"], message: "住所を入力してください" });
    });

export async function updateInvitation(token: string, needsAddress: boolean, input: unknown): Promise<EditResult> {
  const parsed = schema(needsAddress).safeParse(input);
  if (!parsed.success) return { ok: false, message: "入力内容を確認してください。", errors: flattenErrors(parsed.error) };
  const d = parsed.data;
  const { error } = await createAdminClient().rpc("update_invitation_by_token", {
    p: {
      edit_token_hash: hashEditToken(token),
      members: d.members,
      full_name: encryptPii(d.full_name),
      phone: encryptPii(d.phone),
      phone_hash: piiHash("phone", d.phone),
      postal_code: encryptPii(d.postal_code),
      address1: encryptPii(d.address1),
      address2: encryptPii(d.address2),
    },
  });
  if (error) {
    const message = DB_ERRORS[error.message];
    if (!message) console.error("[edit] 修正に失敗:", error);
    return { ok: false, message: message ?? "保存に失敗しました。時間をおいてもう一度お試しください。" };
  }
  return { ok: true };
}
