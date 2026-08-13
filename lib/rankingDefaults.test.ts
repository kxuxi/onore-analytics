import { describe, expect, it } from "vitest";
import {
  ASSET_RANKING_MIN_COUNT_OPTIONS,
  DEFAULT_RANKING_FILTERS_OPEN,
  DEFAULT_RANKING_MIN_COUNT,
  DEFAULT_RANKING_PERIOD_KEY,
  RANK_METRIC_DESCRIPTIONS,
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

describe("RANK_METRIC_DESCRIPTIONS（武将ランキングと兵種・武器・品物ランキングで共有する算出方法の説明文）", () => {
  it("武将ランキング・兵種等ランキングで共通の5指標すべてに説明文がある", () => {
    expect(Object.keys(RANK_METRIC_DESCRIPTIONS).sort()).toEqual(
      [
        "breakthrough",
        "breakthroughRate",
        "pontaPoint",
        "ppn",
        "winRate",
      ].sort()
    );
    for (const desc of Object.values(RANK_METRIC_DESCRIPTIONS)) {
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it("PontaPointの説明文は武将ランキング（MetricsTab）の文言を正とする", () => {
    expect(RANK_METRIC_DESCRIPTIONS.pontaPoint).toBe(
      "ジョンさん印の指標。(出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。普通の勝率の分子で守備の1勝を1.4勝としてボーナスしたもの。"
    );
  });
});
