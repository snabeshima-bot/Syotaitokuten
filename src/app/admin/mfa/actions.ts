"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EnrollState = { factorId: string; qr: string; secret: string } | { error: string } | null;

/** 認証アプリの登録を始める（QRコードを返す）。途中でやめた未確認の登録は消してからやり直す */
export async function startEnroll(): Promise<EnrollState> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  if (factors?.totp.length) return { error: "すでに認証アプリが登録されています。ページを再読み込みしてください。" };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `招待特典 管理 ${Date.now()}` });
  if (error || !data) return { error: "登録を始められませんでした。時間をおいてもう一度お試しください。" };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** 6桁のコードを確認して、2段階認証済みのセッションにする */
export async function verifyCode(_: string | null, fd: FormData): Promise<string | null> {
  const factorId = String(fd.get("factor_id") ?? "");
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return "6桁の数字を入力してください。";
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return "コードが正しくないか、有効期限が切れています。アプリに表示されている最新のコードを入力してください。";
  redirect("/admin");
}
