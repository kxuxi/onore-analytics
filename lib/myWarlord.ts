/**
 * 「自分の武将」をクッキーに保存・取得するクライアント専用ヘルパー。
 * ホーム画面のダッシュボードで、どの武将のサマリを表示するかを永続化する。
 * SSR では document が無いため、すべて no-op / null を返す。
 */

/** 自分の武将名を保存するクッキー名。 */
export const MY_WARLORD_COOKIE = "onore_my_warlord";

/** クッキーの有効期間（約1年・秒）。 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * クッキー文字列から指定キーの生値を取り出す（純粋関数・テスト可能）。
 * document に依存しないため、パース部分を単体で検証できる。
 */
export function readCookieValue(cookie: string, key: string): string | null {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === key) return part.slice(eq + 1).trim();
  }
  return null;
}

/** 保存済みの「自分の武将」名を取得する。未設定・SSR では null。 */
export function getMyWarlord(): string | null {
  if (typeof document === "undefined") return null;
  const raw = readCookieValue(document.cookie, MY_WARLORD_COOKIE);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return null;
  }
}

/** 「自分の武将」名を保存する（path=/, 約1年, SameSite=Lax）。 */
export function setMyWarlord(name: string): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(name);
  document.cookie = `${MY_WARLORD_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** 「自分の武将」の保存を解除する。 */
export function clearMyWarlord(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${MY_WARLORD_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
