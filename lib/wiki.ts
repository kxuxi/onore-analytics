import type { WikiPageInput } from "./types";
import { isObject } from "./apiRequest";

export const WIKI_TITLE_MAX_LENGTH = 120;
export const WIKI_CONTENT_MAX_LENGTH = 500_000;
export const WIKI_PAGE_ID_MAX = 2_147_483_647;

export type WikiPageInputResult =
  | { ok: true; value: WikiPageInput }
  | { ok: false; error: string };

/** Wikiの作成・更新入力を、保存前に一か所で検証する。 */
export function parseWikiPageInput(input: unknown): WikiPageInputResult {
  if (!isObject(input) || Array.isArray(input)) {
    return {
      ok: false,
      error: "リクエストボディはオブジェクトである必要があります",
    };
  }

  const unknownKeys = Object.keys(input).filter(
    (key) => key !== "title" && key !== "content"
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `使用できない項目が含まれています: ${unknownKeys.join(", ")}`,
    };
  }

  if (typeof input.title !== "string") {
    return { ok: false, error: "title は文字列で指定してください" };
  }
  if (typeof input.content !== "string") {
    return { ok: false, error: "content は文字列で指定してください" };
  }

  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "タイトルは必須です" };
  }
  if (title.length > WIKI_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `タイトルは${WIKI_TITLE_MAX_LENGTH}文字以内で入力してください`,
    };
  }
  if (input.content.length > WIKI_CONTENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `本文は${WIKI_CONTENT_MAX_LENGTH.toString()}文字以内で入力してください`,
    };
  }

  return {
    ok: true,
    value: {
      title,
      content: input.content,
    },
  };
}

/** 動的ルートのIDを、正の安全な整数だけに制限する。 */
export function parseWikiPageId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= WIKI_PAGE_ID_MAX ? id : null;
}

/** 更新競合の比較に使うISO 8601日時だけを受け付ける。 */
export function parseWikiPageUpdatedAt(value: string | null): Date | null {
  if (!value || value.length > 64) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) return null;
  return date;
}
