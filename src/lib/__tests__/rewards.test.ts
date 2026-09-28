import { describe, expect, it } from "vitest";
import { countChoices, eligibleTiers, needsShipping, tiersRequiringMember } from "../rewards";
import type { RewardTier } from "../types";

const tier = (id: string, min: number, requires = true, delivery: "ship" | "hand" = "ship"): RewardTier => ({
  id,
  event_id: "e",
  min_count: min,
  name: id,
  description: "",
  requires_member: requires,
  delivery,
  sort_order: 0,
});

const tiers = [tier("poster", 10), tier("postcard", 1, false), tier("deco", 3), tier("voice", 5)];

describe("rewards", () => {
  it("人数に応じて下の段の特典も累積でもらえる", () => {
    expect(eligibleTiers(tiers, 10).map((t) => t.id)).toEqual(["postcard", "deco", "voice", "poster"]);
    expect(eligibleTiers(tiers, 5).map((t) => t.id)).toEqual(["postcard", "deco", "voice"]);
    expect(eligibleTiers(tiers, 4).map((t) => t.id)).toEqual(["postcard", "deco"]);
    expect(eligibleTiers(tiers, 0)).toEqual([]);
  });

  it("希望メンバーが必要な特典だけを返す", () => {
    expect(tiersRequiringMember(tiers, 10).map((t) => t.id)).toEqual(["deco", "voice", "poster"]);
    expect(tiersRequiringMember(tiers, 1)).toEqual([]);
  });

  it("人数の選択肢は段の必要人数", () => {
    expect(countChoices([...tiers, tier("x", 10)])).toEqual([1, 3, 5, 10]);
  });

  it("手渡しだけなら発送不要", () => {
    expect(needsShipping([tier("a", 1, false, "hand")])).toBe(false);
    expect(needsShipping([tier("a", 1, false, "hand"), tier("b", 3)])).toBe(true);
  });
});

import { isoToJstInput, jstInputToIso } from "../datetime";

describe("datetime", () => {
  it("datetime-local は日本時間として扱う", () => {
    expect(jstInputToIso("2026-09-29T18:00")).toBe("2026-09-29T09:00:00.000Z");
    expect(isoToJstInput("2026-09-29T09:00:00.000Z")).toBe("2026-09-29T18:00");
    expect(jstInputToIso("")).toBeNull();
  });
});
