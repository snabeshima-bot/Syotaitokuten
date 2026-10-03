import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

type Claims = { aal?: string; amr?: ({ method?: string } | string)[] };

/** Google ログイン（OAuth）か、パスワード＋2段階認証（aal2）なら十分に強い認証とみなす（DB の is_staff と同じ条件） */
export function isStrongAuth(claims: Claims | undefined): boolean {
  if (!claims) return false;
  if (claims.aal === "aal2") return true;
  return (claims.amr ?? []).some((a) => (typeof a === "string" ? a : a.method) === "oauth");
}

/** スタッフとしてログインしているか確認し、RLS 付きクライアントを返す */
export async function requireStaff() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/admin/login");
  // 個人情報を扱うので、Google ログインか、パスワード＋2段階認証のセッションだけを通す（DB の RLS でも同じ条件を見ている）
  if (!isStrongAuth(data.claims as Claims)) redirect("/admin/mfa");
  const { data: staff } = await supabase
    .from("staff")
    .select("user_id, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!staff) redirect("/admin/login?error=not_staff");
  return { supabase, userId, staff };
}

export type StaffContext = Awaited<ReturnType<typeof requireStaff>>;

export async function audit(
  ctx: StaffContext,
  action: string,
  targetType: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
) {
  await ctx.supabase.from("audit_logs").insert({
    staff_user_id: ctx.userId,
    action,
    target_type: targetType,
    target_id: targetId,
    detail,
  });
}

/** リダイレクトせずに「ログイン済みのスタッフか」だけを返す（公開ページのプレビュー用） */
export async function isStaffSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub || !isStrongAuth(data.claims as Claims)) return false;
    const { data: staff } = await supabase.from("staff").select("user_id").eq("user_id", data.claims.sub).maybeSingle();
    return !!staff;
  } catch {
    return false;
  }
}
