function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
  /** 公開URL（QRコードやメール内リンクに使う）。未設定なら Vercel の本番URL */
  get appUrl() {
    const url =
      process.env.APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000");
    return url.replace(/\/$/, "");
  },
  resendApiKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM,
  mailReplyTo: process.env.MAIL_REPLY_TO,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
  cronSecret: process.env.CRON_SECRET,
  ipHashSalt: process.env.IP_HASH_SALT ?? "",
};
