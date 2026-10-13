import { afterEach, describe, expect, it, vi } from "vitest";
import { CityMapAccountMismatchError } from "./cityMapApi";
import { fetchMerchantSettings, saveMerchantSettings } from "./cityMapMerchantApi";

const settings = { year: 1612, month: 1 };
const endpoint = "/api/city-map/merchant-settings";

afterEach(() => vi.unstubAllGlobals());

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("行商予測設定のAPIクライアント", () => {
  it("キャッシュを使わず指定アカウントの設定を取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ settings }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchMerchantSettings(7)).resolves.toEqual({ settings });
    expect(fetchMock).toHaveBeenCalledWith(endpoint, {
      cache: "no-store", headers: { "X-City-Map-Account-Id": "7" },
    });
  });

  it.each([settings, null])("年月またはnullを保存する", async (value) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ settings: value }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(saveMerchantSettings(7, value)).resolves.toEqual({ settings: value });
    expect(fetchMock).toHaveBeenCalledWith(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-City-Map-Account-Id": "7" },
      cache: "no-store", body: JSON.stringify({ settings: value }),
    });
  });

  it.each([
    ["GET", () => fetchMerchantSettings(7)],
    ["PUT", () => saveMerchantSettings(7, settings)],
  ])("%sのアカウント不一致を専用エラーで伝える", async (_method, invoke) => {
    const message = "ログイン中のアカウントが変わりました。ページを再読み込みしてください。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: message }, { status: 409 })));
    const result = invoke();
    await expect(result).rejects.toBeInstanceOf(CityMapAccountMismatchError);
    await expect(result).rejects.toThrow(message);
  });

  it("保存エラーの日本語メッセージをそのまま返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "月が不正です" }, { status: 400 })));
    await expect(saveMerchantSettings(7, settings)).rejects.toThrow("月が不正です");
  });

  it("保存順序を維持し、再表示時の取得は追加された保存も待つ", async () => {
    const firstResponse = deferredResponse();
    const secondResponse = deferredResponse();
    const latest = { ...settings, month: 7 };
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)
      .mockResolvedValueOnce(Response.json({ settings: latest }));
    vi.stubGlobal("fetch", fetchMock);

    const first = saveMerchantSettings(7, settings);
    const loaded = fetchMerchantSettings(7);
    const second = saveMerchantSettings(7, latest);
    latest.month = 8;
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstResponse.resolve(Response.json({ settings }));
    await first;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PUT", "PUT"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ settings: { ...settings, month: 7 } });

    secondResponse.resolve(Response.json({ settings: { ...settings, month: 7 } }));
    await second;
    await loaded;
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PUT", "PUT", undefined]);
  });

  it("通信に失敗した保存が後続の保存と取得を妨げない", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce(Response.json({ settings }))
      .mockResolvedValueOnce(Response.json({ settings }));
    vi.stubGlobal("fetch", fetchMock);
    const failed = expect(saveMerchantSettings(7, settings)).rejects.toThrow("通信エラー");
    const next = saveMerchantSettings(7, settings);
    const loaded = fetchMerchantSettings(7);
    await failed;
    await expect(next).resolves.toEqual({ settings });
    await expect(loaded).resolves.toEqual({ settings });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PUT", "PUT", undefined]);
  });

  it("別アカウントの保存と取得は待たせない", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const accountId = (init.headers as Record<string, string>)["X-City-Map-Account-Id"];
      return accountId === "7" ? pending.promise : Promise.resolve(Response.json({ settings }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const held = saveMerchantSettings(7, settings);
    await expect(saveMerchantSettings(8, settings)).resolves.toEqual({ settings });
    await expect(fetchMerchantSettings(8)).resolves.toEqual({ settings });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending.resolve(Response.json({ settings }));
    await held;
  });
});
