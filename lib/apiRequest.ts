/** JSONボディのパースに失敗した場合に返す共通エラーメッセージ。 */
export const INVALID_JSON_BODY_ERROR = "リクエストボディが不正な JSON です";

/** JSONボディがオブジェクトでなかった場合に返す共通エラーメッセージ。 */
export const BODY_MUST_BE_OBJECT_ERROR =
  "リクエストボディはオブジェクトである必要があります";

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

export function isObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
