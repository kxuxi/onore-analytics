import { afterEach, describe, expect, it, vi } from "vitest";
import { CityMapAccountMismatchError, fetchCityMap, saveCityMap } from "./cityMapApi";

afterEach(() => vi.unstubAllGlobals());

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("都市地図のAPIクライアント", () => {
  it("キャッシュを使わずアカウントの地図を取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ source: "地図" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCityMap(7)).resolves.toEqual({ source: "地図" });
    expect(fetchMock).toHaveBeenCalledWith("/api/city-map", {
      cache: "no-store",
      headers: { "X-City-Map-Account-Id": "7" },
    });
  });

  it("空文字も含め元テキストだけを送信する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ source: "" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveCityMap(7, "")).resolves.toEqual({ source: "" });
    expect(fetchMock).toHaveBeenCalledWith("/api/city-map", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-City-Map-Account-Id": "7",
      },
      cache: "no-store",
      body: JSON.stringify({ source: "" }),
    });
  });

  it("サーバーからの保存エラーを画面へ伝える", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: "最大10×10です" }, { status: 400 })
    ));
    await expect(saveCityMap(7, "不正な地図")).rejects.toThrow("最大10×10です");
  });

  it.each([
    ["GET", () => fetchCityMap(7)],
    ["PUT", () => saveCityMap(7, "地図")],
  ])("%sのアカウント不一致は再読み込みを案内できる専用エラーにする", async (_method, invoke) => {
    const message = "ログイン中のアカウントが変わりました。ページを再読み込みしてください。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: message }, { status: 409 })
    ));

    const response = invoke();
    await expect(response).rejects.toBeInstanceOf(CityMapAccountMismatchError);
    await expect(response).rejects.toThrow(message);
  });

  it("同じアカウントの保存が完了するまで次の保存を送信しない", async () => {
    const firstResponse = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(Response.json({ source: "新しい地図" }));
    vi.stubGlobal("fetch", fetchMock);

    const first = saveCityMap(7, "古い地図");
    const second = saveCityMap(7, "新しい地図");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ source: "古い地図" });

    firstResponse.resolve(Response.json({ source: "古い地図" }));
    await first;
    await expect(second).resolves.toEqual({ source: "新しい地図" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ source: "新しい地図" });
  });

  it("タブ再表示時の取得は待機中に追加された保存もすべて終えてから行う", async () => {
    const firstResponse = deferredResponse();
    const secondResponse = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)
      .mockResolvedValueOnce(Response.json({ source: "最新の地図" }));
    vi.stubGlobal("fetch", fetchMock);

    const first = saveCityMap(7, "最初の地図");
    const loaded = fetchCityMap(7);
    const second = saveCityMap(7, "最新の地図");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstResponse.resolve(Response.json({ source: "最初の地図" }));
    await first;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PUT", "PUT"]);

    secondResponse.resolve(Response.json({ source: "最新の地図" }));
    await second;
    await expect(loaded).resolves.toEqual({ source: "最新の地図" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].method).toBeUndefined();
  });

  it("保存に失敗しても待機していた取得を続行できる", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce(Response.json({ source: "保存済みの地図" }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = expect(saveCityMap(7, "未保存の地図")).rejects.toThrow("通信エラー");
    const loaded = fetchCityMap(7);

    await saved;
    await expect(loaded).resolves.toEqual({ source: "保存済みの地図" });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PUT", undefined]);
  });

  it("失敗した保存が後続の保存を妨げない", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce(Response.json({ source: "再試行した地図" }));
    vi.stubGlobal("fetch", fetchMock);

    const first = expect(saveCityMap(7, "失敗する地図")).rejects.toThrow("通信エラー");
    const second = saveCityMap(7, "再試行した地図");

    await first;
    await expect(second).resolves.toEqual({ source: "再試行した地図" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("別アカウントの保存や取得は処理中のアカウントを待たない", async () => {
    const heldResponse = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const accountId = (init.headers as Record<string, string>)["X-City-Map-Account-Id"];
      return accountId === "7"
        ? heldResponse.promise
        : Promise.resolve(Response.json({ source: "別アカウントの地図" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const held = saveCityMap(7, "処理中の地図");
    await expect(saveCityMap(8, "別アカウントの地図")).resolves.toEqual({ source: "別アカウントの地図" });
    await expect(fetchCityMap(8)).resolves.toEqual({ source: "別アカウントの地図" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    heldResponse.resolve(Response.json({ source: "処理中の地図" }));
    await held;
  });
});
