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
import { ToastStack } from "@/components/Toasts";
import {
  ShareIcon,
  CheckIcon,
  RefreshIcon,
  ChevronUp,
  SunIcon,
  MoonIcon,
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
  LogInIcon,
  LogOutIcon,
} from "@/components/icons";
import type { BattleRecord, TabKey, WarlordMap } from "@/lib/types";
import { normalizationMap } from "@/lib/storage";
import { yearBucketWinRankings, warlordYearRankTags } from "@/lib/stats";

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
const SwiTab = dynamic(
  () => import("@/components/tabs/SwiTab").then((m) => m.SwiTab)
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
  swi: <TrophyIcon />,
  unitrank: <UsersIcon />,
  weaponrank: <SwordIcon />,
  itemrank: <PackageIcon />,
  synergy: <LinkIcon />,
  matrix: <GridIcon />,
  metaenv: <ActivityIcon />,
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

/** 期データがまだ無いときのフォールバック期。 */
const FALLBACK_TERM = 145;

/** サイドバーの「新期」で追加した期番号の保存キー。 */
const TERM_OPTIONS_STORAGE_KEY = "onore-tool:term-options:v1";

/** 直近に選択した「対象の期」の保存キー。 */
const TERM_SELECTED_STORAGE_KEY = "onore-tool:selected-term:v1";

/** 共有DBを最後に取得した時刻を HH:MM 表記にする。 */
function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  // 共有DB・戦闘履歴・国の色設定の取得・更新
  const {
    db,
    setDb,
    battleLog,
    setBattleLog,
    factionColors,
    setFactionColors,
    hydrated,
    loadError,
    refreshing,
    lastFetchedAt,
    reload,
    refresh,
  } = useDataSync(pushToast);
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
  const [selectedTerm, setSelectedTerm] = useState<number | "all">(FALLBACK_TERM);
  const [didAutoSelectLatestTerm, setDidAutoSelectLatestTerm] = useState(false);
  const [manualTerms, setManualTerms] = useState<number[]>([]);
  const [showNewTermInput, setShowNewTermInput] = useState(false);
  const [newTermValue, setNewTermValue] = useState("");

  // 「新期」で追加した期を復元する（データ未登録でも選択肢に残す）。
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TERM_OPTIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const terms = Array.from(
        new Set(
          parsed
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v > 0)
        )
      ).sort((a, b) => b - a);
      setManualTerms(terms);
    } catch {
      // 壊れた保存データは無視して既定値で続行する。
    }
  }, []);

  // 追加した期の一覧を保存する。
  useEffect(() => {
    try {
      window.localStorage.setItem(TERM_OPTIONS_STORAGE_KEY, JSON.stringify(manualTerms));
    } catch {
      // 保存に失敗しても表示は継続する。
    }
  }, [manualTerms]);

  // 戦闘履歴に含まれる期の一覧（新しい順）。term フィールドが付与された記録から収集。
  const termOptions = useMemo(() => {
    const set = new Set<number>();
    for (const t of manualTerms) {
      set.add(t);
    }
    for (const r of battleLog) {
      set.add(r.term);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [battleLog, manualTerms]);

  // 起動時は「直近に選択した期」を復元し、無ければ最新の期を既定選択にする（初回のみ）。
  const latestTerm = termOptions[0] ?? FALLBACK_TERM;
  useEffect(() => {
    if (didAutoSelectLatestTerm) return;
    let restored = false;
    try {
      const raw = window.localStorage.getItem(TERM_SELECTED_STORAGE_KEY);
      if (raw === "all") {
        setSelectedTerm("all");
        restored = true;
      } else if (raw !== null) {
        const n = Number(raw);
        if (Number.isInteger(n) && n > 0) {
          setSelectedTerm(n);
          restored = true;
        }
      }
    } catch {
      // 壊れた保存データは無視して既定（最新の期）で続行する。
    }
    if (!restored) setSelectedTerm(latestTerm);
    setDidAutoSelectLatestTerm(true);
  }, [didAutoSelectLatestTerm, latestTerm]);

  // 選択した期を保存し、次回起動時に復元できるようにする。
  useEffect(() => {
    if (!didAutoSelectLatestTerm) return;
    try {
      window.localStorage.setItem(
        TERM_SELECTED_STORAGE_KEY,
        selectedTerm === "all" ? "all" : String(selectedTerm)
      );
    } catch {
      // 保存に失敗しても選択は継続する。
    }
  }, [selectedTerm, didAutoSelectLatestTerm]);

  // ドロップダウンに表示する期の一覧。
  // 選択中の期がデータに存在しない場合（新期入力直後など）でも選択肢に残す。
  const termOptionsWithSelected = useMemo(() => {
    if (selectedTerm === "all" || termOptions.includes(selectedTerm)) return termOptions;
    return [selectedTerm, ...termOptions].sort((a, b) => b - a);
  }, [termOptions, selectedTerm]);

  // 選択中の期の戦闘履歴のみ絞り込む（ランキング・履歴・詳細の集計に反映）。
  const filteredBattleLog = useMemo(() => {
    if (selectedTerm === "all") return battleLog;
    return battleLog.filter((r) => r.term === selectedTerm);
  }, [battleLog, selectedTerm]);

  // 選択中の期に登録された武将のみの武将DBを構築する。
  const filteredDb = useMemo(() => {
    if (selectedTerm === "all") return db;
    return Object.fromEntries(
      Object.entries(db).filter(([, w]) => w.term === selectedTerm)
    );
  }, [db, selectedTerm]);

  // filteredDb 内の household 正規化マップ（同じ household → 最新の代表名）。
  const householdNormMap = useMemo(() => normalizationMap(filteredDb), [filteredDb]);

  // 年代別（在ゲーム年）の勝率ランキング。武将ページの入賞タグは「称号」的な
  // 性質のため、期フィルタを無視して全期間の戦闘・全DBで集計する。
  const yearRankings = useMemo(
    () => yearBucketWinRankings(battleLog, db),
    [battleLog, db]
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
    setManualTerms((prev) =>
      prev.includes(term) ? prev : [...prev, term].sort((a, b) => b - a)
    );
    setSelectedTerm(term);
    setShowNewTermInput(false);
    setNewTermValue("");
  }, [isAdmin, newTermValue, pushToast]);

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
      const term = selectedTerm === "all" ? latestTerm : selectedTerm;
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
        setBattleLog(res.log);
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
            onSelectWarlord={selectWarlordNormalized}
            onSelectUnit={selectUnit}
            onSelectFaction={selectFaction}
          />
        );
      case "history":
        return (
          <HistoryTab
            canRegister={(!authReady || isAdmin) && (selectedTerm === "all" || selectedTerm === latestTerm)}
            canDelete={isAdmin}
            onRegister={handleRegister}
            log={filteredBattleLog}
            factionColors={factionColors}
            onSelectWarlord={selectWarlordNormalized}
            onSelectUnit={selectUnit}
            onDelete={handleDeleteBattle}
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
      case "swi":
        return <SwiTab log={filteredBattleLog} db={filteredDb} onSelectWarlord={selectWarlordNormalized} />;
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
      case "db":
        return <DbTab db={filteredDb} colors={factionColors} onSelectWarlord={selectWarlord} onSelectFaction={selectFaction} onImportStats={handleImportStats} />;
      case "units":
        return <UnitTab onSelectUnit={selectUnit} isAdmin={isAdmin} />;
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
          />
        );
      default:
        return null;
    }
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
      <header className="header">
        <div className="header-left">
          <button
            type="button"
            className="hamburger"
            aria-label={sidebarOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
          >
            <span />
            <span />
            <span />
          </button>
          <h1>
            <button
              type="button"
              className="brand-btn"
              onClick={() => selectTab("home")}
              title="ホームへ"
            >
              ONORE ANALYTICS
            </button>
          </h1>
        </div>
        <div className="header-actions">
          {lastFetchedAt != null && (
            <span
              className="header-fetched muted"
              title="共有DBを最後に取得した時刻"
            >
              最終取得 {formatClock(lastFetchedAt)}
            </span>
          )}
          <button
            type="button"
            className="btn header-theme"
            onClick={toggleTheme}
            aria-label={
              resolvedTheme === "dark"
                ? "ライトモードに切り替え"
                : "ダークモードに切り替え"
            }
            title={
              resolvedTheme === "dark"
                ? "ライトモードに切り替え"
                : "ダークモードに切り替え"
            }
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className={"btn header-refresh" + (refreshing ? " is-refreshing" : "")}
            onClick={refresh}
            disabled={refreshing || !hydrated}
            aria-label="共有DBを最新に更新"
            title="共有DBを最新に更新"
          >
            <RefreshIcon />
            <span>{refreshing ? "更新中…" : "更新"}</span>
          </button>
          <button
            type="button"
            className={"btn header-share" + (linkCopied ? " copied" : "")}
            onClick={handleShareLink}
            aria-label={
              linkCopied ? "リンクをコピーしました" : "このページのリンクをコピー"
            }
            title={linkCopied ? "コピーしました" : "リンクをコピー"}
          >
            {linkCopied ? <CheckIcon /> : <ShareIcon />}
            <span>{linkCopied ? "コピー済み" : "共有"}</span>
          </button>
        </div>
      </header>

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
          {/* 対象の期セレクター */}
          <div className="sidebar-term">
            <label className="sidebar-term-label" htmlFor="sidebar-term-select">
              対象の期
            </label>
            <div className="sidebar-term-row">
              <select
                id="sidebar-term-select"
                className="select sidebar-term-select"
                value={selectedTerm === "all" ? "all" : String(selectedTerm)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedTerm(v === "all" ? "all" : Number(v));
                }}
              >
                <option value="all">すべての期</option>
                {termOptionsWithSelected.map((term) => (
                  <option key={term} value={String(term)}>
                    {term}期{term === latestTerm ? "（今期）" : ""}
                  </option>
                ))}
              </select>
              {isAdmin && (
                <button
                  type="button"
                  className={"btn sidebar-term-new-btn" + (showNewTermInput ? " active" : "")}
                  title="リストにない期番号を入力して切り替える"
                  onClick={() => { setShowNewTermInput((v) => !v); setNewTermValue(""); }}
                >
                  新期
                </button>
              )}
            </div>
            {showNewTermInput && (
              <div className="sidebar-new-term" role="group" aria-label="新しい期の追加">
                <div className="sidebar-new-term-field">
                  <input
                    id="sidebar-new-term-input"
                    type="number"
                    className="input sidebar-new-term-input"
                    value={newTermValue}
                    min={1}
                    placeholder="例: 146"
                    aria-label="追加する期番号"
                    onChange={(e) => setNewTermValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleNewTermStart(); }}
                  />
                  <span className="sidebar-new-term-unit">期</span>
                </div>
                <div className="sidebar-new-term-actions">
                  <button
                    type="button"
                    className="btn btn-danger sidebar-new-term-ok"
                    onClick={handleNewTermStart}
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    className="btn sidebar-new-term-cancel"
                    onClick={() => setShowNewTermInput(false)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>

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
          {!hydrated ? (
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
