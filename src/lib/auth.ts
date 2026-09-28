import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/** スタッフとしてログインしているか確認し、RLS 付きクライアントを返す */
export async function requireStaff() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/admin/login");
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
