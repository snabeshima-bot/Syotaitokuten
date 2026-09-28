import { toCsv } from "./csv";
import { formatPostalCode, formatReceiptNo } from "./normalize";

export type ShippingRow = {
  receipt_no: number;
  ticket_number: string;
  nickname: string;
  email: string | null;
  full_name: string;
  phone: string;
  postal_code: string;
  address1: string;
  address2: string;
  /** 同梱する特典（例: 「デコチェキ（髙橋美海）」） */
  items: string[];
};

export const EXPORT_FORMATS = {
  generic: "汎用（全項目）",
  clickpost: "クリックポスト まとめ申込",
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

/** 文字数（サロゲートペアを1文字とみなす）で区切る */
export function splitByLength(value: string, size: number, maxParts: number): string[] {
  const chars = [...value];
  const parts: string[] = [];
  for (let i = 0; i < chars.length && parts.length < maxParts; i += size) {
    parts.push(chars.slice(i, i + size).join(""));
  }
  while (parts.length < maxParts) parts.push("");
  return parts;
}

function truncate(value: string, size: number): string {
  return [...value].slice(0, size).join("");
}

export function buildShippingCsv(format: ExportFormat, rows: ShippingRow[]): string {
  if (format === "clickpost") {
    // クリックポストのまとめ申込: 住所は1行20文字×4行、氏名20文字、内容品15文字
    const header = [
      "お届け先郵便番号",
      "お届け先氏名",
      "お届け先敬称",
      "お届け先住所1行目",
      "お届け先住所2行目",
      "お届け先住所3行目",
      "お届け先住所4行目",
      "内容品",
    ];
    return toCsv([
      header,
      ...rows.map((r) => [
        r.postal_code,
        truncate(r.full_name, 20),
        "様",
        ...splitByLength(`${r.address1}${r.address2 ? ` ${r.address2}` : ""}`, 20, 4),
        truncate("特典グッズ", 15),
      ]),
    ]);
  }
  return toCsv([
    ["受付番号", "氏名", "郵便番号", "住所1", "住所2", "電話番号", "同梱物", "チケット番号", "ニックネーム", "メール"],
    ...rows.map((r) => [
      formatReceiptNo(r.receipt_no),
      r.full_name,
      formatPostalCode(r.postal_code),
      r.address1,
      r.address2,
      r.phone,
      r.items.join(" / "),
      r.ticket_number,
      r.nickname,
      r.email ?? "",
    ]),
  ]);
}

export type TrackingEntry = { receiptNo: number; trackingNumber: string; carrier: string };

/**
 * 追跡番号の CSV を読む。1行目の見出しから「受付番号」「追跡番号/お問い合わせ番号」「配送方法」の列を探す。
 * 見出しがない場合は 1列目=受付番号, 2列目=追跡番号, 3列目=配送方法 とみなす。
 */
export function parseTrackingRows(rows: string[][]): { entries: TrackingEntry[]; errors: string[] } {
  if (rows.length === 0) return { entries: [], errors: ["CSV が空です"] };
  const header = rows[0].map((h) => h.trim());
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  let receiptCol = find("受付番号");
  let trackingCol = find("追跡番号", "問い合わせ番号", "問合せ番号", "伝票番号");
  let carrierCol = find("配送方法", "配送業者", "キャリア");
  let body = rows.slice(1);
  if (receiptCol < 0 || trackingCol < 0) {
    receiptCol = 0;
    trackingCol = 1;
    carrierCol = rows[0].length > 2 ? 2 : -1;
    body = /^\d+$/.test(rows[0][0]?.trim() ?? "") ? rows : rows.slice(1);
  }
  const entries: TrackingEntry[] = [];
  const errors: string[] = [];
  body.forEach((row, i) => {
    const receipt = (row[receiptCol] ?? "").trim();
    const tracking = (row[trackingCol] ?? "").replace(/[\s-]/g, "");
    if (!/^\d+$/.test(receipt)) {
      errors.push(`${i + 2}行目: 受付番号「${receipt}」が数字ではありません`);
      return;
    }
    if (!tracking) {
      errors.push(`${i + 2}行目: 追跡番号がありません`);
      return;
    }
    entries.push({
      receiptNo: Number(receipt),
      trackingNumber: tracking,
      carrier: carrierCol >= 0 ? (row[carrierCol] ?? "").trim() : "",
    });
  });
  return { entries, errors };
}
