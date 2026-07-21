"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BattleRecord, UnitType, WarlordMap } from "@/lib/types";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { fetchUnitTypes } from "@/lib/api";
import { antiContactRanking, breakthroughRanking } from "@/lib/stats";

interface Props {
  log: BattleRecord[];
  db?: WarlordMap;
  onSelectWarlord: (name: string) => void;
}

/** 並べ替えの指標。 */
type SortKey = "antiRate" | "antiContacts" | "breakthrough";

/** ノイズ除去用の最低戦闘数の選択肢。 */
const MIN_CONTACT_OPTIONS = [1, 5, 10, 20, 30];

/** サマリーで各指標を上位何位まで出すか。 */
const TOP_N = 5;

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "antiRate", label: "Anti-Contact率" },
  { key: "antiContacts", label: "Anti-Contact数" },
  { key: "breakthrough", label: "枚数率" },
];

/** 武将 1 行分の指標（アンチ接触＋枚数率をまとめたもの）。 */
interface MetricRow {
  name: string;
  faction?: string;
  branch?: string;
  antiContacts: number;
  contacts: number;
  antiRate: number;
  /** 枚数率 = Σ n×(n枚抜き)。 */
  breakthrough: number;
  /** 攻撃出撃数（枚数率の母数・参考）。 */
  sorties: number;
}

/** アンチ率（0..1）を表示用の整数パーセントにする。 */
function formatRate(rate: number, contacts: number): string {
  if (contacts <= 0) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** 指標 metric における行 r のバー用の数値。 */
function metricValue(r: MetricRow, metric: SortKey): number {
  return metric === "antiRate"
    ? r.antiRate
    : metric === "breakthrough"
      ? r.breakthrough
      : r.antiContacts;
}

/** 指標 metric における行 r の表示用ラベル。 */
function metricLabel(r: MetricRow, metric: SortKey): string {
  return metric === "antiRate"
    ? formatRate(r.antiRate, r.contacts)
    : metric === "breakthrough"
      ? r.breakthrough.toLocaleString("ja-JP")
      : r.antiContacts.toLocaleString("ja-JP");
}

/** 指標 metric で降順に並べ替えた新しい配列を返す。 */
function sortByMetric(rows: MetricRow[], metric: SortKey): MetricRow[] {
  return [...rows].sort((a, b) => {
    if (metric === "breakthrough") {
      if (b.breakthrough !== a.breakthrough)
        return b.breakthrough - a.breakthrough;
      return b.sorties - a.sorties;
    }
    if (metric === "antiRate") {
      if (b.antiRate !== a.antiRate) return b.antiRate - a.antiRate;
      return b.antiContacts - a.antiContacts;
    }
    if (b.antiContacts !== a.antiContacts) return b.antiContacts - a.antiContacts;
    return b.antiRate - a.antiRate;
  });
}

/** ランキング 1 行（サマリー・詳細で共用）。 */
function MetricRowItem({
  r,
  rank,
  metric,
  maxValue,
  onSelectWarlord,
}: {
  r: MetricRow;
  rank: number;
  metric: SortKey;
  maxValue: number;
  onSelectWarlord: (name: string) => void;
}) {
  const value = metricValue(r, metric);
  const label = metricLabel(r, metric);
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <li className="swi-row">
      <span className="swi-rank">{rank}</span>
      <div className="swi-main">
        <div className="swi-head">
          <button
            type="button"
            className="swi-name link-like"
            onClick={() => onSelectWarlord(r.name)}
            title={`${r.name} の戦績を見る`}
          >
            {r.name}
          </button>
          <span className="swi-value">{label}</span>
        </div>
        <span
          className="swi-bar"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${r.name} ${label}`}
        >
          <span className="swi-bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <div className="swi-meta muted">
          {metric === "breakthrough" ? (
            <span className="rank-side-active">
              枚数率 {r.breakthrough.toLocaleString("ja-JP")} ／ 出撃{" "}
              {r.sorties.toLocaleString("ja-JP")}
            </span>
          ) : (
            <span className="rank-side-active">
              アンチ {r.antiContacts.toLocaleString("ja-JP")} ／ 戦闘{" "}
              {r.contacts.toLocaleString("ja-JP")}（率{" "}
              {formatRate(r.antiRate, r.contacts)}）
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * 指標タブ。武将ごとの Anti-Contact 数・率を表示する。
 *
 * アンチ＝兵科のじゃんけん。自分の兵種の得意兵科（兵種一覧のデータ）に相手の兵科が
 * 含まれる戦闘を「アンチ（有利）」として数える。ダブルアンチにも対応。
 */
export function MetricsTab({ log, db, onSelectWarlord }: Props) {
  const [unitTypes, setUnitTypes] = useState<UnitType[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // null = サマリー（各指標TOP5）、非null = その指標の詳細ランキング。
  const [activeMetric, setActiveMetric] = useState<SortKey | null>(null);
  const [minContacts, setMinContacts] = useState(1);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const loadUnitTypes = useCallback(() => {
    setLoadError(false);
    let alive = true;
    fetchUnitTypes()
      .then((list) => {
        if (alive) setUnitTypes(list);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => loadUnitTypes(), [loadUnitTypes]);

  // アンチ接触（兵種一覧が必要）と枚数率（枚抜き）を武将ごとに統合する。
  const ranking = useMemo<MetricRow[]>(() => {
    if (!unitTypes) return [];
    const byName = new Map<string, MetricRow>();
    for (const a of antiContactRanking(log, unitTypes, db)) {
      byName.set(a.name, {
        name: a.name,
        faction: a.faction,
        branch: a.branch,
        antiContacts: a.antiContacts,
        contacts: a.contacts,
        antiRate: a.antiRate,
        breakthrough: 0,
        sorties: 0,
      });
    }
    for (const b of breakthroughRanking(log, db)) {
      const row = byName.get(b.name);
      if (row) {
        row.breakthrough = b.score;
        row.sorties = b.sorties;
        row.faction = row.faction ?? b.faction;
        row.branch = row.branch ?? b.branch;
      } else {
        byName.set(b.name, {
          name: b.name,
          faction: b.faction,
          branch: b.branch,
          antiContacts: 0,
          contacts: 0,
          antiRate: 0,
          breakthrough: b.score,
          sorties: b.sorties,
        });
      }
    }
    return Array.from(byName.values());
  }, [log, db, unitTypes]);

  // 兵科の選択肢（集計対象から収集）。
  const branchOptions = useMemo(
    () =>
      Array.from(
        new Set(
          ranking
            .map((r) => r.branch?.trim())
            .filter((v): v is string => !!v)
        )
      ).sort((a, b) => a.localeCompare(b, "ja")),
    [ranking]
  );

  // サマリー：指標ごとに上位 TOP_N を切り出す（絞り込みなしの全体ランキング）。
  const summaries = useMemo(
    () =>
      SORT_OPTIONS.map((opt) => ({
        opt,
        rows: sortByMetric(ranking, opt.key).slice(0, TOP_N),
      })),
    [ranking]
  );

  // 詳細：選択中の指標で絞り込み・並べ替えた全ランキング。
  const detailRows = useMemo(() => {
    if (!activeMetric) return [];
    const q = query.trim();
    const filtered = ranking.filter(
      (r) =>
        r.contacts >= minContacts &&
        (branch ? r.branch === branch : true) &&
        (q ? r.name.includes(q) : true)
    );
    return sortByMetric(filtered, activeMetric);
  }, [ranking, activeMetric, query, branch, minContacts]);

  // バー幅の基準となる最大値（詳細表示の最大）。
  const detailMax =
    detailRows.reduce(
      (m, r) => Math.max(m, activeMetric ? metricValue(r, activeMetric) : 0),
      0
    ) || 1;

  const activeLabel = activeMetric
    ? SORT_OPTIONS.find((o) => o.key === activeMetric)?.label ?? ""
    : "";

  // 詳細ビューを開く（絞り込みは初期化して先頭へ）。
  const openDetail = useCallback((metric: SortKey) => {
    setActiveMetric(metric);
    setShowFilter(false);
    setQuery("");
    setBranch("");
    setMinContacts(1);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  // サマリーへ戻る。
  const backToSummary = useCallback(() => {
    setActiveMetric(null);
    setShowFilter(false);
    setQuery("");
    setBranch("");
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  // 検索ボックスとは別にトグルするドロップダウン系の絞り込み。
  const hasDropdownFilter = !!branch || minContacts !== 1;
  const hasFilter = !!(query || branch);
  const clearFilters = () => {
    setQuery("");
    setBranch("");
  };

  return (
    <section className="panel">
      <h2>指標</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        実験的なページ。
      </p>

      <details className="swi-formula">
        <summary>指標の詳細</summary>
        <p className="muted">
          Anti-Contact数 = 自分の兵種の得意な兵種、アンチが効いている戦闘数。
          Anti-Contact率 = Anti-Contact数 ÷ 総戦闘数。
        </p>
        <p className="muted">
          枚数率 = 1×(1枚抜き) + 2×(2枚抜き) + … + n×(n枚抜き)。n は「n戦目」の戦目番号
          （1戦目から連勝した数）です。1出撃は最大の n として1回だけ数え、3枚抜きは3点で、
          その内側の1・2枚抜きには加算しません。
        </p>
      </details>

      {loadError ? (
        <div className="empty" role="alert">
          <p className="empty-title">兵種一覧の取得に失敗しました</p>
          <p className="empty-hint">
            アンチ判定には兵種一覧のデータが必要です。通信状況を確認して再試行してください。
          </p>
          <button type="button" className="btn" onClick={loadUnitTypes}>
            再試行
          </button>
        </div>
      ) : unitTypes === null ? (
        <div className="empty">
          <p className="empty-title">読み込み中…</p>
        </div>
      ) : activeMetric === null ? (
        // サマリー：指標ごとの上位 TOP5 を並べ、詳細へ誘導する。
        summaries.map(({ opt, rows }) => {
          const max = rows.reduce(
            (m, r) => Math.max(m, metricValue(r, opt.key)),
            0
          );
          return (
            <div className="metric-section" key={opt.key}>
              <div className="metric-section-head">
                <h3>{opt.label}</h3>
                <button
                  type="button"
                  className="link-like"
                  onClick={() => openDetail(opt.key)}
                >
                  詳細を見る →
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="metric-section-empty muted">
                  条件を満たす武将がいません。
                </p>
              ) : (
                <ol className="swi-list">
                  {rows.map((r, i) => (
                    <MetricRowItem
                      key={r.name}
                      r={r}
                      rank={i + 1}
                      metric={opt.key}
                      maxValue={max}
                      onSelectWarlord={onSelectWarlord}
                    />
                  ))}
                </ol>
              )}
            </div>
          );
        })
      ) : (
        // 詳細：パンくず＋絞り込み＋その指標の全ランキング。
        <>
          <nav className="metric-crumb" aria-label="パンくずリスト">
            <button
              type="button"
              className="link-like"
              onClick={backToSummary}
            >
              指標
            </button>
            <span className="metric-crumb-sep" aria-hidden="true">
              ›
            </span>
            <span className="metric-crumb-current">{activeLabel}</span>
          </nav>

          <div className="search-row">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="武将名で検索"
            />
            <button
              type="button"
              className={
                "btn filter-toggle" +
                (showFilter || hasDropdownFilter ? " active" : "")
              }
              onClick={() => setShowFilter((v) => !v)}
              aria-expanded={showFilter}
            >
              <FilterIcon />
              <span>フィルター</span>
            </button>
            {hasFilter && (
              <button
                type="button"
                className="btn clear-filters"
                onClick={clearFilters}
                title="絞り込み条件をすべて解除"
              >
                <CloseIcon />
                <span>解除</span>
              </button>
            )}
          </div>

          {showFilter && (
            <div className="filter-grid">
              <label className="filter">
                <span>最低戦闘数</span>
                <select
                  className="select"
                  value={minContacts}
                  onChange={(e) => setMinContacts(Number(e.target.value))}
                >
                  {MIN_CONTACT_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}回以上
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter">
                <span>兵種</span>
                <select
                  className="select"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  <option value="">すべて</option>
                  {branchOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            該当 {detailRows.length.toLocaleString("ja-JP")}件
          </p>

          {detailRows.length === 0 ? (
            <div className="empty">
              <p className="empty-title">条件を満たす武将がいません</p>
              <p className="empty-hint">絞り込み条件を見直してください。</p>
            </div>
          ) : (
            <ol className="swi-list">
              {detailRows.map((r, i) => (
                <MetricRowItem
                  key={r.name}
                  r={r}
                  rank={i + 1}
                  metric={activeMetric}
                  maxValue={detailMax}
                  onSelectWarlord={onSelectWarlord}
                />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
