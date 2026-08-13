/** ランキング画面で最初に選択する集計期間。 */
export const DEFAULT_RANKING_PERIOD_KEY = "all";

/** ランキング画面で最初に適用する最低集計回数。 */
export const DEFAULT_RANKING_MIN_COUNT = 10;

/** ランキング画面では初期状態からフィルターを表示する。 */
export const DEFAULT_RANKING_FILTERS_OPEN = true;

/** 武将ランキングで選択できる最低集計回数。 */
export const WARLORD_RANKING_MIN_COUNT_OPTIONS = [1, 5, 10, 20, 30] as const;

/** 兵種・武器・品物ランキングで選択できる最低使用回数。 */
export const ASSET_RANKING_MIN_COUNT_OPTIONS = [1, 10, 30, 50, 100] as const;

/**
 * 武将ランキングと兵種・武器・品物ランキングの両方に登場する指標キー。
 * どちらの画面でも同じ計算式なので、算出方法の説明文を共有する。
 */
export type SharedRankMetricKey =
  | "ppn"
  | "pontaPoint"
  | "winRate"
  | "breakthrough"
  | "breakthroughRate";

/**
 * 指標ごとの算出方法の説明文（「算出方法」の展開表示に使う）。
 * 武将ランキング（MetricsTab）の文言を正としており、他画面はここを参照する。
 */
export const RANK_METRIC_DESCRIPTIONS: Record<SharedRankMetricKey, string> = {
  ppn: "PontaPoint ＋ 抜き率。野球で言えばOPS（出塁率＋長打率）のような総合力の指標。",
  pontaPoint:
    "ジョンさん印の指標。(出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。普通の勝率の分子で守備の1勝を1.4勝としてボーナスしたもの。",
  winRate:
    "(出兵勝 + 守備勝) ÷ 戦闘数（撤退戦を除く）。撤退を除いた普通の勝率。野球で言えば打率。",
  breakthrough:
    "1×(1枚抜き) + 2×(2枚抜き) + … + n×(n枚抜き)。野球で言えば塁打数。",
  breakthroughRate:
    "抜き数 ÷ 出兵数（各出兵を１回と数え、２戦目以降は数えません）。野球で言えば長打率。またの名をランカス度。",
};
