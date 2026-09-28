import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * RLS を通らないサーバー専用クライアント。
 * 公開フォームの読み込み・送信（submit_invitation）と、cron からの削除処理だけに使う。
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
