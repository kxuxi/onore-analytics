/** ホームの武将検索に表示する候補数。既存UIの上限を維持する。 */
export const HOME_WARLORD_SUGGESTION_LIMIT = 12;

/**
 * 並び替え済みの武将名から、ホームに表示する部分一致候補を返す。
 * 呼び出し元で日本語順に並べた順序は変更しない。
 */
export function filterHomeWarlordSuggestions(
  names: string[],
  query: string,
  limit = HOME_WARLORD_SUGGESTION_LIMIT
): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || limit <= 0) return [];

  return names
    .filter((name) => name.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);
}

export type SuggestionMove = "next" | "previous" | "first" | "last";

/** 候補リスト内を循環移動するときの次の位置を返す。 */
export function moveHomeSuggestionIndex(
  currentIndex: number,
  itemCount: number,
  move: SuggestionMove
): number {
  if (itemCount <= 0) return -1;
  if (move === "first") return 0;
  if (move === "last") return itemCount - 1;
  if (move === "next") {
    return currentIndex < 0 || currentIndex >= itemCount - 1
      ? 0
      : currentIndex + 1;
  }
  return currentIndex <= 0 || currentIndex >= itemCount
    ? itemCount - 1
    : currentIndex - 1;
}
