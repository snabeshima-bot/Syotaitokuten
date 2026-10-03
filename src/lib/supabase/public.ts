import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * 公開フォーム用のクライアント（ログインなし・publishable key）。
 * 読めるのは公開中の公演・特典・メンバーだけ。送信と修正はサーバーキー付きの関数（public_*）経由で行う。
 * アプリは Supabase の秘密鍵（service_role）を持たない。
 */
export function createPublicClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
