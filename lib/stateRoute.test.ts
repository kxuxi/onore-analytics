import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  warlord: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  battleRecord: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  unitType: {
    createMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/authGuard", () => ({ requireAdmin: () => null }));

import { POST } from "@/app/api/state/route";

function postRequest(term?: number): Request {
  const query = term == null ? "" : `?term=${term}`;
  return new Request(`http://localhost/api/state${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warlords: [], records: [] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.warlord.findMany.mockResolvedValue([]);
  prismaMock.battleRecord.findMany.mockResolvedValue([]);
  prismaMock.battleRecord.createMany.mockResolvedValue({ count: 0 });
  prismaMock.unitType.createMany.mockResolvedValue({ count: 0 });
  prismaMock.$transaction.mockImplementation(async (queries: unknown[]) =>
    Promise.all(queries)
  );
});

describe("POST /api/state", () => {
  it("term指定時は登録後の履歴をその期だけ取得する", async () => {
    const response = await POST(postRequest(147));

    expect(response.status).toBe(200);
    expect(prismaMock.battleRecord.findMany).toHaveBeenCalledWith({
      where: { term: 147 },
      orderBy: { id: "asc" },
    });
  });

  it("term未指定時は後方互換のため全期間の履歴を取得する", async () => {
    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(prismaMock.battleRecord.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { id: "asc" },
    });
  });

  it("登録前は入力に含まれる武将だけを読み、登録後は全件を返す", async () => {
    const warlord = {
      name: "織田信長",
      type: "武特",
      branch: "騎兵",
      term: 147,
      updatedAt: 1,
    };
    const existingRow = {
      ...warlord,
      household: null,
      faction: "織田家",
      unit: null,
      battleAt: null,
      lastActionAt: null,
      actions: [],
      updatedAt: 1n,
      power: 99,
      intelligence: null,
      leadership: null,
      politics: null,
      strategy: null,
      selfPr: null,
      statsRaw: null,
    };
    const unrelatedRow = {
      ...existingRow,
      name: "武田信玄",
      faction: "武田家",
    };
    prismaMock.warlord.findMany
      .mockResolvedValueOnce([existingRow])
      .mockResolvedValueOnce([existingRow, unrelatedRow]);
    prismaMock.warlord.upsert.mockResolvedValue(warlord);

    const request = new Request("http://localhost/api/state?term=147", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warlords: [warlord], records: [] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(prismaMock.warlord.findMany).toHaveBeenNthCalledWith(1, {
      where: { name: { in: ["織田信長"] } },
    });
    expect(prismaMock.warlord.findMany).toHaveBeenNthCalledWith(2);
    expect(prismaMock.warlord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ power: 99 }),
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      db: {
        織田信長: { power: 99 },
        武田信玄: { faction: "武田家" },
      },
      log: [],
    });
  });
});
