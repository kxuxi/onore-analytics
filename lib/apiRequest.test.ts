import { describe, expect, it } from "vitest";
import {
  BODY_MUST_BE_OBJECT_ERROR,
  INVALID_JSON_BODY_ERROR,
  isObject,
  readJsonBody,
} from "./apiRequest";

describe("readJsonBody", () => {
  it("正しいJSONを unknown のまま返す", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ value: 1 }),
    });
    await expect(readJsonBody(request)).resolves.toEqual({
      ok: true,
      value: { value: 1 },
    });
  });

  it("不正なJSONを失敗として返す", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      body: "{",
    });
    await expect(readJsonBody(request)).resolves.toEqual({ ok: false });
  });
});

describe("isObject", () => {
  it("null以外のオブジェクトを判定する", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject("value")).toBe(false);
  });
});

describe("共通エラーメッセージ", () => {
  it("複数のAPIルートで同じ文言を共有する（表記ゆれを防ぐ）", () => {
    expect(INVALID_JSON_BODY_ERROR).toBe("リクエストボディが不正な JSON です");
    expect(BODY_MUST_BE_OBJECT_ERROR).toBe(
      "リクエストボディはオブジェクトである必要があります"
    );
  });
});
