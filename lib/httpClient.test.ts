import { describe, expect, it } from "vitest";
import {
  readJsonResponse,
  responseErrorMessage,
  throwIfResponseFailed,
} from "./httpClient";

describe("readJsonResponse", () => {
  it("JSONレスポンスを読み取る", async () => {
    const response = new Response(JSON.stringify({ ok: true }));
    await expect(readJsonResponse(response)).resolves.toEqual({ ok: true });
  });

  it("JSONでなければ null を返す", async () => {
    const response = new Response("not-json");
    await expect(readJsonResponse(response)).resolves.toBeNull();
  });
});

describe("responseErrorMessage", () => {
  it("APIのエラー文言を優先し、無ければフォールバックする", () => {
    expect(responseErrorMessage({ error: "詳細" }, "失敗")).toBe("詳細");
    expect(responseErrorMessage({}, "失敗")).toBe("失敗");
    expect(responseErrorMessage(null, "失敗")).toBe("失敗");
  });
});

describe("throwIfResponseFailed", () => {
  it("成功レスポンスでは何もしない", async () => {
    await expect(
      throwIfResponseFailed(new Response(null, { status: 204 }), "失敗")
    ).resolves.toBeUndefined();
  });

  it("失敗レスポンスではAPIのエラー文言を持つ例外を投げる", async () => {
    const response = new Response(JSON.stringify({ error: "認証エラー" }), {
      status: 401,
    });
    await expect(throwIfResponseFailed(response, "失敗")).rejects.toThrow(
      "認証エラー"
    );
  });
});
