"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject } from "react";
import type { TabKey } from "./types";
import { TAB_GROUPS, GROUP_OF_TAB, type TabGroup, type TabGroupKey } from "./tabs";
import {
  buildPath,
  navStateFromLocation,
  type DetailView,
} from "./navigation";

export interface AppNavigationState {
  tab: TabKey;
  detailStack: DetailView[];
  setDetailStack: React.Dispatch<React.SetStateAction<DetailView[]>>;
  detail: DetailView | null;
  /** サイドバーに表示するグループ一覧（未ログイン時は公開グループのみ）。 */
  navGroups: TabGroup[];
  activeGroup: TabGroupKey;
  activeGroupDef: (typeof TAB_GROUPS)[number];
  groupTabs: TabKey[];
  hasSubtabs: boolean;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  subTabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  selectTab: (key: TabKey) => void;
  selectGroup: (g: TabGroupKey) => void;
  onTabKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onSubTabKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  openDetail: (kind: DetailView["kind"], name: string) => void;
  selectWarlord: (name: string) => void;
  selectUnit: (name: string) => void;
  selectEquip: (name: string, slot: "weapon" | "item") => void;
  selectFaction: (name: string) => void;
  backDetail: () => void;
}

interface UseAppNavigationOptions {
  /**
   * タブ切替・詳細遷移時に呼ばれるコールバック。
   * モバイルでサイドバーを閉じるなど、ナビゲーションに連動した副作用を渡す。
   */
  onCloseSidebar?: () => void;
  /**
   * 閲覧を許可するリーフタブ。指定すると、それ以外のグループはサイドバーから隠し、
   * 保護タブが選択されたら最初の公開タブへフォールバックする。
   * undefined（既定）はすべてのタブを許可する（＝管理者 / 認証確認中）。
   */
  allowedTabs?: TabKey[];
}

/**
 * タブ・詳細ページの状態、URL との同期、ナビゲーション操作をまとめるフック。
 *
 * - タブ / 詳細スタックの状態管理
 * - URL への push / replaceState 同期
 * - ブラウザの戻る・進む (popstate) への対応
 * - サイドバー・セグメントのキーボード操作
 * - 詳細ページを開く共通ロジック
 */
export function useAppNavigation({
  onCloseSidebar,
  allowedTabs,
}: UseAppNavigationOptions = {}): AppNavigationState {
  const [tab, setTab] = useState<TabKey>("home");
  const [detailStack, setDetailStack] = useState<DetailView[]>([]);

  // グループごとに最後に開いていたリーフタブ。グループ再選択時に復元する。
  const [lastLeaf, setLastLeaf] = useState<Record<TabGroupKey, TabKey>>(() => {
    const init = {} as Record<TabGroupKey, TabKey>;
    for (const g of TAB_GROUPS) init[g.key] = g.tabs[0];
    return init;
  });

  // サイドバー・セグメントのロービングタブインデックス用の参照
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const subTabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // URL 同期の制御フラグ
  const justRestored = useRef(false);
  const fromPopState = useRef(false);
  const firstUrlSync = useRef(true);

  const detail = detailStack[detailStack.length - 1] ?? null;
  const activeGroup = GROUP_OF_TAB[tab];
  const activeGroupDef = TAB_GROUPS.find((g) => g.key === activeGroup)!;
  const groupTabs = activeGroupDef.tabs;
  const hasSubtabs = groupTabs.length > 1;

  // サイドバーに表示するグループ。allowedTabs があれば公開グループのみに絞る。
  const navGroups = useMemo(
    () =>
      allowedTabs
        ? TAB_GROUPS.filter((g) => g.tabs.some((t) => allowedTabs.includes(t)))
        : TAB_GROUPS,
    [allowedTabs]
  );

  // 未ログインで保護タブが選択されている場合は最初の公開タブへ寄せる。
  // URL は履歴を汚さないよう replace で正規化する（justRestored 経由）。
  useEffect(() => {
    if (!allowedTabs || allowedTabs.includes(tab)) return;
    const fallback = navGroups[0]?.tabs[0];
    if (fallback) {
      justRestored.current = true;
      setTab(fallback);
    }
  }, [allowedTabs, tab, navGroups]);

  // タブが変わったら、そのグループの「最後に開いたリーフ」を更新する。
  useEffect(() => {
    setLastLeaf((prev) =>
      prev[GROUP_OF_TAB[tab]] === tab
        ? prev
        : { ...prev, [GROUP_OF_TAB[tab]]: tab }
    );
  }, [tab]);

  // 初回マウント時に URL からタブ・詳細ページを復元（共有リンク・再読込対応）
  useEffect(() => {
    const { tab: t, detailStack: stack } = navStateFromLocation(
      window.location
    );
    if (t !== "home" || stack.length > 0) {
      justRestored.current = true;
      setTab(t);
      setDetailStack(stack);
    }
  }, []);

  // タブ・詳細ページの変化を履歴へ反映する。
  // 前進ナビ（タブ切替・詳細を開く/積む）は pushState で履歴を積み、
  // 復元・戻る/進む由来の変化は replaceState に留めて二重登録を防ぐ。
  useEffect(() => {
    if (firstUrlSync.current) {
      firstUrlSync.current = false;
      return;
    }
    const path = buildPath(tab, detail);
    const navState = { tab, detailStack };
    if (justRestored.current || fromPopState.current) {
      justRestored.current = false;
      fromPopState.current = false;
      // 復元直後は、旧クエリ付き共有リンクをクリーンなスラッグURLへ正規化する。
      window.history.replaceState(navState, "", path);
      return;
    }
    window.history.pushState(navState, "", path);
  }, [tab, detail, detailStack]);

  // ブラウザ／端末の戻る・進むでタブ・詳細を行き来する。
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      fromPopState.current = true;
      const st = e.state as
        | { tab?: TabKey; detailStack?: DetailView[] }
        | null;
      if (st && typeof st.tab === "string") {
        setTab(st.tab);
        setDetailStack(Array.isArray(st.detailStack) ? st.detailStack : []);
      } else {
        // state を持たないエントリ（直リンク初期エントリ等）は URL から復元。
        const { tab: t, detailStack: stack } = navStateFromLocation(
          window.location
        );
        setTab(t);
        setDetailStack(stack);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectTab = useCallback(
    (key: TabKey) => {
      setTab(key);
      setDetailStack([]);
      onCloseSidebar?.();
    },
    [onCloseSidebar]
  );

  const selectGroup = useCallback(
    (g: TabGroupKey) => {
      const def = TAB_GROUPS.find((x) => x.key === g)!;
      selectTab(lastLeaf[g] ?? def.tabs[0]);
    },
    [lastLeaf, selectTab]
  );

  // サイドバー（縦のグループ一覧）のキーボード操作（↑↓ / Home / End）
  const onTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const idx = navGroups.findIndex((g) => g.key === activeGroup);
      let next = -1;
      if (e.key === "ArrowDown") next = (idx + 1) % navGroups.length;
      else if (e.key === "ArrowUp")
        next = (idx - 1 + navGroups.length) % navGroups.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = navGroups.length - 1;
      else return;
      e.preventDefault();
      selectGroup(navGroups[next].key);
      tabRefs.current[next]?.focus();
    },
    [navGroups, activeGroup, selectGroup]
  );

  // ページ内サブタブ（横のセグメント）のキーボード操作（←→ / Home / End）
  const onSubTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const idx = groupTabs.indexOf(tab);
      let next = -1;
      if (e.key === "ArrowRight") next = (idx + 1) % groupTabs.length;
      else if (e.key === "ArrowLeft")
        next = (idx - 1 + groupTabs.length) % groupTabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = groupTabs.length - 1;
      else return;
      e.preventDefault();
      selectTab(groupTabs[next]);
      subTabRefs.current[next]?.focus();
    },
    [groupTabs, tab, selectTab]
  );

  // 詳細ページ（武将 / 兵種 / 武器 / 品物 / 国）を開く共通処理。
  // 同じ対象が既に最前面なら積まない。
  const openDetail = useCallback(
    (kind: DetailView["kind"], name: string) => {
      const n = name.trim();
      if (!n) return;
      setDetailStack((s) => {
        const top = s[s.length - 1];
        if (top && top.kind === kind && top.name === n) return s;
        return [...s, { kind, name: n }];
      });
      onCloseSidebar?.();
    },
    [onCloseSidebar]
  );

  const selectWarlord = useCallback(
    (name: string) => openDetail("warlord", name),
    [openDetail]
  );
  const selectUnit = useCallback(
    (name: string) => openDetail("unit", name),
    [openDetail]
  );
  const selectEquip = useCallback(
    (name: string, slot: "weapon" | "item") => openDetail(slot, name),
    [openDetail]
  );
  const selectFaction = useCallback(
    (name: string) => openDetail("faction", name),
    [openDetail]
  );
  const backDetail = useCallback(
    () => setDetailStack((s) => s.slice(0, -1)),
    []
  );

  return {
    tab,
    detailStack,
    setDetailStack,
    detail,
    navGroups,
    activeGroup,
    activeGroupDef,
    groupTabs,
    hasSubtabs,
    tabRefs,
    subTabRefs,
    selectTab,
    selectGroup,
    onTabKeyDown,
    onSubTabKeyDown,
    openDetail,
    selectWarlord,
    selectUnit,
    selectEquip,
    selectFaction,
    backDetail,
  };
}
