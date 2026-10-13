import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/authGuard", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: mocks.user } }));

import { GET, PUT } from "@/app/api/city-map/merchant-settings/route";
import type { MerchantSettings } from "./cityMapMerchants";

const settings: MerchantSettings = { year: 1612, month: 1 };
const endpoint = "http://localhost/api/city-map/merchant-settings";

function request(method: "GET" | "PUT", body?: unknown, accountId?: string): Request {
  return new Request(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accountId === undefined ? {} : { "X-City-Map-Account-Id": accountId }),
    },
    ...(method === "PUT" ? { body: JSON.stringify(body) } : {}),
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSessionUser.mockReturnValue({ uid: 7, username: "alice", exp: Date.now() + 60_000 });
  mocks.user.findUnique.mockResolvedValue({ cityMapMerchantSettings: settings });
  mocks.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("行商予測設定の認証・アカウント分離", () => {
  it.each(["GET", "PUT"] as const)("未認証の%sはDBへ触れず401を返す", async (method) => {
    mocks.getSessionUser.mockReturnValue(null);
    const response = await (method === "GET" ? GET : PUT)(request(method, { settings }));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT"] as const)("古いタブの%sはDBへ触れず409を返す", async (method) => {
    const response = await (method === "GET" ? GET : PUT)(request(method, { settings }, "8"));
    expect(response.status).toBe(409);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({
      error: "ログイン中のアカウントが変わりました。ページを再読み込みしてください。",
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it.each(["", "07", "7.0", "7,8"])("アカウントヘッダー%sは厳密に比較する", async (accountId) => {
    const response = await GET(request("GET", undefined, accountId));
    expect(response.status).toBe(409);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("本文のIDを使わず、切り替えたアカウントの年月を個別に保存・取得する", async () => {
    const bobSettings = { year: 1700, month: 7 };
    const accounts = new Map<number, MerchantSettings | null>([[7, settings], [8, bobSettings]]);
    mocks.user.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => (
      accounts.has(where.id) ? { cityMapMerchantSettings: accounts.get(where.id) } : null
    ));
    mocks.user.updateMany.mockImplementation(async ({ where, data }: {
      where: { id: number };
      data: { cityMapMerchantSettings: MerchantSettings };
    }) => {
      if (!accounts.has(where.id)) return { count: 0 };
      accounts.set(where.id, data.cityMapMerchantSettings);
      return { count: 1 };
    });
    const updated = { year: 1650, month: 11 };
    const response = await PUT(request("PUT", { settings: updated, userId: 8, uid: 8 }, "7"));
    expect(response.status).toBe(200);
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 }, data: { cityMapMerchantSettings: updated },
    });
    await expect((await GET(request("GET", undefined, "7"))).json()).resolves.toEqual({ settings: updated });

    mocks.getSessionUser.mockReturnValue({ uid: 8, username: "bob" });
    await expect((await GET(request("GET", undefined, "8"))).json()).resolves.toEqual({ settings: bobSettings });
    expect(accounts.get(8)).toEqual(bobSettings);
    expect(mocks.user.findUnique).toHaveBeenLastCalledWith({
      where: { id: 8 }, select: { cityMapMerchantSettings: true },
    });
  });

  it.each(["GET", "PUT"] as const)("削除済みアカウントの%sは401を返す", async (method) => {
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.user.updateMany.mockResolvedValue({ count: 0 });
    const response = await (method === "GET" ? GET : PUT)(request(method, { settings }));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
  });
});

describe("行商予測設定の読み書き", () => {
  it("保存済み年月をキャッシュせず取得する", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({ settings });
    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 }, select: { cityMapMerchantSettings: true },
    });
  });

  it("未設定のアカウントはnullを返す", async () => {
    mocks.user.findUnique.mockResolvedValue({ cityMapMerchantSettings: null });
    await expect((await GET(request("GET"))).json()).resolves.toEqual({ settings: null });
  });

  it("以前保存した時刻付き設定は年月だけを返す", async () => {
    mocks.user.findUnique.mockResolvedValue({ cityMapMerchantSettings: { ...settings, time: "08:00" } });
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings });
  });

  it.each(["08:00", "不明な旧時刻", 800, null])("旧形式の時刻%sを無視し年月だけを保存する", async (time) => {
    const response = await PUT(request("PUT", { settings: { ...settings, time } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 }, data: { cityMapMerchantSettings: settings },
    });
  });

  it.each([
    { year: 1612, month: 1 },
    { year: 1719, month: 7 },
    { year: 1600, month: 12 },
    { year: 1720, month: 1 },
    { year: 1, month: 1 },
    { year: 9999, month: 12 },
  ])("出現期間外も含め年月 $year/$month をそのまま保存する", async (value) => {
    const response = await PUT(request("PUT", { settings: value }));
    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({ settings: value });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 }, data: { cityMapMerchantSettings: value },
    });
  });

  it("nullで予測年月だけを消去する", async () => {
    const response = await PUT(request("PUT", { settings: null }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings: null });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 }, data: { cityMapMerchantSettings: Prisma.DbNull },
    });
  });

  it.each([
    ["null本文", null],
    ["配列本文", []],
    ["文字列本文", "settings"],
    ["設定なし", {}],
    ["配列設定", { settings: [] }],
    ["年なし", { settings: { month: 1 } }],
    ["年が文字列", { settings: { ...settings, year: "1612" } }],
    ["年が小数", { settings: { ...settings, year: 1612.5 } }],
    ["年が0", { settings: { ...settings, year: 0 } }],
    ["年が10000", { settings: { ...settings, year: 10000 } }],
    ["月が文字列", { settings: { ...settings, month: "1" } }],
    ["月が0", { settings: { ...settings, month: 0 } }],
    ["月が13", { settings: { ...settings, month: 13 } }],
    ["月が小数", { settings: { ...settings, month: 1.5 } }],
    ["月なし", { settings: { year: 1612 } }],
  ])("%sを保存せず400を返す", async (_label, body) => {
    const response = await PUT(request("PUT", body));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it("壊れたJSONは保存しない", async () => {
    const response = await PUT(new Request(endpoint, { method: "PUT", body: "{" }));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT"] as const)("%sのDB障害時も応答をキャッシュしない", async (method) => {
    mocks.user.findUnique.mockRejectedValue(new Error("database failed"));
    mocks.user.updateMany.mockRejectedValue(new Error("database failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await (method === "GET" ? GET : PUT)(request(method, { settings }));
      expect(response.status).toBe(500);
      expectPrivateNoStore(response);
    } finally {
      log.mockRestore();
    }
  });
});
