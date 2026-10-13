import { afterEach, describe, expect, it, vi } from "vitest";
import { CityMapAccountMismatchError } from "./cityMapApi";
import { fetchCityScouts, saveCityScouts } from "./cityScoutApi";

const endpoint = "/api/city-map/scouts";
const source = "1634年9月\nブルゴス [己鯖夕食突撃部] : 大都市\n人口 : 618700人 治安 : 99";
const loaded = { reports: [] };
const saved = { ...loaded, savedCityNames: ["ブルゴス"], skippedCityNames: [] };

afterEach(() => vi.unstubAllGlobals());

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("都市偵察結果のAPIクライアント", () => {
  it("キャッシュを使わず指定アカウントの偵察結果を取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(loaded));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchCityScouts(7)).resolves.toEqual(loaded);
    expect(fetchMock).toHaveBeenCalledWith(endpoint, {
      cache: "no-store", headers: { "X-City-Map-Account-Id": "7" },
    });
  });

  it("貼り付けた原文をサーバーへ送り保存結果を受け取る", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(saved));
    vi.stubGlobal("fetch", fetchMock);
    await expect(saveCityScouts(7, source)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith(endpoint, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-City-Map-Account-Id": "7" },
      body: JSON.stringify({ source }),
    });
  });

  it.each([
    ["GET", () => fetchCityScouts(7)],
    ["POST", () => saveCityScouts(7, source)],
  ])("%sのアカウント不一致を専用エラーで伝える", async (_method, invoke) => {
    const message = "ログイン中のアカウントが変わりました。ページを再読み込みしてください。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: message }, { status: 409 })));
    const result = invoke();
    await expect(result).rejects.toBeInstanceOf(CityMapAccountMismatchError);
    await expect(result).rejects.toThrow(message);
  });

  it("サーバーの解析エラーメッセージを返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "年月が必要です" }, { status: 400 })));
    await expect(saveCityScouts(7, source)).rejects.toThrow("年月が必要です");
  });

  it("保存を直列化し、再表示時は追加の保存完了も待って取得する", async () => {
    const firstResponse = deferredResponse();
    const secondResponse = deferredResponse();
    const nextSource = source.replace("9月", "10月");
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)
      .mockResolvedValueOnce(Response.json(loaded));
    vi.stubGlobal("fetch", fetchMock);
    const first = saveCityScouts(7, source);
    const reading = fetchCityScouts(7);
    const second = saveCityScouts(7, nextSource);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    firstResponse.resolve(Response.json(saved));
    await first;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ source: nextSource });
    secondResponse.resolve(Response.json(saved));
    await second;
    await reading;
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["POST", "POST", undefined]);
  });

  it("保存失敗後も後続の保存と読み込みを続ける", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce(Response.json(saved))
      .mockResolvedValueOnce(Response.json(loaded)));
    const failed = expect(saveCityScouts(7, source)).rejects.toThrow("通信エラー");
    const next = saveCityScouts(7, source);
    const reading = fetchCityScouts(7);
    await failed;
    await expect(next).resolves.toEqual(saved);
    await expect(reading).resolves.toEqual(loaded);
  });

  it("別アカウントの保存と取得は待たせない", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const accountId = (init.headers as Record<string, string>)["X-City-Map-Account-Id"];
      return accountId === "7" ? pending.promise : Promise.resolve(Response.json(saved));
    });
    vi.stubGlobal("fetch", fetchMock);
    const held = saveCityScouts(7, source);
    await expect(saveCityScouts(8, source)).resolves.toEqual(saved);
    await expect(fetchCityScouts(8)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending.resolve(Response.json(saved));
    await held;
  });
});
