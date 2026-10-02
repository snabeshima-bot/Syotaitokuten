import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/**
 * 個人情報の暗号化（AES-256-GCM）。DB には "v1.<base64url(iv|tag|暗号文)>" の形で入る。
 * 鍵は環境変数 PII_ENCRYPTION_KEY（32バイトを base64 で）。DB が漏れても鍵がなければ読めない。
 */
const VERSION = "v1";

function loadKey(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`環境変数 ${name} が設定されていません`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} は32バイトの鍵を base64 で指定してください`);
  return key;
}

export function encryptPii(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey("PII_ENCRYPTION_KEY"), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

export function decryptPii(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!value.startsWith(`${VERSION}.`)) {
    throw new Error("暗号化されていない個人情報が見つかりました");
  }
  const buf = Buffer.from(value.slice(VERSION.length + 1), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", loadKey("PII_ENCRYPTION_KEY"), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** 重複チェック用のハッシュ（暗号化とは別の鍵 PII_HASH_KEY を使う）。同じ値なら同じハッシュになる */
export function piiHash(kind: "email" | "phone", value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = kind === "email" ? value.trim().toLowerCase() : value.replace(/[^0-9]/g, "");
  if (!normalized) return null;
  return createHmac("sha256", loadKey("PII_HASH_KEY")).update(`${kind}:${normalized}`).digest("hex");
}

/** お客様に渡す修正リンク用のトークン。DB にはハッシュだけを保存する */
export function newEditToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashEditToken(token) };
}

export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PiiFields = {
  email: string | null;
  full_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
};

const PII_KEYS = ["email", "full_name", "phone", "postal_code", "address1", "address2"] as const;

export function decryptPiiFields<T extends PiiFields>(row: T): T {
  const out = { ...row };
  for (const k of PII_KEYS) out[k] = decryptPii(row[k]) as T[typeof k];
  return out;
}

export function encryptPiiFields<T extends Partial<PiiFields>>(row: T): T {
  const out = { ...row };
  for (const k of PII_KEYS) if (k in row) out[k] = encryptPii(row[k]) as T[typeof k];
  return out;
}
