import type { TabKey } from "./types";

/**
 * サイドバーのタブ構成（純粋なデータのみ。アイコン等の JSX は持たない）。
 * アイコンは描画側（app/page.tsx）でキーから引く。ここはテスト可能な純粋ロジックに保つ。
 */

/** サイドバーのグループキー（似た画面をまとめた単位）。 */
export type TabGroupKey =
  | "home"
  | "history"
  | "warlords"
  | "ranking"
  | "meta"
  | "encyclopedia"
  | "nations"
  | "settings";

/** タブ（リーフ）ごとの短いラベル。ページ内サブタブの見出し・タイトルに使う。 */
export const TAB_LABELS: Record<TabKey, string> = {
  home: "ホーム",
  history: "戦闘履歴",
  scout: "偵察検索",
  damage: "被弾表",
  swi: "武将ランキング",
  unitrank: "兵種ランキング",
  weaponrank: "武器ランキング",
  itemrank: "品物ランキング",
  synergy: "装備シナジー",
  matrix: "相性表",
  metaenv: "環境",
  db: "DB確認",
  units: "兵種",
  weapons: "武器",
  items: "品物",
  nations: "国",
  factions: "環境設定",
};

/** サイドバーのグループ定義（ラベルと、束ねるリーフタブの一覧）。 */
export interface TabGroup {
  key: TabGroupKey;
  label: string;
  tabs: TabKey[];
}

/**
 * サイドバーのグループ定義。似た画面を1グループにまとめ、複数リーフを持つ
 * グループはページ内のサブタブ（セグメント）で切り替える。
 */
export const TAB_GROUPS: TabGroup[] = [
  { key: "home", label: "ホーム", tabs: ["home"] },
  { key: "history", label: "戦闘履歴", tabs: ["history"] },
  { key: "warlords", label: "武将", tabs: ["scout", "damage", "db"] },
  { key: "ranking", label: "ランキング", tabs: ["swi", "unitrank", "weaponrank", "itemrank"] },
  { key: "meta", label: "メタ分析", tabs: ["matrix", "metaenv", "synergy"] },
  { key: "encyclopedia", label: "図鑑", tabs: ["units", "weapons", "items"] },
  { key: "nations", label: "国", tabs: ["nations"] },
  { key: "settings", label: "環境設定", tabs: ["factions"] },
];

/** リーフタブ → 所属グループ の逆引き。 */
export const GROUP_OF_TAB: Record<TabKey, TabGroupKey> = TAB_GROUPS.reduce(
  (acc, g) => {
    for (const t of g.tabs) acc[t] = g.key;
    return acc;
  },
  {} as Record<TabKey, TabGroupKey>
);

/** すべての有効なリーフタブキー（URL のタブ検証に使う）。 */
export const ALL_TAB_KEYS: TabKey[] = TAB_GROUPS.flatMap((g) => g.tabs);

/**
 * 未ログイン（管理者以外）でも閲覧できるグループ。
 * 戦闘履歴・ランキング・メタ分析・図鑑・国を公開し、残りは管理者専用にする。
 */
export const PUBLIC_TAB_GROUPS: TabGroupKey[] = [
  "home",
  "history",
  "ranking",
  "meta",
  "encyclopedia",
  "nations",
];

/** 公開グループに属する全リーフタブ（URL の公開判定に使う）。 */
export const PUBLIC_TAB_KEYS: TabKey[] = TAB_GROUPS.filter((g) =>
  PUBLIC_TAB_GROUPS.includes(g.key)
).flatMap((g) => g.tabs);

/** 指定グループが未ログインでも閲覧できるか。 */
export function isPublicGroup(key: TabGroupKey): boolean {
  return PUBLIC_TAB_GROUPS.includes(key);
}

/** 指定タブ（リーフ）が未ログインでも閲覧できるか。 */
export function isPublicTab(key: TabKey): boolean {
  return PUBLIC_TAB_KEYS.includes(key);
}
