import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  updateMany: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/authGuard", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/city-map/reset/route";

const endpoint = "http://localhost/api/city-map/reset";

function request(accountId?: string, body: unknown = {}): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accountId === undefined ? {} : { "X-City-Map-Account-Id": accountId }),
    },
    body: JSON.stringify(body),
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

function expectNoDatabaseAccess() {
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.executeRaw).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSessionUser.mockReturnValue({ uid: 7, username: "alice" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.executeRaw.mockResolvedValue(3);
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: { updateMany: mocks.updateMany },
    $executeRaw: mocks.executeRaw,
  }));
});

describe("都市地図リセットの認証・アカウント分離", () => {
  it("未認証ではDBへ触れず401を返す", async () => {
    mocks.getSessionUser.mockReturnValue(null);
    const response = await POST(request("7"));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expectNoDatabaseAccess();
  });

  it("表示中アカウントのヘッダーがなければDBへ触れず400を返す", async () => {
    const response = await POST(request());
    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expectNoDatabaseAccess();
  });

  it.each(["8", "", "07", "7.0", "7,8"])("アカウントヘッダー%sが一致しなければDBへ触れず409を返す", async (accountId) => {
    const response = await POST(request(accountId));
    expect(response.status).toBe(409);
    expectPrivateNoStore(response);
    expectNoDatabaseAccess();
  });

  it("削除済みアカウントは偵察結果を消去せず401を返す", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(request("7"));
    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("本文のIDを無視してセッションの都市地図・年月・偵察だけを同一トランザクションで消す", async () => {
    const response = await POST(request("7", { userId: 8, uid: 8 }));
    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 7 },
      data: { cityMapSource: "", cityMapMerchantSettings: Prisma.DbNull },
    });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    const query = mocks.executeRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql.trim()).toBe('DELETE FROM "CityScoutReport" WHERE "userId" = ?');
    expect(query.values).toEqual([7]);
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.executeRaw.mock.invocationCallOrder[0]);
  });

  it("アカウントを切り替えた後の操作は切替後のセッションだけを対象にする", async () => {
    mocks.getSessionUser.mockReturnValue({ uid: 8, username: "bob" });
    const response = await POST(request("8"));
    expect(response.status).toBe(200);
    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ id: 8 });
    expect((mocks.executeRaw.mock.calls[0][0] as Prisma.Sql).values).toEqual([8]);
  });
});

describe("都市地図リセットの一括処理", () => {
  it("既に空のアカウントも正常にリセットできる", async () => {
    mocks.executeRaw.mockResolvedValue(0);
    const response = await POST(request("7"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("ユーザー更新の失敗後は偵察削除を実行せず500を返す", async () => {
    mocks.updateMany.mockRejectedValue(new Error("update failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request("7"));
      expect(response.status).toBe(500);
      expectPrivateNoStore(response);
      expect(mocks.executeRaw).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("偵察削除の失敗をトランザクション外へ伝えて先行のユーザー更新もロールバックさせる", async () => {
    const failure = new Error("delete failed");
    mocks.executeRaw.mockRejectedValue(failure);
    let transactionFailure: unknown;
    mocks.transaction.mockImplementation(async (callback) => {
      try {
        return await callback({ user: { updateMany: mocks.updateMany }, $executeRaw: mocks.executeRaw });
      } catch (error) {
        transactionFailure = error;
        throw error;
      }
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request("7"));
      expect(response.status).toBe(500);
      expectPrivateNoStore(response);
      expect(transactionFailure).toBe(failure);
      expect(mocks.updateMany).toHaveBeenCalledTimes(1);
      expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
