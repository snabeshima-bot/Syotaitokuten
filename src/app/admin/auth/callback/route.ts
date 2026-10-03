import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Google ログインから戻ってきたときにセッションを作る */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  if (!code) return to("/admin/login?error=oauth");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/admin/login?error=oauth");

  // 社内ドメイン以外のアカウントはスタッフにならないので、ログアウトさせて案内する
  const { data: staff } = await supabase.from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return to("/admin/login?error=not_staff");
  }
  return to("/admin");
}
