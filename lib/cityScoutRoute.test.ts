import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  user: { findUnique: vi.fn() },
  readRows: vi.fn(),
  writeRows: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/authGuard", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: mocks.user,
  $queryRaw: mocks.queryRaw,
  $transaction: mocks.transaction,
} }));

import { GET, POST } from "@/app/api/city-map/scouts/route";
import { MAX_CITY_SCOUT_SOURCE_LENGTH, normalizeCityScoutName, parseCityScoutReports } from "./cityScout";

const source = `1634年 9月
ブルゴス [己鯖夕食突撃部] : 大都市
人口 : 618700人 治安 : 99
農業 : 1800 / 1800
商業 : 2200 / 2200
技術 : 1000 / 1000
城壁 : 1184 / 1200
守備兵数 : 14000 / 14000
相場 : 0.78
施設 : ギルド(大都市) 南蛮町 武家町 牧場 鉄工所 総構え 門前町
都市資金 : 63928 都市兵糧 : 300230
守備 : ヤドラン (1人)
警備 :
海上守備 : (人)`;
const endpoint = "http://localhost/api/city-map/scouts";

function request(method: "GET" | "POST", body?: unknown, accountId?: string): Request {
  return new Request(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accountId === undefined ? {} : { "X-City-Map-Account-Id": accountId }),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSessionUser.mockReturnValue({ uid: 7, username: "alice" });
  mocks.user.findUnique.mockResolvedValue({ id: 7, cityScoutReports: [{ source }] });
  mocks.readRows.mockResolvedValue([{ source }]);
  mocks.writeRows.mockResolvedValue([{ cityName: normalizeCityScoutName("ブルゴス") }]);
  mocks.queryRaw.mockImplementation((query: Prisma.Sql) => /^\s*SELECT\b/.test(query.sql)
    ? mocks.readRows(query) : mocks.writeRows(query));
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: mocks.user, $queryRaw: mocks.queryRaw,
  }));
});

describe("都市偵察結果の認証・アカウント分離", () => {
  it.each(["GET", "POST"] as const)("未認証の%sはDBへ触れず401", async (method) => {
    mocks.getSessionUser.mockReturnValue(null);
    const response = await (method === "GET" ? GET : POST)(request(method, { source }));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"] as const)("アカウント切替前の%sはDBへ触れず409", async (method) => {
    const response = await (method === "GET" ? GET : POST)(request(method, { source }, "8"));
    expect(response.status).toBe(409);
    expectPrivateNoStore(response);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["", "07", "7.0", "7,8"])("アカウントヘッダー%sは厳密に比較する", async (accountId) => {
    expect((await GET(request("GET", undefined, accountId))).status).toBe(409);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"] as const)("削除済みアカウントの%sは401", async (method) => {
    mocks.user.findUnique.mockResolvedValue(null);
    const response = await (method === "GET" ? GET : POST)(request(method, { source }));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("本文のアカウントIDを無視してセッションのアカウントだけに保存する", async () => {
    const response = await POST(request("POST", { source, userId: 8, uid: 8 }, "7"));
    expect(response.status).toBe(200);
    expect(mocks.user.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { id: true } });
    const query = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.values[0]).toBe(7);
    expect((mocks.readRows.mock.calls[0][0] as Prisma.Sql).values).toEqual([7]);
  });
});

describe("都市偵察結果の読み書き", () => {
  it("保存済み原文を解析してセッションの都市情報だけ返す", async () => {
    const response = await GET(request("GET", undefined, "7"));
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({ reports: parseCityScoutReports(source) });
    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true },
    });
    expect((mocks.readRows.mock.calls[0][0] as Prisma.Sql).values).toEqual([7]);
    mocks.getSessionUser.mockReturnValue({ uid: 8, username: "bob" });
    mocks.user.findUnique.mockResolvedValue({ id: 8, cityScoutReports: [] });
    mocks.readRows.mockResolvedValue([]);
    await expect((await GET(request("GET", undefined, "8"))).json()).resolves.toEqual({ reports: [] });
    expect((mocks.readRows.mock.calls[1][0] as Prisma.Sql).values).toEqual([8]);
  });

  it("保存済みの年月との比較を同一SQL文で行い都市名と原文はパラメーター化する", async () => {
    const response = await POST(request("POST", { source }));
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({
      reports: parseCityScoutReports(source), savedCityNames: ["ブルゴス"], skippedCityNames: [],
    });
    const query = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('ON CONFLICT ("userId", "cityName") DO UPDATE');
    expect(query.sql).toContain('WHERE ("CityScoutReport"."year", "CityScoutReport"."month") <= (EXCLUDED."year", EXCLUDED."month")');
    expect(query.values).toEqual([7, normalizeCityScoutName("ブルゴス"), 1634, 9, parseCityScoutReports(source)[0].source]);
    expect(query.sql).not.toContain("ブルゴス");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("古い年月の偵察結果は保存しなかった都市として返す", async () => {
    const latestSource = source.replace("9月", "10月");
    mocks.writeRows.mockResolvedValue([]);
    mocks.readRows.mockResolvedValue([{ source: latestSource }]);
    const response = await POST(request("POST", { source }));
    await expect(response.json()).resolves.toEqual({
      reports: parseCityScoutReports(latestSource), savedCityNames: [], skippedCityNames: ["ブルゴス"],
    });
  });

  it("複数都市をまとめて保存し既存の他都市も返す", async () => {
    const other = source.replace("ブルゴス", "マラガ");
    const untouched = source.replace("ブルゴス", "ファロ");
    mocks.writeRows.mockResolvedValue([{ cityName: "ブルゴス" }, { cityName: "マラガ" }]);
    mocks.readRows.mockResolvedValue([{ source }, { source: other }, { source: untouched }]);
    const response = await POST(request("POST", { source: `${source}\n\n${other}` }));
    const body = await response.json();
    expect(body.reports).toHaveLength(3);
    expect(body.savedCityNames.sort()).toEqual(["ブルゴス", "マラガ"]);
    expect(mocks.writeRows).toHaveBeenCalledTimes(1);
    expect((mocks.queryRaw.mock.calls[0][0] as Prisma.Sql).values).toHaveLength(10);
  });

  it("同じ都市を複数貼ったときは最新年月、同年月なら後の原文を採用する", async () => {
    const older = source.replace("1634年", "1633年");
    const updated = source.replace("618700人", "620000人");
    await POST(request("POST", { source: [source, updated, older].join("\n\n") }));
    const query = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.values).toHaveLength(5);
    expect(query.values[2]).toBe(1634);
    expect(query.values[4]).toContain("620000人");
  });

  it.each([
    ["null本文", null], ["配列本文", []], ["文字列本文", source], ["原文なし", {}],
    ["数値原文", { source: 123 }], ["空原文", { source: "" }],
    ["認識できない本文", { source: "ブルゴスの偵察結果" }],
    ["長すぎる原文", { source: "x".repeat(MAX_CITY_SCOUT_SOURCE_LENGTH + 1) }],
    ["一部が不正な複数都市", { source: `${source}\n\n1634年 13月\nマラガ [国] : 大都市\n人口 : 123人` }],
  ])("%sは全体を保存せず400", async (_label, body) => {
    const response = await POST(request("POST", body));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("壊れたJSONは保存しない", async () => {
    const response = await POST(new Request(endpoint, { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"] as const)("%sのDB障害もキャッシュしない", async (method) => {
    mocks.user.findUnique.mockRejectedValue(new Error("database failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await (method === "GET" ? GET : POST)(request(method, { source }));
      expect(response.status).toBe(500);
      expectPrivateNoStore(response);
    } finally {
      log.mockRestore();
    }
  });
});
