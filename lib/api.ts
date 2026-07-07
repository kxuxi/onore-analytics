import type {
  AuthUser,
  BattleRecord,
  UnitType,
  Warlord,
  WarlordMap,
} from "./types";
import type { FactionColorMap } from "./factionColors";

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

/** 武将DB + 戦闘履歴を取得 */
export async function fetchState(): Promise<StateResponse> {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) throw new Error("状態の取得に失敗しました");
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "能力値の取り込みに失敗しました");
  }
  return res.json();
}

/** 解析済みの武将・戦闘履歴を登録 */
export async function registerState(
  warlords: Warlord[],
  records: BattleRecord[]
): Promise<RegisterResponse> {
  const res = await fetch("/api/state", {
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "削除に失敗しました");
  }
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "兵種の保存に失敗しました");
  }
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "兵種の一括取り込みに失敗しました");
  }
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "国の色の保存に失敗しました");
  }
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "ログインに失敗しました");
  }
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

/** ログアウトする（セッション Cookie を失効）。 */
export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
