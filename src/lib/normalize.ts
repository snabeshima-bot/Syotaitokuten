/** 全角英数字・記号を半角にし、全角スペースを半角にして前後の空白を除く */
export function toHalfWidth(value: string): string {
  return value
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .trim();
}

/** 数字の間に入りがちなハイフン類（全角・長音記号など）を半角ハイフンにする */
function normalizeDashes(value: string): string {
  return value.replace(/[‐‑–—―ー−－]/g, "-");
}

/** チケット番号: 半角・大文字・空白除去 */
export function normalizeTicketNumber(value: string): string {
  return normalizeDashes(toHalfWidth(value)).replace(/\s+/g, "").toUpperCase();
}

/** 郵便番号: 数字7桁（ハイフンなし） */
export function normalizePostalCode(value: string): string {
  return toHalfWidth(value).replace(/[^0-9]/g, "");
}

export function formatPostalCode(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : value;
}

/** 電話番号: 半角数字とハイフンのみ */
export function normalizePhone(value: string): string {
  return normalizeDashes(toHalfWidth(value)).replace(/[^0-9-]/g, "");
}

export function formatReceiptNo(no: number): string {
  return String(no).padStart(6, "0");
}
