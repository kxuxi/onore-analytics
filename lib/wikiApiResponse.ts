import { NextResponse } from "next/server";

const PRIVATE_NO_STORE = "private, no-store";

/** Wiki APIの機密データをブラウザや中間キャッシュに残さないJSON応答。 */
export function wikiJson(
  body: unknown,
  init?: { status?: number }
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

/** 認証エラーや共通エラー応答にも同じキャッシュ制御を付与する。 */
export function withWikiNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}
