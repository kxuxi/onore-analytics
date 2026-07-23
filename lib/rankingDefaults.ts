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
