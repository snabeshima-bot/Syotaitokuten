import { normalizePhone } from "./normalize";

/** 電話番号にハイフンを入れる（携帯は3-4-4、03/06 は2-4-4、そのほかの固定電話は3-3-4 を目安にする） */
export function formatPhone(value: string): string {
  const raw = normalizePhone(value);
  if (raw.includes("-")) return raw;
  const d = raw.replace(/[^0-9]/g, "");
  if (/^0[5789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0[36]\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

const COMMON_DOMAINS = [
  "gmail.com",
  "icloud.com",
  "yahoo.co.jp",
  "ymail.ne.jp",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "i.softbank.jp",
  "outlook.jp",
  "outlook.com",
  "hotmail.com",
  "me.com",
];

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** よくあるドメインの打ち間違い（gmial.com など）なら、正しいと思われるアドレスを返す */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDist = 3;
  for (const d of COMMON_DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best ? `${email.slice(0, at)}@${best}` : null;
}
