"use client";

import { useCallback, useMemo, useState } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { breakthroughRanking, pontaPointRanking } from "@/lib/stats";

interface Props {
  log: BattleRecord[];
  db?: WarlordMap;
  onSelectWarlord: (name: string) => void;
}

/** 並べ替えの指標。 */
type SortKey = "wpn" | "pontaPoint" | "breakthrough" | "breakthroughRate";

/** ノイズ除去用の最低戦闘数の選択肢。 */
const MIN_CONTACT_OPTIONS = [1, 5, 10, 20, 30];

/** サマリーで各指標を上位何位まで出すか。 */
const TOP_N = 3;

const SORT_OPTIONS: { key: SortKey; label: string; desc: string }[] = [
  {
    key: "wpn",
    label: "WPN",
    desc: "勝率 ＋ 抜き率。勝率＝(出兵勝＋守備勝)÷戦闘数（撤退戦を除く）。野球で言えばOPS（出塁率＋長打率）のような総合力の指標。",
  },
  {
    key: "pontaPoint",
    label: "PontaPoint",
    desc: "ジョンさん印の指標。(出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。普通の勝率の分子で守備の1勝を1.4勝としてボーナスしたもの。",
  },
  {
    key: "breakthrough",
    label: "抜き数",
    desc: "1×(1枚抜き) + 2×(2枚抜き) + … + n×(n枚抜き)。野球で言えば塁打数。",
  },
  {
    key: "breakthroughRate",
    label: "抜き率",
    desc: "抜き数 ÷ 出兵数（各出兵を１回と数え、２戦目以降は数えません）。野球で言えば長打率。またの名をランカス度。",
  },
];

/** 武将 1 行分の指標（WPN・PontaPoint・抜き数・抜き率をまとめたもの）。 */
interface MetricRow {
  name: string;
  faction?: string;
  branch?: string;
  /** WPN = 勝率 + 抜き率。 */
  wpn: number;
  /** 勝率 = (出兵勝 + 守備勝) ÷ 戦闘数（撤退戦を除く）。 */
  winRate: number;
  /** PontaPoint = (出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。 */
  pontaPoint: number;
  /** 出兵側として勝った戦闘数。 */
  attackWins: number;
  /** 守備側として勝った戦闘数。 */
  defenseWins: number;
  /** 戦闘数（撤退戦を除く＝勝＋負。PontaPoint・最低戦闘数の母数）。 */
  battles: number;
  /** 抜き数 = Σ n×(n枚抜き)。 */
  breakthrough: number;
  /** 抜き率 = 抜き数 ÷ 出兵数（sorties。出兵ごとに1、２戦目以降は数えない）。 */
  breakthroughRate: number;
  /** 出兵数（参考）。 */
  sorties: number;
}

/** 指標 metric における行 r のバー用の数値。 */
function metricValue(r: MetricRow, metric: SortKey): number {
  return metric === "wpn"
    ? r.wpn
    : metric === "pontaPoint"
      ? r.pontaPoint
      : metric === "breakthrough"
        ? r.breakthrough
        : r.breakthroughRate;
}

/** 指標 metric における行 r の表示用ラベル。 */
function metricLabel(r: MetricRow, metric: SortKey): string {
  return metric === "wpn"
    ? r.battles > 0 || r.sorties > 0
      ? r.wpn.toFixed(3)
      : "—"
    : metric === "pontaPoint"
      ? r.battles > 0
        ? r.pontaPoint.toFixed(3)
        : "—"
      : metric === "breakthrough"
        ? r.breakthrough.toLocaleString("ja-JP")
        : r.sorties > 0
          ? r.breakthroughRate.toFixed(3)
          : "—";
}

/** 指標 metric で降順に並べ替えた新しい配列を返す。 */
function sortByMetric(rows: MetricRow[], metric: SortKey): MetricRow[] {
  return [...rows].sort((a, b) => {
    if (metric === "wpn") {
      if (b.wpn !== a.wpn) return b.wpn - a.wpn;
      return b.battles - a.battles;
    }
    if (metric === "breakthrough") {
      if (b.breakthrough !== a.breakthrough)
        return b.breakthrough - a.breakthrough;
      return b.sorties - a.sorties;
    }
    if (metric === "breakthroughRate") {
      if (b.breakthroughRate !== a.breakthroughRate)
        return b.breakthroughRate - a.breakthroughRate;
      return b.breakthrough - a.breakthrough;
    }
    // pontaPoint
    if (b.pontaPoint !== a.pontaPoint) return b.pontaPoint - a.pontaPoint;
    return b.battles - a.battles;
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
          {metric === "wpn" ? (
            <span className="rank-side-active">
              勝率 {r.winRate.toFixed(3)} ＋ 抜き率{" "}
              {r.breakthroughRate.toFixed(3)}
            </span>
          ) : metric === "breakthrough" ? (
            <span className="rank-side-active">
              抜き数 {r.breakthrough.toLocaleString("ja-JP")} ／ 出撃{" "}
              {r.sorties.toLocaleString("ja-JP")}
            </span>
          ) : metric === "breakthroughRate" ? (
            <span className="rank-side-active">
              抜き数 {r.breakthrough.toLocaleString("ja-JP")} ／ 出兵{" "}
              {r.sorties.toLocaleString("ja-JP")}
            </span>
          ) : (
            <span className="rank-side-active">
              出兵 {r.attackWins.toLocaleString("ja-JP")}勝 ／ 守備{" "}
              {r.defenseWins.toLocaleString("ja-JP")}勝 ／ 戦闘{" "}
              {r.battles.toLocaleString("ja-JP")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * 指標タブ。武将ごとの PontaPoint・抜き数・抜き率を表示する。
 *
 * PontaPoint＝勝率の分子で守備の1勝を1.4勝として評価した率。抜き数・抜き率は出兵側の
 * 枚抜き（突破）を集計したもの。いずれも「対象の期」でフィルタ済みのログから算出する。
 */
export function MetricsTab({ log, db, onSelectWarlord }: Props) {
  // null = サマリー（各指標TOP3）、非null = その指標の詳細ランキング。
  const [activeMetric, setActiveMetric] = useState<SortKey | null>(null);
  const [minContacts, setMinContacts] = useState(1);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  // PontaPoint と枚抜き（抜き数・抜き率）を武将ごとに統合する。
  const ranking = useMemo<MetricRow[]>(() => {
    const byName = new Map<string, MetricRow>();
    for (const p of pontaPointRanking(log, db)) {
      const winRate =
        p.battles > 0 ? (p.attackWins + p.defenseWins) / p.battles : 0;
      byName.set(p.name, {
        name: p.name,
        faction: p.faction,
        branch: p.branch,
        wpn: 0,
        winRate,
        pontaPoint: p.pontaPoint,
        attackWins: p.attackWins,
        defenseWins: p.defenseWins,
        battles: p.battles,
        breakthrough: 0,
        breakthroughRate: 0,
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
          wpn: 0,
          winRate: 0,
          pontaPoint: 0,
          attackWins: 0,
          defenseWins: 0,
          battles: 0,
          breakthrough: b.score,
          breakthroughRate: 0,
          sorties: b.sorties,
        });
      }
    }
    const rows = Array.from(byName.values());
    // 抜き率 = 抜き数 ÷ 出兵数（出兵数 0 は 0）。WPN = 勝率 + 抜き率。
    for (const r of rows) {
      r.breakthroughRate = r.sorties > 0 ? r.breakthrough / r.sorties : 0;
      r.wpn = r.winRate + r.breakthroughRate;
    }
    return rows;
  }, [log, db]);

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
        r.battles >= minContacts &&
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

  const activeOption = activeMetric
    ? SORT_OPTIONS.find((o) => o.key === activeMetric)
    : undefined;
  const activeLabel = activeOption?.label ?? "";
  const activeDesc = activeOption?.desc ?? "";

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

      {activeMetric === null ? (
        // サマリー：指標ごとの上位 TOP3 を並べ、詳細へ誘導する。
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
              <p className="metric-section-desc muted">{opt.desc}</p>
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
          <p className="metric-section-desc muted">{activeDesc}</p>

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
