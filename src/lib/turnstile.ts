import "server-only";
import { env } from "./env";

/** Cloudflare Turnstile のトークンを検証する。秘密鍵が未設定なら検証しない（開発用） */
export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  if (!env.turnstileSecretKey) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.turnstileSecretKey, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
