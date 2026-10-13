import { afterEach, describe, expect, it, vi } from "vitest";
import { CityMapAccountMismatchError, fetchCityMap, saveCityMap } from "./cityMapApi";
import { fetchMerchantSettings, saveMerchantSettings } from "./cityMapMerchantApi";
import { resetCityMapData } from "./cityMapResetApi";
import { fetchCityScouts, saveCityScouts } from "./cityScoutApi";

const endpoint = "/api/city-map/reset";
const settings = { year: 1634, month: 9 };
const scoutResponse = { reports: [], savedCityNames: ["ブルゴス"], skippedCityNames: [] };

afterEach(() => vi.unstubAllGlobals());

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("都市地図のデータリセットAPIクライアント", () => {
  it("指定アカウントのリセットを送信し成功を確認する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resetCityMapData(7)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-City-Map-Account-Id": "7" },
      cache: "no-store",
      body: JSON.stringify({}),
    });
  });

  it("アカウント不一致を再読み込みを案内できる専用エラーで伝える", async () => {
    const message = "ログイン中のアカウントが変わりました。ページを再読み込みしてください。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: message }, { status: 409 })));

    const reset = resetCityMapData(7);
    await expect(reset).rejects.toBeInstanceOf(CityMapAccountMismatchError);
    await expect(reset).rejects.toThrow(message);
  });

  it("サーバーが返したエラーメッセージを伝える", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: "リセットできませんでした" }, { status: 500 })
    ));
    await expect(resetCityMapData(7)).rejects.toThrow("リセットできませんでした");
  });

  it.each([
    () => new Response("Internal Server Error", { status: 500 }),
    () => new Response("invalid JSON", { status: 200 }),
    () => Response.json({ ok: false }),
    () => Response.json({}),
  ])("リセットの成功を確認できない応答では成功扱いにしない", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    await expect(resetCityMapData(7)).rejects.toThrow("都市地図のデータリセットに失敗しました");
  });

  it("地図・行商設定・偵察結果の保存をすべて終えてからリセットする", async () => {
    const responses = [deferredResponse(), deferredResponse(), deferredResponse()];
    const fetchMock = vi.fn()
      .mockReturnValueOnce(responses[0].promise)
      .mockReturnValueOnce(responses[1].promise)
      .mockReturnValueOnce(responses[2].promise)
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const map = saveCityMap(7, "保存中の地図");
    const merchant = saveMerchantSettings(7, settings);
    const scouts = saveCityScouts(7, "保存中の偵察情報");
    const reset = resetCityMapData(7);
    await Promise.resolve();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/city-map"]);

    responses[0].resolve(Response.json({ source: "保存中の地図" }));
    await map;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/city-map/merchant-settings");

    responses[1].resolve(Response.json({ settings }));
    await merchant;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/city-map/scouts");

    responses[2].resolve(Response.json(scoutResponse));
    await scouts;
    await reset;
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/city-map", "/api/city-map/merchant-settings", "/api/city-map/scouts", endpoint,
    ]);
  });

  it("再表示時の地図・行商設定・偵察結果はリセット完了後のデータを取得する", async () => {
    const response = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === endpoint) return response.promise;
      if (url === "/api/city-map") return Promise.resolve(Response.json({ source: "" }));
      if (url === "/api/city-map/merchant-settings") return Promise.resolve(Response.json({ settings: null }));
      return Promise.resolve(Response.json({ reports: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const reset = resetCityMapData(7);
    const map = fetchCityMap(7);
    const merchant = fetchMerchantSettings(7);
    const scouts = fetchCityScouts(7);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    response.resolve(Response.json({ ok: true }));
    await reset;

    await expect(map).resolves.toEqual({ source: "" });
    await expect(merchant).resolves.toEqual({ settings: null });
    await expect(scouts).resolves.toEqual({ reports: [] });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      endpoint, "/api/city-map", "/api/city-map/merchant-settings", "/api/city-map/scouts",
    ]);
  });

  it("取得が保存を待っている間にリセットが追加された場合もリセット完了を待つ", async () => {
    const saveResponse = deferredResponse();
    const resetResponse = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(saveResponse.promise)
      .mockReturnValueOnce(resetResponse.promise)
      .mockResolvedValueOnce(Response.json({ source: "" }));
    vi.stubGlobal("fetch", fetchMock);

    const saving = saveCityScouts(7, "保存中の偵察情報");
    const map = fetchCityMap(7);
    const reset = resetCityMapData(7);
    saveResponse.resolve(Response.json(scoutResponse));
    await saving;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/city-map/scouts", endpoint]);

    resetResponse.resolve(Response.json({ ok: true }));
    await reset;
    await expect(map).resolves.toEqual({ source: "" });
  });

  it("先行する保存が失敗してもリセットを実行する", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const failed = expect(saveMerchantSettings(7, settings)).rejects.toThrow("通信エラー");
    const reset = resetCityMapData(7);
    await failed;
    await expect(reset).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/city-map/merchant-settings", endpoint]);
  });

  it("リセット失敗後も新たな保存と取得を続ける", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce(Response.json(scoutResponse))
      .mockResolvedValueOnce(Response.json({ reports: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const failed = expect(resetCityMapData(7)).rejects.toThrow("通信エラー");
    const saving = saveCityScouts(7, "新しい偵察情報");
    const reading = fetchCityScouts(7);
    await failed;
    await expect(saving).resolves.toEqual(scoutResponse);
    await expect(reading).resolves.toEqual({ reports: [] });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["POST", "POST", undefined]);
  });

  it("別アカウントのリセット・保存・取得は実行中のリセットを待たない", async () => {
    const response = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      const accountId = (init.headers as Record<string, string>)["X-City-Map-Account-Id"];
      if (accountId === "7") return response.promise;
      return Promise.resolve(Response.json(url === endpoint ? { ok: true } : { source: "別アカウントの地図" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const reset = resetCityMapData(7);
    await expect(resetCityMapData(8)).resolves.toBeUndefined();
    await expect(saveCityMap(8, "別アカウントの地図")).resolves.toEqual({ source: "別アカウントの地図" });
    await expect(fetchCityMap(8)).resolves.toEqual({ source: "別アカウントの地図" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    response.resolve(Response.json({ ok: true }));
    await reset;
  });
});
