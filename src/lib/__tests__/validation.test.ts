import { describe, expect, it } from "vitest";
import { buildSubmissionSchema, flattenErrors, pruneForCount } from "../validation";
import type { RewardTier } from "../types";

const tiers: RewardTier[] = [
  { id: "t1", event_id: "e", min_count: 1, name: "ポストカード", description: "", requires_member: false, delivery: "hand", sort_order: 0 },
  { id: "t3", event_id: "e", min_count: 3, name: "デコチェキ", description: "", requires_member: true, delivery: "ship", sort_order: 0 },
];
const schema = buildSubmissionSchema(tiers, ["m1", "m2"]);
const base = { ticket_number: "ａ－００１", nickname: " たろう ", email: "taro@example.com" };

describe("buildSubmissionSchema", () => {
  it("手渡しだけの人数なら送付先は不要", () => {
    const r = schema.safeParse({ ...base, claimed_count: "1" });
    expect(r.success).toBe(true);
    expect(r.data?.ticket_number).toBe("A-001");
    expect(r.data?.nickname).toBe("たろう");
  });

  it("発送特典があれば希望メンバーと送付先が必須", () => {
    const r = schema.safeParse({ ...base, claimed_count: 3 });
    expect(r.success).toBe(false);
    const errors = flattenErrors(r.error!);
    expect(Object.keys(errors).sort()).toEqual(["address1", "full_name", "members.t3", "phone", "postal_code"]);
  });

  it("全角の郵便番号・電話番号も受け付ける", () => {
    const r = schema.safeParse({
      ...base,
      claimed_count: 3,
      members: { t3: "m2" },
      full_name: "山田太郎",
      phone: "０９０ー１２３４ー５６７８",
      postal_code: "１６０－００２２",
      address1: "東京都新宿区新宿",
    });
    expect(r.success).toBe(true);
    expect(r.data?.phone).toBe("090-1234-5678");
    expect(r.data?.postal_code).toBe("1600022");
  });

  it("段にない人数や公演にいないメンバーは拒否", () => {
    expect(schema.safeParse({ ...base, claimed_count: 2 }).success).toBe(false);
    const r = schema.safeParse({
      ...base, claimed_count: 3, members: { t3: "other" },
      full_name: "a", phone: "090-1234-5678", postal_code: "1600022", address1: "x",
    });
    expect(flattenErrors(r.error!)).toHaveProperty(["members.t3"]);
  });

  it("人数を下げたら不要な選択と送付先を落とす", () => {
    const data = schema.parse({
      ...base, claimed_count: 3, members: { t3: "m1" },
      full_name: "a", phone: "090-1234-5678", postal_code: "1600022", address1: "x",
    });
    const pruned = pruneForCount({ ...data, claimed_count: 1 }, tiers);
    expect(pruned.members).toEqual({});
    expect(pruned.address1).toBe("");
  });
});
