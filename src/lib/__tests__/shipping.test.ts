import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../csv";
import { buildShippingCsv, parseTrackingRows, splitByLength, type ShippingRow } from "../shipping";

const row: ShippingRow = {
  receipt_no: 12,
  ticket_number: "A001",
  nickname: "たろう",
  email: "t@example.com",
  full_name: "山田太郎",
  phone: "090-1234-5678",
  postal_code: "1600022",
  address1: "東京都新宿区新宿三丁目",
  address2: "1-1-1 スマイルマンション101号室",
  items: ["ポストカード", "デコチェキ（髙橋美海）"],
};

describe("csv", () => {
  it("カンマ・改行・クオートを往復できる", () => {
    const rows = [["a,b", 'c"d', "e\nf"], ["1", "", "3"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("shipping", () => {
  it("住所を20文字ずつ4行に分ける", () => {
    expect(splitByLength("あ".repeat(45), 20, 4).map((s) => s.length)).toEqual([20, 20, 5, 0]);
  });

  it("汎用CSVに受付番号と同梱物を出す", () => {
    const [header, line] = parseCsv(buildShippingCsv("generic", [row]));
    expect(header[0]).toBe("受付番号");
    expect(line[0]).toBe("000012");
    expect(line[2]).toBe("160-0022");
    expect(line[6]).toBe("ポストカード / デコチェキ（髙橋美海）");
  });

  it("クリックポスト形式", () => {
    const [header, line] = parseCsv(buildShippingCsv("clickpost", [row]));
    expect(header).toHaveLength(8);
    expect(line[0]).toBe("1600022");
    expect(line[2]).toBe("様");
    expect(line.slice(3, 7).join("")).toBe("東京都新宿区新宿三丁目 1-1-1 スマイルマンション101号室");
  });

  it("見出し付きの追跡番号CSVを読む", () => {
    const { entries, errors } = parseTrackingRows(
      parseCsv("受付番号,お問い合わせ番号,配送方法\n000012,1234-5678-9012,クリックポスト\nabc,1,x\n"),
    );
    expect(entries).toEqual([{ receiptNo: 12, trackingNumber: "123456789012", carrier: "クリックポスト" }]);
    expect(errors).toHaveLength(1);
  });

  it("見出しなしのCSVも読む", () => {
    const { entries } = parseTrackingRows(parseCsv("12,999\n13,888\n"));
    expect(entries.map((e) => e.receiptNo)).toEqual([12, 13]);
  });
});
