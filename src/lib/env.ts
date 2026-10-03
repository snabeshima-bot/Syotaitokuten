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
  /** 公開フォームの送信・修正で DB の関数に渡すキー（DB 側には sha256 で保存） */
  get appServerKey() {
    return required("APP_SERVER_KEY", process.env.APP_SERVER_KEY);
  },
  /** Google ログインで候補に出すドメイン（Google の hd パラメータ）。スタッフにするかは DB の staff_email_domains で決まる */
  staffGoogleDomain: process.env.STAFF_GOOGLE_DOMAIN ?? "",
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
  ipHashSalt: process.env.IP_HASH_SALT ?? "",
  /** フォームの「個人情報の取り扱い」に出す運営者名と問い合わせ先 */
  organizerName: process.env.ORGANIZER_NAME ?? "運営事務局",
  privacyContact: process.env.PRIVACY_CONTACT ?? "",
};
