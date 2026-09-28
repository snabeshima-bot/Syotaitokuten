/** 運用は日本時間。datetime-local の値（"2026-09-29T18:00"）を JST として ISO 文字列にする */
export function jstInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO 文字列を datetime-local 用の JST 表記にする */
export function isoToJstInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export function formatJst(iso: string | null, withTime = true): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}
