import { describe, expect, it } from "vitest";
import {
  parseWikiPageId,
  parseWikiPageInput,
  parseWikiPageUpdatedAt,
  WIKI_CONTENT_MAX_LENGTH,
  WIKI_PAGE_ID_MAX,
  WIKI_TITLE_MAX_LENGTH,
} from "./wiki";

describe("parseWikiPageInput", () => {
  it("タイトルだけをトリムし、Markdown本文は改行や空白を含めて完全に保持する", () => {
    const content =
      "# 見出し\r\n\r\n- 箇条書き  \n\n```ts\nconst value = 1;\n```\n";

    expect(
      parseWikiPageInput({
        title: "  運用手順  ",
        content,
      })
    ).toEqual({
      ok: true,
      value: {
        title: "運用手順",
        content,
      },
    });
  });

  it("タイトルと本文は上限ちょうどまで受け付ける", () => {
    const title = "題".repeat(WIKI_TITLE_MAX_LENGTH);
    const content = "本".repeat(WIKI_CONTENT_MAX_LENGTH);

    expect(parseWikiPageInput({ title, content })).toEqual({
      ok: true,
      value: { title, content },
    });
  });

  it.each([
    ["null", null],
    ["配列", []],
    ["文字列", "body"],
  ])("%s はリクエストオブジェクトとして拒否する", (_label, input) => {
    expect(parseWikiPageInput(input)).toMatchObject({ ok: false });
  });

  it.each([
    ["title がない", { content: "" }],
    ["title が文字列でない", { title: 1, content: "" }],
    ["content がない", { title: "題" }],
    ["content が文字列でない", { title: "題", content: null }],
    ["未定義の項目がある", { title: "題", content: "", published: true }],
  ])("%s 入力を拒否する", (_label, input) => {
    expect(parseWikiPageInput(input)).toMatchObject({ ok: false });
  });

  it("空白だけのタイトルを拒否する", () => {
    expect(parseWikiPageInput({ title: " \n\t ", content: "" })).toEqual({
      ok: false,
      error: "タイトルは必須です",
    });
  });

  it("タイトルと本文が上限を1文字でも超えたら拒否する", () => {
    expect(
      parseWikiPageInput({
        title: "題".repeat(WIKI_TITLE_MAX_LENGTH + 1),
        content: "",
      })
    ).toMatchObject({ ok: false });

    expect(
      parseWikiPageInput({
        title: "題",
        content: "本".repeat(WIKI_CONTENT_MAX_LENGTH + 1),
      })
    ).toMatchObject({ ok: false });
  });
});

describe("parseWikiPageId", () => {
  it("PostgreSQL Int の範囲内にある正の整数を受け付ける", () => {
    expect(parseWikiPageId("1")).toBe(1);
    expect(parseWikiPageId("42")).toBe(42);
    expect(parseWikiPageId(String(WIKI_PAGE_ID_MAX))).toBe(WIKI_PAGE_ID_MAX);
  });

  it.each([
    "",
    "0",
    "-1",
    "01",
    "1.5",
    " 1",
    "1 ",
    "abc",
    String(WIKI_PAGE_ID_MAX + 1),
  ])("不正なID %j を拒否する", (value) => {
    expect(parseWikiPageId(value)).toBeNull();
  });
});

describe("parseWikiPageUpdatedAt", () => {
  it("ミリ秒を含むISO 8601日時を受け付ける", () => {
    const value = "2026-07-28T04:05:06.000Z";
    expect(parseWikiPageUpdatedAt(value)?.toISOString()).toBe(value);
  });

  it.each([
    null,
    "",
    "2026-07-28",
    "2026-07-28T04:05:06Z",
    "not-a-date",
  ])("曖昧または不正な更新日時 %j を拒否する", (value) => {
    expect(parseWikiPageUpdatedAt(value)).toBeNull();
  });
});
