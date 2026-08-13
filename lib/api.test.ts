import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnitType } from "./types";
import {
  bulkUpsertUnitTypes,
  deleteUnitType,
  fetchUnitTypes,
  importWarlordStats,
  invalidateUnitTypesCache,
  registerState,
  upsertUnitType,
} from "./api";

const fetchMock = vi.fn<typeof fetch>();

const originalUnit: UnitType = {
  name: "剛弓僧兵",
  category: "弓兵",
  goodAgainst: "騎兵",
  attack: 120,
  defense: 80,
  cost: "金:120",
  tech: "弓術",
  years: "3",
  reqStats: "統率:60",
  facility: "弓兵舎",
  special: "",
  bonus: "遠距離攻撃",
};

const updatedUnit: UnitType = {
  ...originalUnit,
  attack: 125,
  defense: 85,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  invalidateUnitTypesCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  invalidateUnitTypesCache();
  vi.unstubAllGlobals();
});

describe("importWarlordStats", () => {
  it("能力値をJSONで送信し、APIレスポンスをそのまま返す", async () => {
    const stats = [
      {
        name: "因幡月夜",
        power: 91,
        intelligence: 84,
        leadership: 88,
        politics: 72,
        strategy: 102.5,
        selfPr: "前線を支えます",
        maxTroops: 50000,
        faction: "天下五剣",
        raw: "取り込み元の行",
      },
    ];
    const apiResponse = {
      db: {},
      updated: 1,
      created: 0,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(apiResponse));

    await expect(importWarlordStats(stats)).resolves.toEqual(apiResponse);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/warlord-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stats }),
    });
  });

  it("APIが返したエラーメッセージを保持して例外を投げる", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "管理者権限が必要です" }, 401)
    );

    await expect(importWarlordStats([])).rejects.toThrow(
      "管理者権限が必要です"
    );
  });
});

describe("registerState", () => {
  const apiResponse = {
    db: {},
    log: [],
    added: 1,
    updated: 0,
    logAdded: 1,
    skipped: 0,
  };

  it("登録期を指定すると、その期だけを返すクエリを付ける", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(apiResponse));

    await expect(registerState([], [], 147)).resolves.toEqual(apiResponse);
    expect(fetchMock).toHaveBeenCalledWith("/api/state?term=147", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warlords: [], records: [] }),
    });
  });

  it.each([undefined, "all" as const])(
    "期を %s にすると従来どおりクエリを付けない",
    async (term) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(apiResponse));

      await expect(registerState([], [], term)).resolves.toEqual(apiResponse);
      expect(fetchMock).toHaveBeenCalledWith("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warlords: [], records: [] }),
      });
    }
  );
});

describe("upsertUnitType", () => {
  it("兵種をJSONで保存して返し、成功後に一覧キャッシュを失効する", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([originalUnit]))
      .mockResolvedValueOnce(jsonResponse(updatedUnit))
      .mockResolvedValueOnce(jsonResponse([updatedUnit]));

    await expect(fetchUnitTypes()).resolves.toEqual([originalUnit]);
    await expect(upsertUnitType(updatedUnit)).resolves.toEqual(updatedUnit);
    await expect(fetchUnitTypes()).resolves.toEqual([updatedUnit]);

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/unit-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedUnit),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/unit-types", {
      cache: "no-store",
    });
  });

  it("保存に失敗した場合はAPIのエラーを返し、一覧キャッシュを維持する", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([originalUnit]))
      .mockResolvedValueOnce(
        jsonResponse({ error: "兵種名は必須です" }, 422)
      );

    await fetchUnitTypes();
    await expect(upsertUnitType(updatedUnit)).rejects.toThrow(
      "兵種名は必須です"
    );
    await expect(fetchUnitTypes()).resolves.toEqual([originalUnit]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("bulkUpsertUnitTypes", () => {
  it("兵種一覧をJSONで一括保存して返し、成功後に一覧キャッシュを失効する", async () => {
    const units = [originalUnit, updatedUnit];
    const apiResponse = { ok: true, count: units.length };
    fetchMock
      .mockResolvedValueOnce(jsonResponse([originalUnit]))
      .mockResolvedValueOnce(jsonResponse(apiResponse))
      .mockResolvedValueOnce(jsonResponse(units));

    await expect(fetchUnitTypes()).resolves.toEqual([originalUnit]);
    await expect(bulkUpsertUnitTypes(units)).resolves.toEqual(apiResponse);
    await expect(fetchUnitTypes()).resolves.toEqual(units);

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/unit-types", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/unit-types", {
      cache: "no-store",
    });
  });

  it("一括保存に失敗した場合はAPIのエラーを返し、一覧キャッシュを維持する", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([originalUnit]))
      .mockResolvedValueOnce(
        jsonResponse({ error: "兵種データが不正です" }, 400)
      );

    await fetchUnitTypes();
    await expect(bulkUpsertUnitTypes([updatedUnit])).rejects.toThrow(
      "兵種データが不正です"
    );
    await expect(fetchUnitTypes()).resolves.toEqual([originalUnit]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("deleteUnitType", () => {
  it("URLエンコードした兵種名を削除し、成功後に一覧キャッシュを失効する", async () => {
    const unitName = "弓兵 / 特殊";
    fetchMock
      .mockResolvedValueOnce(jsonResponse([originalUnit]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse([]));

    await expect(fetchUnitTypes()).resolves.toEqual([originalUnit]);
    await expect(deleteUnitType(unitName)).resolves.toBeUndefined();
    await expect(fetchUnitTypes()).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/unit-types/${encodeURIComponent(unitName)}`,
      { method: "DELETE" }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/unit-types", {
      cache: "no-store",
    });
  });

  it("削除に失敗した場合は既定のエラーを返し、一覧キャッシュを維持する", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([originalUnit]))
      .mockResolvedValueOnce(
        jsonResponse({ error: "サーバー内部エラー" }, 500)
      );

    await fetchUnitTypes();
    await expect(deleteUnitType(originalUnit.name)).rejects.toThrow(
      "兵種の削除に失敗しました"
    );
    await expect(fetchUnitTypes()).resolves.toEqual([originalUnit]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
