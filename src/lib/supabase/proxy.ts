import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** この時間操作がなければ自動でログアウトする */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SEEN_COOKIE = "admin_last_seen";
const PUBLIC_PATHS = ["/admin/login"];

/**
 * 管理画面へのリクエストごとに
 * - Supabase のセッションを更新する
 * - 未ログインならログイン画面へ送る
 * - 最後の操作から30分たっていたらログアウトさせる
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);
  const toLogin = (reason?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = reason ? `?reason=${reason}` : "";
    const redirect = NextResponse.redirect(url);
    // signOut などで更新された Cookie をリダイレクトにも引き継ぐ
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.cookies.delete(SEEN_COOKIE);
    return redirect;
  };

  if (!data?.claims) return isPublic ? response : toLogin();

  const lastSeen = Number(request.cookies.get(SEEN_COOKIE)?.value ?? 0);
  if (lastSeen && Date.now() - lastSeen > IDLE_TIMEOUT_MS) {
    await supabase.auth.signOut({ scope: "local" });
    return toLogin("timeout");
  }

  response.cookies.set(SEEN_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
  });
  return response;
}
