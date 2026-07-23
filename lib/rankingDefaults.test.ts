import { describe, expect, it } from "vitest";
import {
  ASSET_RANKING_MIN_COUNT_OPTIONS,
  DEFAULT_RANKING_FILTERS_OPEN,
  DEFAULT_RANKING_MIN_COUNT,
  DEFAULT_RANKING_PERIOD_KEY,
  WARLORD_RANKING_MIN_COUNT_OPTIONS,
} from "./rankingDefaults";

describe("ランキングの公開初期条件", () => {
  it("全ランキングを全期間・最低10回・フィルター表示で開く", () => {
    expect(DEFAULT_RANKING_PERIOD_KEY).toBe("all");
    expect(DEFAULT_RANKING_MIN_COUNT).toBe(10);
    expect(DEFAULT_RANKING_FILTERS_OPEN).toBe(true);
  });

  it("武将と装備系の最低回数選択肢に既存値を維持する", () => {
    expect(WARLORD_RANKING_MIN_COUNT_OPTIONS).toEqual([1, 5, 10, 20, 30]);
    expect(ASSET_RANKING_MIN_COUNT_OPTIONS).toEqual([1, 10, 30, 50, 100]);
  });
});
