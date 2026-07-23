import { describe, expect, it } from "vitest";
import {
  MATCHUP_TRAITS,
  META_MIN_TIER_DECIDED,
  META_PERIODS,
  RANKING_LAST10_KEY,
  metaTier,
} from "./meta";

describe("meta domain constants", () => {
  it("公開している特性と期間の順序を維持する", () => {
    expect(MATCHUP_TRAITS).toEqual([
      "武特",
      "知特",
      "統特",
      "武統",
      "知武",
      "統知",
      "戦闘狂",
    ]);
    expect(META_PERIODS.at(-1)).toEqual({
      key: "all",
      label: "全期間",
      from: null,
      to: null,
    });
    expect(RANKING_LAST10_KEY).toBe("last10");
  });
});

describe("metaTier", () => {
  it("既存の閾値と最小サンプル数を維持する", () => {
    expect(metaTier(0.16, 0.66, META_MIN_TIER_DECIDED)).toBe("S+");
    expect(metaTier(0.16, 0.66, META_MIN_TIER_DECIDED - 1)).toBeNull();
    expect(metaTier(0, 0.44, META_MIN_TIER_DECIDED)).toBe("C");
  });
});
