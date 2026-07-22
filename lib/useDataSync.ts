"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BattleRecord, WarlordMap } from "./types";
import type { FactionColorMap } from "./factionColors";
import { fetchState, fetchTerms, fetchFactionColors } from "./api";

export interface DataSyncState {
  db: WarlordMap;
  setDb: Dispatch<SetStateAction<WarlordMap>>;
  battleLog: BattleRecord[];
  setBattleLog: Dispatch<SetStateAction<BattleRecord[]>>;
  /** 戦闘履歴に存在する期番号の一覧（新しい順）。期セレクタ用。 */
  terms: number[];
  factionColors: FactionColorMap;
  setFactionColors: Dispatch<SetStateAction<FactionColorMap>>;
  /** 期一覧・国カラーの初回取得が完了したか（画面の初期化が可能になる）。 */
  hydrated: boolean;
  /** 選択中の期の戦闘履歴を取得中か（期切り替え時のスピナー用）。 */
  logLoading: boolean;
  loadError: boolean;
  refreshing: boolean;
  lastFetchedAt: number | null;
  reload: () => void;
  refresh: () => Promise<void>;
  /** 全期間の戦闘履歴を取得する（武将詳細の入賞タグ＝全期間集計用）。初回だけ取得しキャッシュする。 */
  loadFullLog: () => Promise<BattleRecord[]>;
}

/**
 * 共有DBと戦闘履歴の取得・更新を管理するフック。
 * 起動時は「期一覧」と「国カラー」だけを取得し、戦闘履歴は selectedTerm に追従して
 * その期の分だけを取得する（全期間を毎回ロードしない）。武将DBは件数が小さいため常に全件取得する。
 */
export function useDataSync(
  selectedTerm: number | "all" | null,
  pushToast: (kind: "success" | "error", message: string) => void
): DataSyncState {
  const [db, setDb] = useState<WarlordMap>({});
  const [battleLog, setBattleLog] = useState<BattleRecord[]>([]);
  const [terms, setTerms] = useState<number[]>([]);
  const [factionColors, setFactionColors] = useState<FactionColorMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  // 全期間 log のキャッシュ（登録・更新・削除のたびに無効化する）。
  const fullLogCache = useRef<BattleRecord[] | null>(null);

  // 初回・再試行時: 期一覧と国カラー（いずれも軽量）を取得する。
  useEffect(() => {
    let active = true;
    setLoadError(false);
    setHydrated(false);
    Promise.all([fetchTerms(), fetchFactionColors()])
      .then(([termList, colors]) => {
        if (!active) return;
        setTerms(termList);
        setFactionColors(colors);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        pushToast("error", "データの読み込みに失敗しました");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, pushToast]);

  // 選択中の期に追従して 武将DB(全件) + その期の戦闘履歴 を取得する。
  useEffect(() => {
    if (selectedTerm == null) return;
    let active = true;
    setLogLoading(true);
    fetchState(selectedTerm)
      .then((state) => {
        if (!active) return;
        setDb(state.db);
        setBattleLog(state.log);
        setLastFetchedAt(Date.now());
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        pushToast("error", "戦闘履歴の読み込みに失敗しました");
      })
      .finally(() => {
        if (active) setLogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTerm, reloadKey, pushToast]);

  /** 読み込み失敗時の再試行（期一覧から取り直す）。 */
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** 現在の期の状態を手動で再取得して最新化する（登録・削除後にも使う）。 */
  const refresh = useCallback(async () => {
    if (selectedTerm == null) return;
    setRefreshing(true);
    try {
      const [state, colors] = await Promise.all([
        fetchState(selectedTerm),
        fetchFactionColors(),
      ]);
      setDb(state.db);
      setBattleLog(state.log);
      setFactionColors(colors);
      setLastFetchedAt(Date.now());
      fullLogCache.current = null;
      pushToast("success", "最新の状態に更新しました");
    } catch {
      pushToast("error", "更新に失敗しました");
    } finally {
      setRefreshing(false);
    }
  }, [selectedTerm, pushToast]);

  /** 全期間の戦闘履歴（武将詳細の入賞タグ用）。初回だけ取得してキャッシュする。 */
  const loadFullLog = useCallback(async () => {
    if (fullLogCache.current) return fullLogCache.current;
    const state = await fetchState("all");
    fullLogCache.current = state.log;
    return state.log;
  }, []);

  return {
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
  };
}
