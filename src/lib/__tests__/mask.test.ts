import { describe, expect, it } from "vitest";
import { maskAddress, maskEmail, maskName, maskPhone, maskPostal } from "../mask";

describe("mask", () => {
  it("個人情報を伏せ字にする", () => {
    expect(maskName("山田 太郎")).toBe("山＊＊＊");
    expect(maskPhone("090-1234-5678")).toBe("＊＊＊-＊＊＊＊-5678");
    expect(maskEmail("taro@example.com")).toBe("ta＊＊＊@example.com");
    expect(maskPostal("1600022")).toBe("160-＊＊＊＊");
    expect(maskAddress("東京都新宿区新宿")).toBe("東京都新宿区＊＊＊");
    expect(maskAddress("神奈川県横浜市中区")).toBe("神奈川県横浜市＊＊＊");
    expect(maskName(null)).toBe("");
  });
});
