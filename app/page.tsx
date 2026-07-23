"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { registerState, importWarlordStats, saveFactionColorsToDb } from "@/lib/api";
import { parseBattleEntriesChecked } from "@/lib/parser";
import type { FactionColorMap } from "@/lib/factionColors";
import { copyText } from "@/lib/clipboard";
import { TAB_LABELS, TAB_GROUPS, GROUP_OF_TAB, PUBLIC_TAB_KEYS, type TabGroupKey } from "@/lib/tabs";
import { useToasts } from "@/lib/useToasts";
import { useTheme } from "@/lib/useTheme";
import { useAuth } from "@/lib/useAuth";
import { useDataSync } from "@/lib/useDataSync";
import { useAppNavigation } from "@/lib/useAppNavigation";
import { useSidebarLayout } from "@/lib/useSidebarLayout";
import { useTermSelection } from "@/lib/useTermSelection";
import type { SelectedTerm } from "@/lib/termSelection";
import { ToastStack } from "@/components/Toasts";
import { AppHeader } from "@/components/layout/AppHeader";
import { TermSelector } from "@/components/layout/TermSelector";
import {
  ChevronUp,
  HistoryIcon,
  HomeIcon,
  SearchIcon,
  ShieldIcon,
  TrophyIcon,
  DatabaseIcon,
  UsersIcon,
  SwordIcon,
  PackageIcon,
  FlagIcon,
  SlidersIcon,
  BookIcon,
  LinkIcon,
  GridIcon,
  ActivityIcon,
  TargetIcon,
  LogInIcon,
  LogOutIcon,
} from "@/components/icons";
import type { BattleRecord, TabKey, WarlordMap } from "@/lib/types";
import { normalizationMap } from "@/lib/storage";
import { yearBucketWinRankings, warlordYearRankTags } from "@/lib/stats";
import {
  getWatchlist,
  saveWatchlist,
  toggleWatched,
  isWatched,
} from "@/lib/watchlist";

const HomeTab = dynamic(
  () => import("@/components/tabs/HomeTab").then((m) => m.HomeTab)
);
const HistoryTab = dynamic(
  () => import("@/components/tabs/HistoryTab").then((m) => m.HistoryTab)
);
const ScoutTab = dynamic(
  () => import("@/components/tabs/ScoutTab").then((m) => m.ScoutTab)
);
const DbTab = dynamic(() => import("@/components/tabs/DbTab").then((m) => m.DbTab));
const DamageTab = dynamic(
  () => import("@/components/tabs/DamageTab").then((m) => m.DamageTab)
);
const UnitTab = dynamic(
  () => import("@/components/tabs/UnitTab").then((m) => m.UnitTab)
);
const EquipTab = dynamic(
  () => import("@/components/tabs/EquipTab").then((m) => m.EquipTab)
);
const NationTab = dynamic(
  () => import("@/components/tabs/NationTab").then((m) => m.NationTab)
);
const SettingsTab = dynamic(
  () => import("@/components/tabs/SettingsTab").then((m) => m.SettingsTab)
);
const RankingTab = dynamic(
  () => import("@/components/tabs/RankingTab").then((m) => m.RankingTab)
);
const EquipSynergyTab = dynamic(
  () => import("@/components/tabs/EquipSynergyTab").then((m) => m.EquipSynergyTab)
);
const TraitMatrixTab = dynamic(
  () => import("@/components/tabs/TraitMatrixTab").then((m) => m.TraitMatrixTab)
);
const MetaTab = dynamic(
  () => import("@/components/tabs/MetaTab").then((m) => m.MetaTab)
);
const MetricsTab = dynamic(
  () => import("@/components/tabs/MetricsTab").then((m) => m.MetricsTab)
);
const WarlordDetail = dynamic(
  () => import("@/components/detail/WarlordDetail").then((m) => m.WarlordDetail)
);
const UnitDetail = dynamic(
  () => import("@/components/detail/UnitDetail").then((m) => m.UnitDetail)
);
const EquipDetail = dynamic(
  () => import("@/components/detail/EquipDetail").then((m) => m.EquipDetail)
);
const FactionDetail = dynamic(
  () => import("@/components/detail/FactionDetail").then((m) => m.FactionDetail)
);

/** タブ（リーフ）ごとのアイコン。サイドバーのグループ単独表示とページ内サブタブで共用。 */
const TAB_ICONS: Record<TabKey, ReactNode> = {
  home: <HomeIcon />,
  history: <HistoryIcon />,
  scout: <SearchIcon />,
  damage: <ShieldIcon />,
  unitrank: <UsersIcon />,
  weaponrank: <SwordIcon />,
  itemrank: <PackageIcon />,
  synergy: <LinkIcon />,
  matrix: <GridIcon />,
  metaenv: <ActivityIcon />,
  metrics: <TargetIcon />,
  db: <DatabaseIcon />,
  units: <UsersIcon />,
  weapons: <SwordIcon />,
  items: <PackageIcon />,
  nations: <FlagIcon />,
  factions: <SlidersIcon />,
};

/** サイドバーのグループごとのアイコン（JSX なので描画側に置く）。 */
const GROUP_ICONS: Record<TabGroupKey, ReactNode> = {
  home: <HomeIcon />,
  history: <HistoryIcon />,
  warlords: <UsersIcon />,
  ranking: <TrophyIcon />,
  meta: <GridIcon />,
  encyclopedia: <BookIcon />,
  nations: <FlagIcon />,
  settings: <SlidersIcon />,
};

/** 年代別ランキングの空値（未計算時に返す安定参照）。 */
const EMPTY_YEAR_RANKINGS: ReturnType<typeof yearBucketWinRankings> = [];

/** 過去ログ記録モード（ON のとき過去の期にも登録可。管理者のみ）の保存キー。 */
const PAST_LOG_MODE_STORAGE_KEY = "onore-tool:past-log-mode:v1";

export default function HomePage() {
  // 通知トーストの状態管理
  const { toasts, pushToast, dismissToast } = useToasts();
  // テーマ（好み・解決結果・切替）
  const {
    themePref,
    resolvedTheme,
    setTheme: handleChangeTheme,
    toggleTheme,
  } = useTheme();
  // 認証状態（管理者ログイン）
  const { user, ready: authReady, isAdmin, logout } = useAuth();
  const [selectedTerm, setSelectedTerm] = useState<SelectedTerm>(null);
  // 共有DB・戦闘履歴・国の色設定の取得・更新（戦闘履歴は selectedTerm の期だけ取得）
  const {
    db,
    setDb,
    battleLog,
    setBattleLog,
    terms,
    factionColors,
    setFactionColors,
    hydrated,
    logLoading,
    loadError,
    refreshing,
    lastFetchedAt,
    reload,
    refresh,
    loadFullLog,
  } = useDataSync(selectedTerm, pushToast);
  const {
    latestTerm,
    termDecades,
    selectedDecade,
    termsInSelectedDecade,
    addManualTerm,
    selectDecade,
  } = useTermSelection(terms, selectedTerm, setSelectedTerm);
  // サイドバーの開閉とモバイル判定
  const { sidebarOpen, setSidebarOpen, isMobile, toggleSidebar } =
    useSidebarLayout();
  // モバイルでのナビゲーション時にサイドバーを閉じるコールバック
  const closeSidebarOnMobile = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);
  // 未ログイン（管理者以外）が見られるのは公開タブのみ。認証確認中（!authReady）と
  // 管理者は全タブ許可（undefined）にし、保護タブの URL を不用意にフォールバックしない。
  const allowedTabs = useMemo(
    () => (!authReady || isAdmin ? undefined : PUBLIC_TAB_KEYS),
    [authReady, isAdmin]
  );
  // タブ・詳細ページの状態と URL 同期
  const {
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
    selectWarlord,
    selectUnit,
    selectEquip,
    selectFaction,
    backDetail,
  } = useAppNavigation({ onCloseSidebar: closeSidebarOnMobile, allowedTabs });

  const [linkCopied, setLinkCopied] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [showNewTermInput, setShowNewTermInput] = useState(false);
  const [newTermValue, setNewTermValue] = useState("");
  // 過去ログ記録モード（ON のとき過去の期にも戦闘履歴を登録できる。管理者のみ）。
  const [pastLogMode, setPastLogMode] = useState(false);
  // ウォッチリスト（お気に入り武将）。localStorage に永続化する。
  const [watchlist, setWatchlist] = useState<string[]>([]);

  // 過去ログ記録モードを localStorage から復元する（初回のみ）。
  useEffect(() => {
    try {
      setPastLogMode(
        window.localStorage.getItem(PAST_LOG_MODE_STORAGE_KEY) === "1"
      );
    } catch {
      // 壊れた保存データは無視して OFF のまま続行する。
    }
  }, []);

  // 過去ログ記録モードの切り替え（localStorage に保存）。
  const handleChangePastLogMode = useCallback((next: boolean) => {
    setPastLogMode(next);
    try {
      window.localStorage.setItem(PAST_LOG_MODE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // 保存に失敗しても継続する。
    }
  }, []);

  // ウォッチリストを localStorage から復元する（初回のみ）。
  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  // ウォッチリストの追加／削除（localStorage に保存）。
  const handleToggleWatch = useCallback((name: string) => {
    setWatchlist((prev) => {
      const next = toggleWatched(prev, name);
      saveWatchlist(next);
      return next;
    });
  }, []);

  // 戦闘履歴はサーバー側で選択期に絞り込み済み（selectedTerm の期のみ / all は全期間）。
  const filteredBattleLog = battleLog;

  // db は常に全件取得されるため、選択中の期に登録された武将へクライアント側で絞る。
  const filteredDb = useMemo(() => {
    if (selectedTerm === "all") return db;
    if (selectedTerm == null) return {} as WarlordMap;
    return Object.fromEntries(
      Object.entries(db).filter(([, w]) => w.term === selectedTerm)
    );
  }, [db, selectedTerm]);

  // filteredDb 内の household 正規化マップ（同じ household → 最新の代表名）。
  const householdNormMap = useMemo(() => normalizationMap(filteredDb), [filteredDb]);

  // 年代別（在ゲーム年）の勝率ランキング。武将ページの入賞タグは「称号」的な性質のため
  // 全期間の戦闘で集計する。battleLog は選択期のみなので、武将詳細を開いたときだけ
  // 全期間 log を取得（loadFullLog がキャッシュ）して集計する。
  const [fullLog, setFullLog] = useState<BattleRecord[]>([]);
  useEffect(() => {
    if (detail?.kind !== "warlord") return;
    let active = true;
    loadFullLog()
      .then((log) => {
        if (active) setFullLog(log);
      })
      .catch(() => {
        /* 入賞タグは補助情報なので取得失敗は無視 */
      });
    return () => {
      active = false;
    };
  }, [detail?.kind, loadFullLog]);
  const yearRankings = useMemo(
    () =>
      detail?.kind === "warlord" && fullLog.length > 0
        ? yearBucketWinRankings(fullLog, db)
        : EMPTY_YEAR_RANKINGS,
    [detail?.kind, fullLog, db]
  );
  // 全DBでの代表名解決（入賞タグの引き当てをランキングと同じ正規化で行う）。
  const fullNormMap = useMemo(() => normalizationMap(db), [db]);

  // 武将詳細ページへの遷移。household がある場合は代表名（最新名）にリダイレクト。
  const selectWarlordNormalized = useCallback(
    (name: string) => {
      const canonical = householdNormMap[name] ?? name;
      selectWarlord(canonical);
    },
    [householdNormMap, selectWarlord]
  );

  // Escape で詳細ページを1つ戻る／モバイルのサイドバーを閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detailStack.length > 0) {
        setDetailStack((s) => s.slice(0, -1));
      } else if (isMobile && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailStack.length, isMobile, sidebarOpen, setDetailStack, setSidebarOpen]);

  // タブ・詳細ページに応じてブラウザのタイトルを更新する（履歴・共有で分かりやすく）。
  useEffect(() => {
    const base = "ONORE ANALYTICS";
    if (detail) {
      document.title = `${detail.name}｜${base}`;
    } else {
      const group = TAB_GROUPS.find((g) => g.key === GROUP_OF_TAB[tab]);
      const leaf = TAB_LABELS[tab];
      const label =
        group && group.tabs.length > 1 ? `${group.label} ${leaf}` : leaf;
      document.title = `${label}｜${base}`;
    }
  }, [detail, tab]);

  // タブ切替・詳細遷移時は本文の先頭へスクロールする。
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [tab, detail]);

  // 一定量スクロールしたら「先頭へ戻る」FABを表示する。
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const handleChangeFactionColors = useCallback(
    (next: FactionColorMap) => {
      setFactionColors(next);
      if (!isAdmin) return;
      saveFactionColorsToDb(next).catch(() => {
        pushToast("error", "国の色の保存に失敗しました");
      });
    },
    [isAdmin, setFactionColors, pushToast]
  );

  const handleNewTermStart = useCallback(() => {
    if (!isAdmin) {
      pushToast("error", "新期の追加は管理者のみ可能です");
      return;
    }
    const term = Number(newTermValue.trim());
    if (!term || term <= 0 || !Number.isInteger(term)) {
      pushToast("error", "期番号は正の整数で入力してください");
      return;
    }
    addManualTerm(term);
    setSelectedTerm(term);
    setShowNewTermInput(false);
    setNewTermValue("");
  }, [addManualTerm, isAdmin, newTermValue, pushToast, setSelectedTerm]);

  const handleShareLink = useCallback(async () => {
    const ok = await copyText(window.location.href);
    if (ok) {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      pushToast("success", "ログアウトしました");
    } catch {
      pushToast("error", "ログアウトに失敗しました");
    }
  }, [logout, pushToast]);

  const handleDeleteBattle = useCallback(
    async (id: number) => {
      try {
        const { deleteBattleRecord } = await import("@/lib/api");
        await deleteBattleRecord(id);
        // 削除後、戦闘履歴を再取得して画面を更新する。
        const newLog = battleLog.filter((r) => r.id !== id);
        setBattleLog(newLog);
        pushToast("success", "戦闘履歴を削除しました");
      } catch {
        pushToast("error", "削除に失敗しました。もう一度お試しください。");
        throw new Error("削除失敗");
      }
    },
    [battleLog, setBattleLog, pushToast]
  );

  // 「戦闘履歴」タブの表示中（絞り込み結果）をまとめて削除する。
  const handleBulkDeleteBattles = useCallback(
    async (ids: number[]) => {
      try {
        const { bulkDeleteBattleRecords } = await import("@/lib/api");
        const deleted = await bulkDeleteBattleRecords(ids);
        const idSet = new Set(ids);
        const newLog = battleLog.filter(
          (r) => r.id == null || !idSet.has(r.id)
        );
        setBattleLog(newLog);
        pushToast(
          "success",
          `戦闘履歴を${deleted.toLocaleString("ja-JP")}件削除しました`
        );
      } catch {
        pushToast("error", "一括削除に失敗しました。もう一度お試しください。");
        throw new Error("一括削除失敗");
      }
    },
    [battleLog, setBattleLog, pushToast]
  );

  const handleDeleteFaction = useCallback(
    async (faction: string) => {
      try {
        const { deleteFaction } = await import("@/lib/api");
        const { parseBattleCard } = await import("@/lib/parser");
        const { records, warlords } = await deleteFaction(faction);
        // 削除後、その国が関わる戦闘を全期間の履歴から除去する。
        const newLog = battleLog.filter((r) => {
          const card = parseBattleCard(r.line);
          if (!card) return true;
          return !(
            card.left.faction?.trim() === faction ||
            card.right.faction?.trim() === faction
          );
        });
        setBattleLog(newLog);
        // その国に所属する武将を DB 名簿からも除去し、国一覧から消えるようにする。
        const newDb = Object.fromEntries(
          Object.entries(db).filter(([, w]) => w.faction?.trim() !== faction)
        );
        setDb(newDb);
        pushToast(
          "success",
          `「${faction}」を削除しました（戦闘記録${records}件 / 武将${warlords}人）`
        );
      } catch {
        pushToast("error", "削除に失敗しました。もう一度お試しください。");
        throw new Error("削除失敗");
      }
    },
    [battleLog, db, setBattleLog, setDb, pushToast]
  );


  const handleCleanupSkewed = useCallback(async () => {
    try {
      const { cleanupSkewedData } = await import("@/lib/api");
      const {
        parseBattleCard,
        isSkewedSide,
        KNOWN_WARLORD_TYPES,
        KNOWN_BRANCHES,
      } = await import("@/lib/parser");
      const { records, warlords } = await cleanupSkewedData();
      // 項目ずれの戦闘記録をローカルのログからも除去する。
      const newLog = battleLog.filter((r) => {
        const card = parseBattleCard(r.line);
        if (!card) return true;
        return !(isSkewedSide(card.left) || isSkewedSide(card.right));
      });
      setBattleLog(newLog);
      // ずれて登録された武将を DB 名簿からも除去する。
      // (1) type/branch が空でなく既知でない、(2) name が国名（他武将の faction）。
      const factionSet = new Set(
        Object.values(db)
          .map((w) => w.faction?.trim())
          .filter((f): f is string => !!f)
      );
      const newDb = Object.fromEntries(
        Object.entries(db).filter(
          ([, w]) =>
            !(
              (w.type !== "" && !KNOWN_WARLORD_TYPES.has(w.type)) ||
              (w.branch !== "" && !KNOWN_BRANCHES.has(w.branch)) ||
              factionSet.has(w.name.trim())
            )
        )
      );
      setDb(newDb);
      pushToast(
        "success",
        `ずれたデータを整理しました（戦闘記録${records}件 / 武将${warlords}人）`
      );
    } catch {
      pushToast("error", "データの整理に失敗しました。もう一度お試しください。");
      throw new Error("整理失敗");
    }
  }, [battleLog, db, setBattleLog, setDb, pushToast]);


  const handleRegister = useCallback(
    async (text: string) => {
      const { entries, rejected } = parseBattleEntriesChecked(text);
      const warlords = entries.flatMap((e) => e.warlords);
      const rejectedCount = rejected.length;
      // 項目の過不足を検出した行は登録せず、トーストで警告する。
      const rejectMessage =
        rejectedCount > 0
          ? `項目の過不足を検出しました（${
              rejected[0].battleNo ?? "1件目"
            }: ${rejected[0].reason}${
              rejectedCount > 1 ? ` ほか${rejectedCount - 1}件` : ""
            }）。該当の戦闘は登録していません。`
          : "";
      if (warlords.length === 0) {
        if (rejectedCount > 0) {
          pushToast("error", rejectMessage);
        }
        return {
          added: 0,
          updated: 0,
          parsed: 0,
          skipped: 0,
          rejected: rejectedCount,
        };
      }
      const now = Date.now();
      const term = selectedTerm === "all" || selectedTerm == null ? latestTerm : selectedTerm;
      const warlordsWithTerm = warlords.map((w) => ({ ...w, term }));
      const records: BattleRecord[] = entries.map((e) => ({
        line: e.line,
        time: e.time,
        term,
        savedAt: now,
      }));
      try {
        const res = await registerState(warlordsWithTerm, records);
        setDb(res.db);
        // battleLog は選択期のみ保持する。登録レスポンス（全期間）から選択期分だけ反映する。
        setBattleLog(
          selectedTerm === "all"
            ? res.log
            : res.log.filter((r) => r.term === (selectedTerm ?? term))
        );
        if (rejectedCount > 0) {
          pushToast(
            "error",
            `${rejectMessage} 正常分（新規 ${res.added} / 更新 ${res.updated}）は登録しました。`
          );
        } else {
          pushToast(
            "success",
            `登録: 新規 ${res.added} / 更新 ${res.updated}（履歴 +${res.logAdded} / 重複 ${res.skipped}）`
          );
        }
        return {
          added: res.added,
          updated: res.updated,
          parsed: warlords.length,
          skipped: res.skipped,
          rejected: rejectedCount,
        };
      } catch (e) {
        pushToast("error", "登録に失敗しました");
        // 呼び出し側（HistoryTab）で入力を保持しエラー表示できるよう再送出する。
        throw e;
      }
    },
    [pushToast, setDb, setBattleLog, selectedTerm, latestTerm]
  );

  const handleImportStats = useCallback(
    async (
      stats: Parameters<typeof importWarlordStats>[0],
      skipped = 0
    ): Promise<{ updated: number; created: number }> => {
      const res = await importWarlordStats(stats);
      setDb(res.db);
      if (skipped > 0) {
        pushToast(
          "error",
          `能力値取り込み: 項目の過不足により ${skipped}行をスキップしました。正常分（更新 ${res.updated} / 新規 ${res.created}）は取り込みました。`
        );
      } else {
        pushToast(
          "success",
          `能力値取り込み: 更新 ${res.updated} / 新規 ${res.created}`
        );
      }
      return { updated: res.updated, created: res.created };
    },
    [pushToast, setDb]
  );

  const content = useMemo(() => {
    switch (tab) {
      case "home":
        return (
          <HomeTab
            log={filteredBattleLog}
            db={db}
            colors={factionColors}
            isAdmin={isAdmin}
            watchlist={watchlist}
            onToggleWatch={handleToggleWatch}
            onSelectWarlord={selectWarlordNormalized}
            onSelectUnit={selectUnit}
            onSelectFaction={selectFaction}
          />
        );
      case "history":
        return (
          <HistoryTab
            canRegister={(!authReady || isAdmin) && (selectedTerm === "all" || selectedTerm === latestTerm || (isAdmin && pastLogMode))}
            canDelete={isAdmin}
            onRegister={handleRegister}
            log={filteredBattleLog}
            factionColors={factionColors}
            onSelectWarlord={selectWarlordNormalized}
            onSelectUnit={selectUnit}
            onDelete={handleDeleteBattle}
            onBulkDelete={handleBulkDeleteBattles}
          />
        );
      case "scout":
        return (
          <ScoutTab
            db={db}
            colors={factionColors}
            onSelectWarlord={selectWarlordNormalized}
          />
        );
      case "damage":
        return (
          <DamageTab
            db={filteredDb}
            colors={factionColors}
            onSelectWarlord={selectWarlordNormalized}
          />
        );
      case "unitrank":
        return (
          <RankingTab
            variant="unit"
            log={filteredBattleLog}
            onSelectUnit={selectUnit}
            onSelectEquip={selectEquip}
            onSelectWarlord={selectWarlordNormalized}
          />
        );
      case "weaponrank":
        return (
          <RankingTab
            variant="weapon"
            log={filteredBattleLog}
            onSelectUnit={selectUnit}
            onSelectEquip={selectEquip}
            onSelectWarlord={selectWarlordNormalized}
          />
        );
      case "itemrank":
        return (
          <RankingTab
            variant="item"
            log={filteredBattleLog}
            onSelectUnit={selectUnit}
            onSelectEquip={selectEquip}
            onSelectWarlord={selectWarlordNormalized}
          />
        );
      case "synergy":
        return (
          <EquipSynergyTab
            log={filteredBattleLog}
            onSelectWarlord={selectWarlordNormalized}
            onSelectEquip={selectEquip}
          />
        );
      case "matrix":
        return (
          <TraitMatrixTab
            log={filteredBattleLog}
            onSelectWarlord={selectWarlordNormalized}
            onSelectUnit={selectUnit}
          />
        );
      case "metaenv":
        return <MetaTab log={filteredBattleLog} onSelectUnit={selectUnit} />;
      case "metrics":
        return (
          <MetricsTab
            log={filteredBattleLog}
            db={filteredDb}
            onSelectWarlord={selectWarlordNormalized}
          />
        );
      case "db":
        return <DbTab db={filteredDb} colors={factionColors} onSelectWarlord={selectWarlord} onSelectFaction={selectFaction} onImportStats={handleImportStats} />;
      case "units":
        return (
          <UnitTab
            onSelectUnit={selectUnit}
            isAdmin={isAdmin}
            log={filteredBattleLog}
            termScoped={selectedTerm !== "all"}
          />
        );
      case "weapons":
        return (
          <EquipTab
            variant="weapon"
            log={filteredBattleLog}
            onSelectWarlord={selectWarlordNormalized}
            onSelectEquip={(name) => selectEquip(name, "weapon")}
          />
        );
      case "items":
        return (
          <EquipTab
            variant="item"
            log={filteredBattleLog}
            onSelectWarlord={selectWarlordNormalized}
            onSelectEquip={(name) => selectEquip(name, "item")}
          />
        );
      case "nations":
        return (
          <NationTab
            db={filteredDb}
            log={filteredBattleLog}
            colors={factionColors}
            onSelectFaction={selectFaction}
          />
        );
      case "factions":
        return (
          <SettingsTab
            db={filteredDb}
            log={filteredBattleLog}
            colors={factionColors}
            onChangeColors={handleChangeFactionColors}
            onSelectFaction={selectFaction}
            themePref={themePref}
            onChangeTheme={handleChangeTheme}
            isAdmin={isAdmin}
            onDeleteFaction={handleDeleteFaction}
            onCleanupSkewed={handleCleanupSkewed}
            pastLogMode={pastLogMode}
            onChangePastLogMode={handleChangePastLogMode}
          />
        );
      default:
        return null;
    }
    // selectedTerm / latestTerm は filteredBattleLog・filteredDb 経由で反映されるため、
    // 依存配列には含めない（含めると同じ内容で不要な再計算になる）。意図的な除外。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    db,
    filteredDb,
    filteredBattleLog,
    factionColors,
    authReady,
    isAdmin,
    themePref,
    handleRegister,
    handleImportStats,
    handleChangeFactionColors,
    handleChangeTheme,
    handleDeleteBattle,
    handleBulkDeleteBattles,
    handleDeleteFaction,
    handleCleanupSkewed,
    pastLogMode,
    handleChangePastLogMode,
    watchlist,
    handleToggleWatch,
    selectWarlord,
    selectWarlordNormalized,
    selectUnit,
    selectEquip,
    selectFaction,
  ]);

  let detailView: React.ReactNode = null;
  if (detail) {
    if (detail.kind === "warlord") {
      // ランキングと同じ正規化で代表名を解決し、入賞タグを引き当てる。
      const repName = fullNormMap[detail.name] ?? detail.name;
      detailView = (
        <WarlordDetail
          name={detail.name}
          db={filteredDb}
          log={filteredBattleLog}
          colors={factionColors}
          canComment={isAdmin}
          isAdmin={isAdmin}
          isWatched={isWatched(watchlist, detail.name)}
          onToggleWatch={handleToggleWatch}
          yearRankTags={warlordYearRankTags(yearRankings, repName)}
          onSelectWarlord={selectWarlordNormalized}
          onSelectUnit={selectUnit}
          onSelectFaction={selectFaction}
          onBack={backDetail}
        />
      );
    } else if (detail.kind === "unit") {
      detailView = (
        <UnitDetail
          name={detail.name}
          log={filteredBattleLog}
          onSelectWarlord={selectWarlordNormalized}
          onSelectUnit={selectUnit}
          onBack={backDetail}
        />
      );
    } else if (detail.kind === "faction") {
      detailView = (
        <FactionDetail
          name={detail.name}
          db={filteredDb}
          log={filteredBattleLog}
          colors={factionColors}
          canViewLatestUnits={isAdmin}
          onSelectWarlord={selectWarlordNormalized}
          onSelectUnit={selectUnit}
          onBack={backDetail}
        />
      );
    } else {
      detailView = (
        <EquipDetail
          name={detail.name}
          slot={detail.kind}
          log={filteredBattleLog}
          onSelectWarlord={selectWarlordNormalized}
          onSelectUnit={selectUnit}
          onBack={backDetail}
        />
      );
    }
  }

  return (
    <div className={"app" + (sidebarOpen ? " sidebar-open" : "")}>
      <a href="#main-panel" className="skip-link">
        本文へスキップ
      </a>
      <AppHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onSelectHome={() => selectTab("home")}
        lastFetchedAt={lastFetchedAt}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        refreshing={refreshing}
        hydrated={hydrated}
        onRefresh={refresh}
        linkCopied={linkCopied}
        onShareLink={handleShareLink}
      />

      <div className="body">
        {isMobile && sidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <aside
          className="sidebar"
          role="navigation"
          aria-label="メインメニュー"
          aria-hidden={!sidebarOpen}
        >
          <TermSelector
            selectedTerm={selectedTerm}
            selectedDecade={selectedDecade}
            termDecades={termDecades}
            termsInSelectedDecade={termsInSelectedDecade}
            latestTerm={latestTerm}
            isAdmin={isAdmin}
            showNewTermInput={showNewTermInput}
            newTermValue={newTermValue}
            onSelectTerm={setSelectedTerm}
            onSelectDecade={selectDecade}
            onToggleNewTermInput={() => {
              setShowNewTermInput((visible) => !visible);
              setNewTermValue("");
            }}
            onChangeNewTermValue={setNewTermValue}
            onSubmitNewTerm={handleNewTermStart}
            onCancelNewTerm={() => setShowNewTermInput(false)}
          />

          <nav
            className="nav"
            role="tablist"
            aria-orientation="vertical"
            aria-label="メインメニュー"
            onKeyDown={onTabKeyDown}
          >
            {navGroups.map((g, i) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                id={`group-${g.key}`}
                aria-selected={activeGroup === g.key}
                aria-controls="main-panel"
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                tabIndex={sidebarOpen && activeGroup === g.key ? 0 : -1}
                className={"nav-item" + (activeGroup === g.key ? " active" : "")}
                onClick={() => selectGroup(g.key)}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  {GROUP_ICONS[g.key]}
                </span>
                <span className="nav-item-label">{g.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            {authReady &&
              (isAdmin ? (
                <button
                  type="button"
                  className="btn header-auth sidebar-auth"
                  onClick={handleLogout}
                  aria-label={`${user?.username ?? "管理者"} としてログイン中。ログアウトする`}
                  title={`${user?.username ?? "管理者"}（クリックでログアウト）`}
                >
                  <LogOutIcon />
                  <span>ログアウト</span>
                </button>
              ) : (
                <a
                  className="btn header-auth sidebar-auth"
                  href="/login"
                  aria-label="管理者ログイン"
                  title="管理者ログイン"
                >
                  <LogInIcon />
                  <span>管理者ログイン</span>
                </a>
              ))}
          </div>
        </aside>

        <main
          className="main"
          id="main-panel"
          role="tabpanel"
          aria-labelledby={hasSubtabs ? `subtab-${tab}` : `group-${activeGroup}`}
          tabIndex={-1}
        >
          {!hydrated ||
          (!loadError && (selectedTerm == null || logLoading)) ? (
            <div className="panel" aria-busy="true" aria-live="polite">
              <span className="sr-only">読み込み中…</span>
              <div className="skeleton skeleton-title" />
              <div className="skeleton-grid" aria-hidden="true">
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-stat" />
              </div>
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line skeleton-line--80" />
              <div className="skeleton skeleton-line skeleton-line--60" />
            </div>
          ) : loadError ? (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>データを読み込めませんでした</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                サーバー（共有DB）への接続に失敗しました。時間をおいて再度お試しください。
              </p>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={reload}>
                  再読み込み
                </button>
              </div>
            </div>
          ) : (
            detailView ?? (
              <>
                {hasSubtabs && (
                  <div
                    role="tablist"
                    aria-label={`${activeGroupDef.label}の表示切替`}
                    aria-orientation="horizontal"
                    className="subtabs"
                    onKeyDown={onSubTabKeyDown}
                  >
                    {groupTabs.map((leaf, i) => (
                      <button
                        key={leaf}
                        type="button"
                        role="tab"
                        id={`subtab-${leaf}`}
                        aria-selected={tab === leaf}
                        aria-controls="main-panel"
                        ref={(el) => {
                          subTabRefs.current[i] = el;
                        }}
                        tabIndex={tab === leaf ? 0 : -1}
                        className={"subtab" + (tab === leaf ? " active" : "")}
                        onClick={() => selectTab(leaf)}
                      >
                        <span className="subtab-icon" aria-hidden="true">
                          {TAB_ICONS[leaf]}
                        </span>
                        <span className="subtab-label">{TAB_LABELS[leaf]}</span>
                      </button>
                    ))}
                  </div>
                )}
                {content}
              </>
            )
          )}
        </main>
      </div>

      <footer className="app-footer" aria-label="お問い合わせ">
        <p className="app-footer-text">
          不具合やご要望があれば、
          <a
            className="app-footer-link"
            href="https://x.com/kani4dx"
            target="_blank"
            rel="noopener noreferrer"
          >
            @kani4dx
          </a>
          までご連絡ください。
        </p>
      </footer>

      {showTop && (
        <button
          type="button"
          className="back-to-top"
          onClick={scrollToTop}
          aria-label="先頭へ戻る"
          title="先頭へ戻る"
        >
          <ChevronUp />
        </button>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
