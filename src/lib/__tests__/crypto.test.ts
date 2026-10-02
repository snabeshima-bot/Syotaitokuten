import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptPii, encryptPii, hashEditToken, newEditToken, piiHash } from "../crypto";

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.PII_HASH_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("暗号化して元に戻せる。同じ値でも毎回違う暗号文になる", () => {
    const a = encryptPii("東京都新宿区新宿3-1-1");
    const b = encryptPii("東京都新宿区新宿3-1-1");
    expect(a).toMatch(/^v1\./);
    expect(a).not.toBe(b);
    expect(a).not.toContain("新宿");
    expect(decryptPii(a)).toBe("東京都新宿区新宿3-1-1");
    expect(encryptPii("")).toBeNull();
    expect(decryptPii(null)).toBeNull();
  });

  it("改ざんされた暗号文は復号できない", () => {
    const a = encryptPii("山田太郎")!;
    const broken = a.slice(0, -2) + (a.endsWith("A") ? "BB" : "AA");
    expect(() => decryptPii(broken)).toThrow();
  });

  it("別の鍵では復号できない", () => {
    const a = encryptPii("山田太郎");
    const original = process.env.PII_ENCRYPTION_KEY;
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptPii(a)).toThrow();
    process.env.PII_ENCRYPTION_KEY = original;
  });

  it("重複チェック用ハッシュは表記ゆれを吸収する", () => {
    expect(piiHash("email", "Taro@Example.com ")).toBe(piiHash("email", "taro@example.com"));
    expect(piiHash("phone", "090-1234-5678")).toBe(piiHash("phone", "09012345678"));
    expect(piiHash("email", "a@example.com")).not.toBe(piiHash("phone", "a@example.com"));
    expect(piiHash("phone", "")).toBeNull();
  });

  it("修正トークンはハッシュで照合する", () => {
    const { token, hash } = newEditToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashEditToken(token)).toBe(hash);
  });
});
