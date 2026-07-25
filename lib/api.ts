import type {
  AuthUser,
  BattleRecord,
  UnitType,
  Warlord,
  WarlordMap,
} from "./types";
import type { FactionColorMap } from "./factionColors";
import {
  readJsonResponse,
  responseErrorMessage,
  throwIfResponseFailed,
} from "./httpClient";

export type StateResponse = {
  db: WarlordMap;
  log: BattleRecord[];
};

export type RegisterResponse = StateResponse & {
  added: number;
  updated: number;
  logAdded: number;
  skipped: number;
};

/** 武将DB + 戦闘履歴を取得。term を数値で渡すとその期の log のみ、
 *  省略または "all" で全期間の log を返す（db は常に全件）。 */
export async function fetchState(term?: number | "all"): Promise<StateResponse> {
  const q = typeof term === "number" ? `?term=${term}` : "";
  const res = await fetch(`/api/state${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error("状態の取得に失敗しました");
  return res.json();
}

/** 戦闘履歴に存在する期番号の一覧（新しい順）。期セレクタ用の軽量エンドポイント。 */
export async function fetchTerms(): Promise<number[]> {
  const res = await fetch("/api/terms", { cache: "no-store" });
  if (!res.ok) throw new Error("期一覧の取得に失敗しました");
  return res.json();
}

/** 武将DB + 戦闘履歴をすべて削除（期の切り替え時に使用） */
export async function deleteAllState(): Promise<void> {
  const res = await fetch("/api/state", { method: "DELETE" });
  if (!res.ok) throw new Error("データの削除に失敗しました");
}

export type ImportStatsResponse = {
  db: WarlordMap;
  updated: number;
  created: number;
};

/** ランキングから解析した能力値を共有DBへ取り込む */
export async function importWarlordStats(
  stats: Array<{
    name: string;
    power?: number;
    intelligence?: number;
    leadership?: number;
    politics?: number;
    strategy?: number;
    selfPr?: string;
    faction?: string;
    raw?: string;
  }>
): Promise<ImportStatsResponse> {
  const res = await fetch("/api/warlord-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stats }),
  });
  await throwIfResponseFailed(res, "能力値の取り込みに失敗しました");
  return res.json();
}

/**
 * 解析済みの武将・戦闘履歴を登録する。
 * responseTerm を数値で渡すと、レスポンスの log はその期だけになる。
 * 省略または "all" は従来どおり全期間を返す。
 */
export async function registerState(
  warlords: Warlord[],
  records: BattleRecord[],
  responseTerm?: number | "all"
): Promise<RegisterResponse> {
  const q = typeof responseTerm === "number" ? `?term=${responseTerm}` : "";
  const res = await fetch(`/api/state${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warlords, records }),
  });
  if (!res.ok) throw new Error("登録に失敗しました");
  return res.json();
}

/** 戦闘履歴を削除（管理者のみ）。 */
export async function deleteBattleRecord(id: number): Promise<void> {
  const res = await fetch(`/api/battle-records/${id}`, {
    method: "DELETE",
  });
  await throwIfResponseFailed(res, "削除に失敗しました");
}

/**
 * 戦闘記録を ID の配列でまとめて削除する（管理者のみ）。
 * 「戦闘履歴」タブの表示中（絞り込み結果）を一括削除する用途。
 * @returns 削除できた件数
 */
export async function bulkDeleteBattleRecords(ids: number[]): Promise<number> {
  const res = await fetch("/api/battle-records/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const data = await readJsonResponse<{ error?: unknown; deleted?: number }>(
    res
  );
  if (!res.ok) {
    throw new Error(responseErrorMessage(data, "一括削除に失敗しました"));
  }
  return data?.deleted ?? 0;
}

/**
 * 指定した国を削除する（管理者のみ）。
 * その国が関わる戦闘記録と、その国に所属する武将（DB 名簿）をまとめて削除する。
 * @returns 削除した戦闘記録数（records）と武将数（warlords）
 */
export async function deleteFaction(
  faction: string
): Promise<{ records: number; warlords: number }> {
  const res = await fetch(
    `/api/battle-records/by-faction/${encodeURIComponent(faction)}`,
    { method: "DELETE" }
  );
  const data = await readJsonResponse<{
    error?: unknown;
    deleted?: number;
    deletedWarlords?: number;
  }>(res);
  if (!res.ok) {
    throw new Error(responseErrorMessage(data, "削除に失敗しました"));
  }
  return {
    records: data?.deleted ?? 0,
    warlords: data?.deletedWarlords ?? 0,
  };
}

/**
 * 項目ずれ（トークンずれ）を起こした戦闘記録と武将をまとめて削除する（管理者のみ）。
 * オリジナル兵名・装備名のスペースで項目がずれ、type に兵種名・branch に装備名が
 * 入り込んだデータが対象。
 * @returns 削除した戦闘記録数（records）と武将数（warlords）
 */
export async function cleanupSkewedData(): Promise<{
  records: number;
  warlords: number;
}> {
  const res = await fetch("/api/battle-records/cleanup-skewed", {
    method: "DELETE",
  });
  const data = await readJsonResponse<{
    error?: unknown;
    deleted?: number;
    deletedWarlords?: number;
  }>(res);
  if (!res.ok) {
    throw new Error(responseErrorMessage(data, "データの整理に失敗しました"));
  }
  return {
    records: data?.deleted ?? 0,
    warlords: data?.deletedWarlords ?? 0,
  };
}

/** 兵種一覧のメモリキャッシュ。画面ごとの重複取得を避ける。
 *  追加 / 更新 / 削除のたびに失効させ、次回取得で最新を取り直す。 */
let unitTypesCache: UnitType[] | null = null;
let unitTypesInflight: Promise<UnitType[]> | null = null;

/** 兵種一覧のキャッシュを破棄する（更新系の後に呼ぶ）。 */
export function invalidateUnitTypesCache(): void {
  unitTypesCache = null;
  unitTypesInflight = null;
}

/** 兵種一覧を取得（キャッシュ優先）。force=true で必ず再取得する。 */
export async function fetchUnitTypes(force = false): Promise<UnitType[]> {
  if (!force && unitTypesCache) return unitTypesCache;
  // 同時に複数の画面から呼ばれても 1 リクエストに集約する。
  if (!force && unitTypesInflight) return unitTypesInflight;
  const inflight = (async () => {
    const res = await fetch("/api/unit-types", { cache: "no-store" });
    if (!res.ok) throw new Error("兵種の取得に失敗しました");
    const data = (await res.json()) as UnitType[];
    unitTypesCache = data;
    return data;
  })();
  unitTypesInflight = inflight;
  try {
    return await inflight;
  } finally {
    if (unitTypesInflight === inflight) unitTypesInflight = null;
  }
}

/** 兵種を追加 / 更新（名前が被ったら上書き） */
export async function upsertUnitType(unit: UnitType): Promise<UnitType> {
  const res = await fetch("/api/unit-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(unit),
  });
  await throwIfResponseFailed(res, "兵種の保存に失敗しました");
  invalidateUnitTypesCache();
  return res.json();
}

/** 兵種を削除 */
export async function deleteUnitType(name: string): Promise<void> {
  const res = await fetch(`/api/unit-types/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("兵種の削除に失敗しました");
  invalidateUnitTypesCache();
}

/** 兵種を一括で追加 / 更新（貼り付け取り込み用）。
 *  名前が一致する兵種は上書き、無ければ追加する（一覧に無い既存は削除しない）。 */
export async function bulkUpsertUnitTypes(
  units: UnitType[]
): Promise<{ ok: boolean; count: number }> {
  const res = await fetch("/api/unit-types", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ units }),
  });
  await throwIfResponseFailed(res, "兵種の一括取り込みに失敗しました");
  invalidateUnitTypesCache();
  return res.json();
}

/** 国の色設定をDBから取得する（認証不要）。取得失敗時は空マップを返す。 */
export async function fetchFactionColors(): Promise<FactionColorMap> {
  try {
    const res = await fetch("/api/faction-colors", { cache: "no-store" });
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

/** 国の色設定をDBへ保存する（管理者のみ）。 */
export async function saveFactionColorsToDb(
  colors: FactionColorMap
): Promise<void> {
  const res = await fetch("/api/faction-colors", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(colors),
  });
  await throwIfResponseFailed(res, "国の色の保存に失敗しました");
}

/** 現在のログイン状態を取得する（未ログインなら null）。 */
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: AuthUser | null };
  return data.user ?? null;
}

/** ログインする。成功でユーザー情報を返し、失敗は例外を投げる。 */
export async function login(
  username: string,
  password: string
): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  await throwIfResponseFailed(res, "ログインに失敗しました");
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

/** ログアウトする（セッション Cookie を失効）。 */
export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
