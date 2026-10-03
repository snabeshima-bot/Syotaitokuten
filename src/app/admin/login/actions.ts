"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/** Google でログイン。社内ドメインのアカウントは初回ログイン時に自動でスタッフになる */
export async function loginWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.appUrl}/admin/auth/callback`,
      queryParams: {
        prompt: "select_account",
        ...(env.staffGoogleDomain ? { hd: env.staffGoogleDomain } : {}),
      },
    },
  });
  if (error || !data.url) redirect("/admin/login?error=oauth");
  redirect(data.url);
}

export async function login(_: string | null, formData: FormData): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return "メールアドレスかパスワードが違います。";
  redirect("/admin/mfa");
}

export async function logout(reason?: unknown) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(reason === "timeout" ? "/admin/login?reason=timeout" : "/admin/login");
}
