import { describe, expect, it } from "vitest";
import { formatPhone, suggestEmail } from "../input-helpers";

describe("formatPhone", () => {
  it("ハイフンなしの番号にハイフンを入れる", () => {
    expect(formatPhone("09012345678")).toBe("090-1234-5678");
    expect(formatPhone("０８０１２３４５６７８")).toBe("080-1234-5678");
    expect(formatPhone("0312345678")).toBe("03-1234-5678");
    expect(formatPhone("0452345678")).toBe("045-234-5678");
  });
  it("ハイフンありやわからない形はそのまま", () => {
    expect(formatPhone("0466-12-3456")).toBe("0466-12-3456");
    expect(formatPhone("12345")).toBe("12345");
  });
});

describe("suggestEmail", () => {
  it("よくある打ち間違いを直す候補を出す", () => {
    expect(suggestEmail("taro@gmial.com")).toBe("taro@gmail.com");
    expect(suggestEmail("taro@docomo.ne.j")).toBe("taro@docomo.ne.jp");
    expect(suggestEmail("taro@icloud.co")).toBe("taro@icloud.com");
  });
  it("正しいドメインや遠いドメインには出さない", () => {
    expect(suggestEmail("taro@gmail.com")).toBeNull();
    expect(suggestEmail("taro@focpro.co.jp")).toBeNull();
    expect(suggestEmail("taro")).toBeNull();
  });
});
