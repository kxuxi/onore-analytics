/**
 * ウォッチリスト（お気に入り武将）を localStorage に保存・取得するクライアント専用ヘルパー。
 * 注目したい武将を複数ブックマークし、ホームから素早くアクセスするために使う。
 * 「自分の武将」（myWarlord＝cookie・単一）とは別で、こちらは複数・順序付き。
 * SSR では localStorage が無いため、すべて no-op / 空配列を返す。
 */

/** ウォッチリストを保存する localStorage キー。 */
export const WATCHLIST_KEY = "onore-tool:watchlist:v1";

/** 保存上限（過剰な肥大を防ぐ）。 */
export const MAX_WATCHLIST = 100;

/**
 * 保存文字列を武将名配列にパースする（純粋関数・テスト可能）。
 * JSON 配列の文字列要素のみ採用し、空白・重複を除いて上限で切る。
 * 破損データ（非配列・不正 JSON）は空配列にフォールバックする。
 */
export function parseWatchlist(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of data) {
      if (typeof item !== "string") continue;
      const name = item.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
      if (out.length >= MAX_WATCHLIST) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** ウォッチリストを取得する。未設定・SSR・破損時は空配列。 */
export function getWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY));
  } catch {
    return [];
  }
}

/** ウォッチリストを保存する（SSR・容量超過・プライベートモードでは静かに失敗）。 */
export function saveWatchlist(names: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(names));
  } catch {
    /* 保存できない環境では何もしない（機能はメモリ上で動く） */
  }
}

/** 指定名がウォッチリストに含まれるか（純粋関数）。 */
export function isWatched(list: string[], name: string): boolean {
  return list.includes(name.trim());
}

/**
 * 指定名の在否を反転した新しいウォッチリストを返す（純粋関数）。
 * 未登録なら先頭に追加（最近追加が上）、登録済みなら取り除く。上限超過分は末尾を切る。
 */
export function toggleWatched(list: string[], name: string): string[] {
  const n = name.trim();
  if (!n) return list;
  if (list.includes(n)) return list.filter((x) => x !== n);
  return [n, ...list].slice(0, MAX_WATCHLIST);
}
