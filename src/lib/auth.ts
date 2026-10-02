import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/** スタッフとしてログインしているか確認し、RLS 付きクライアントを返す */
export async function requireStaff() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/admin/login");
  // 個人情報を扱うので、2段階認証を済ませたセッションだけを通す（DB の RLS でも同じ条件を見ている）
  if (data.claims.aal !== "aal2") redirect("/admin/mfa");
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

/** リダイレクトせずに「2段階認証済みのスタッフか」だけを返す（公開ページのプレビュー用） */
export async function isStaffSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub || data.claims.aal !== "aal2") return false;
    const { data: staff } = await supabase.from("staff").select("user_id").eq("user_id", data.claims.sub).maybeSingle();
    return !!staff;
  } catch {
    return false;
  }
}
