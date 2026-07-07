import type { TabKey } from "./types";
import { ALL_TAB_KEYS } from "./tabs";

/**
 * タブ・詳細ページの状態と URL（入れ子スラッグ）の相互変換。
 * すべて純粋関数で、共有リンク・ブラウザ履歴（push/replaceState）で共用する。
 */

/** 詳細ページの種類。 */
export type DetailKind = "warlord" | "unit" | "weapon" | "item" | "faction";

/** 武将 / 兵種 / 武器 / 品物 / 国 ページの表示状態。 */
export interface DetailView {
  kind: DetailKind;
  name: string;
}

/** タブと詳細スタックの組（URL ⇔ アプリ状態の橋渡し）。 */
export interface NavState {
  tab: TabKey;
  detailStack: DetailView[];
}

/**
 * 詳細ページの種類ごとの URL スラッグ（パスの一区切り）。
 * タブのスラッグ（複数形・英単語）と衝突しないよう、詳細は単数形にする。
 */
export const DETAIL_SEG: Record<DetailKind, string> = {
  warlord: "warlord",
  unit: "unit",
  weapon: "weapon",
  item: "item",
  faction: "nation",
};

/** URL スラッグ（パス区切り）→ 詳細種類 の逆引き。 */
export const SEG_TO_DETAIL: Record<string, DetailKind> = Object.entries(
  DETAIL_SEG
).reduce(
  (acc, [kind, seg]) => {
    acc[seg] = kind as DetailKind;
    return acc;
  },
  {} as Record<string, DetailKind>
);

/**
 * 各リーフタブの URL パス区切り（グループ階層を反映した入れ子）。
 * ホームは既定なのでルート（空）に割り当てる。
 */
export const TAB_PATH: Record<TabKey, string[]> = {
  home: [],
  history: ["history"],
  scout: ["warlords", "scout"],
  damage: ["warlords", "damage"],
  db: ["warlords", "db"],
  swi: ["ranking"],
  unitrank: ["ranking", "units"],
  weaponrank: ["ranking", "weapons"],
  itemrank: ["ranking", "items"],
  synergy: ["meta", "synergy"],
  matrix: ["meta"],
  metaenv: ["meta", "env"],
  units: ["encyclopedia", "units"],
  weapons: ["encyclopedia", "weapons"],
  items: ["encyclopedia", "items"],
  nations: ["nations"],
  factions: ["settings"],
};

/** タブのパス（"warlords/damage" 等）→ TabKey の逆引き。 */
export const PATH_TO_TAB: Record<string, TabKey> = Object.entries(
  TAB_PATH
).reduce(
  (acc, [tab, segs]) => {
    acc[segs.join("/")] = tab as TabKey;
    return acc;
  },
  {} as Record<string, TabKey>
);

/** 旧クエリ（?w=... 等）のパラメータ名 → 詳細種類（共有リンクの後方互換用）。 */
export const LEGACY_TAB_PARAM: Record<DetailKind, string> = {
  warlord: "w",
  unit: "u",
  weapon: "wp",
  item: "it",
  faction: "f",
};

/** タブ・詳細ページの状態を入れ子スラッグのパスへ変換する（共有・履歴で共用）。 */
export function buildPath(tab: TabKey, detail: DetailView | null): string {
  const segs = [...TAB_PATH[tab]];
  if (detail) {
    segs.push(DETAIL_SEG[detail.kind], encodeURIComponent(detail.name));
  }
  return "/" + segs.join("/");
}

/** 旧クエリ（?tab=...&w=... 等）からタブ・詳細スタックを復元する（後方互換）。 */
export function navStateFromSearch(search: string): NavState {
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  // 旧「武器・品物」タブ（equips）の共有リンクは武器図鑑へ寄せる。
  const tabKey = t === "equips" ? "weapons" : t;
  const tab: TabKey =
    tabKey && ALL_TAB_KEYS.includes(tabKey as TabKey)
      ? (tabKey as TabKey)
      : "home";
  let detailStack: DetailView[] = [];
  for (const kind of Object.keys(LEGACY_TAB_PARAM) as DetailKind[]) {
    const v = params.get(LEGACY_TAB_PARAM[kind]);
    if (v) {
      detailStack = [{ kind, name: v }];
      break;
    }
  }
  return { tab, detailStack };
}

/** 入れ子スラッグのパスからタブ・詳細スタックを復元する。 */
export function navStateFromPath(pathname: string): NavState {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  let detailStack: DetailView[] = [];
  let tabParts = parts;
  // 末尾が「詳細スラッグ + 名前」の 2 区切りなら、それを詳細として切り出す。
  if (parts.length >= 2) {
    const segMaybe = parts[parts.length - 2];
    const kind = SEG_TO_DETAIL[segMaybe];
    if (kind) {
      detailStack = [{ kind, name: parts[parts.length - 1] }];
      tabParts = parts.slice(0, parts.length - 2);
    }
  }
  const tab = PATH_TO_TAB[tabParts.join("/")] ?? "home";
  return { tab, detailStack };
}

/** 現在のロケーション（パス優先・旧クエリは後方互換）からナビ状態を復元する。 */
export function navStateFromLocation(loc: {
  pathname: string;
  search: string;
}): NavState {
  const fromPath = navStateFromPath(loc.pathname);
  // パスが既定（ルート＝ホーム）で詳細も無いが、旧クエリ付きの共有リンクなら互換解釈する。
  if (
    fromPath.tab === "home" &&
    fromPath.detailStack.length === 0 &&
    loc.search
  ) {
    return navStateFromSearch(loc.search);
  }
  return fromPath;
}
