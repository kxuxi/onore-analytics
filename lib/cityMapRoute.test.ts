import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/authGuard", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: mocks.user } }));

import { GET, PUT } from "@/app/api/city-map/route";
import { MAX_CITY_MAP_SOURCE_LENGTH } from "@/lib/cityMap";

const source = "| | a | b |\n| - | - | - |\n| 1 | ポルト<br>★行商 | マドリード<br> |";

function getRequest(accountId?: string): Request {
  return new Request("http://localhost/api/city-map", {
    headers: accountId === undefined ? {} : { "X-City-Map-Account-Id": accountId },
  });
}

function putRequest(body: unknown, query = ""): Request {
  return new Request(`http://localhost/api/city-map${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSessionUser.mockReturnValue({ uid: 7, username: "alice", exp: Date.now() + 60_000 });
  mocks.user.findUnique.mockResolvedValue({ cityMapSource: source });
  mocks.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("都市地図の認証・アカウント分離", () => {
  it.each(["GET", "PUT"])("%sは古いタブのアカウント指定をDBへ触れず拒否する", async (method) => {
    const request = method === "GET" ? getRequest("8") : putRequest({ source });
    request.headers.set("X-City-Map-Account-Id", "8");

    const response = await (method === "GET" ? GET(request) : PUT(request));

    expect(response.status).toBe(409);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({
      error: "ログイン中のアカウントが変わりました。ページを再読み込みしてください。",
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it.each(["", "07", "7.0", "7,8"])("アカウントヘッダー%sはセッションIDの文字列と一致しない", async (accountId) => {
    const response = await GET(getRequest(accountId));
    expect(response.status).toBe(409);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("セッションIDと一致するヘッダーなら本人の地図を保存する", async () => {
    const request = putRequest({ source, userId: 8 });
    request.headers.set("X-City-Map-Account-Id", "7");

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { cityMapSource: source },
    });
  });

  it.each([
    ["GET", () => GET(getRequest())],
    ["PUT", () => PUT(putRequest({ source }))],
  ])("未認証の%sはDBへ触れず401を返す", async (_method, invoke) => {
    mocks.getSessionUser.mockReturnValue(null);

    const response = await invoke();

    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it("アカウントを切り替えても互いの地図を読み書きしない", async () => {
    const original = source.replace("ポルト", "リスボン");
    const maps = new Map([[7, source], [8, original]]);
    mocks.user.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => {
      const saved = maps.get(where.id);
      return saved === undefined ? null : { cityMapSource: saved };
    });
    mocks.user.updateMany.mockImplementation(async ({ where, data }: {
      where: { id: number };
      data: { cityMapSource: string };
    }) => {
      if (!maps.has(where.id)) return { count: 0 };
      maps.set(where.id, data.cityMapSource);
      return { count: 1 };
    });

    // クライアントから別アカウントのIDを送っても、セッションの7だけを更新する。
    const updated = source.replace("ポルト", "セビリア");
    const saved = await PUT(putRequest({ source: updated, userId: 8, uid: 8 }, "?userId=8"));
    expect(saved.status).toBe(200);
    expectPrivateNoStore(saved);
    await expect(saved.json()).resolves.toEqual({ source: updated });
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { cityMapSource: updated },
    });
    await expect((await GET(getRequest("7"))).json()).resolves.toEqual({ source: updated });

    mocks.getSessionUser.mockReturnValue({ uid: 8, username: "bob", exp: Date.now() + 60_000 });
    await expect((await GET(getRequest("8"))).json()).resolves.toEqual({ source: original });
    expect(maps.get(8)).toBe(original);
    expect(mocks.user.findUnique).toHaveBeenLastCalledWith({
      where: { id: 8 },
      select: { cityMapSource: true },
    });
  });

  it("削除済みアカウントのセッションで地図を取得できない", async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
  });

  it("削除済みアカウントのセッションで地図を保存できない", async () => {
    mocks.user.updateMany.mockResolvedValue({ count: 0 });
    const response = await PUT(putRequest({ source }));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
  });
});

describe("GET /api/city-map", () => {
  it("保存した元テキストのみをキャッシュせず返す", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({ source });
    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { cityMapSource: true },
    });
  });

  it("未設定アカウントは空文字を返す", async () => {
    mocks.user.findUnique.mockResolvedValue({ cityMapSource: "" });
    await expect((await GET(getRequest())).json()).resolves.toEqual({ source: "" });
  });

  it("DB障害時の応答もキャッシュしない", async () => {
    mocks.user.findUnique.mockRejectedValue(new Error("database failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET(getRequest());
      expect(response.status).toBe(500);
      expectPrivateNoStore(response);
    } finally {
      log.mockRestore();
    }
  });
});

describe("PUT /api/city-map", () => {
  it("報告されたコピー文字列を空白マスの位置を変えず本人の地図として保存する", async () => {
    const pasted = readFileSync(new URL("./fixtures/city-map-copied.txt", import.meta.url), "utf8");
    const response = await PUT(putRequest({ source: pasted }));

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { cityMapSource: pasted },
    });
    await expect(response.json()).resolves.toEqual({ source: pasted });
  });

  it("改行や空白を含む元テキストをそのまま保存する", async () => {
    const pasted = `  ${source.replaceAll("\n", "\r\n")}\r\n`;
    const response = await PUT(putRequest({ source: pasted }));
    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { cityMapSource: pasted },
    });
    await expect(response.json()).resolves.toEqual({ source: pasted });
  });

  it("空文字で自分の地図を消去できる", async () => {
    const response = await PUT(putRequest({ source: "" }));
    expect(response.status).toBe(200);
    expect(mocks.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { cityMapSource: "" },
    });
    await expect(response.json()).resolves.toEqual({ source: "" });
  });

  it.each([
    ["null", null],
    ["配列", []],
    ["文字列", "source"],
    ["sourceなし", {}],
    ["sourceがnull", { source: null }],
    ["sourceが数値", { source: 12 }],
    ["表以外のテキスト", { source: "地図でないテキスト" }],
    ["文字数超過", { source: "a".repeat(MAX_CITY_MAP_SOURCE_LENGTH + 1) }],
    ["11行の地図", {
      source: "| | a |\n| - | - |\n" + Array.from({ length: 11 }, (_, i) => `| ${i + 1} | ポルト |`).join("\n"),
    }],
  ])("%sは保存せず400を返す", async (_label, body) => {
    const response = await PUT(putRequest(body));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });

  it("壊れたJSONは保存せず400を返す", async () => {
    const response = await PUT(new Request("http://localhost/api/city-map", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }));
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.user.updateMany).not.toHaveBeenCalled();
  });
});
