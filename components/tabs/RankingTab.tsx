"use client";

import { useCallback, useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import {
  assetMetricRanking,
  formatWinRate,
  rankingPeriods,
  type AssetMetricStat,
} from "@/lib/stats";
import {
  ASSET_RANKING_MIN_COUNT_OPTIONS,
  DEFAULT_RANKING_FILTERS_OPEN,
  DEFAULT_RANKING_MIN_COUNT,
  DEFAULT_RANKING_PERIOD_KEY,
} from "@/lib/rankingDefaults";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";

/** ランキングの対象。unit=兵種 / weapon=武器(武将の持つ武器) / item=品物(武将の持つ品物)。 */
export type RankVariant = "unit" | "weapon" | "item";

interface Props {
  log: BattleRecord[];
  variant: RankVariant;
  onSelectUnit: (name: string) => void;
  onSelectEquip: (name: string, slot: "weapon" | "item") => void;
  onSelectWarlord: (name: string) => void;
}

type MetricKey =
  | "ppn"
  | "pontaPoint"
  | "winRate"
  | "breakthrough"
  | "breakthroughRate";

interface MetricOption {
  key: MetricKey;
  label: string;
  description: string;
}

const METRIC_OPTIONS: MetricOption[] = [
  {
    key: "ppn",
    label: "PPN",
    description:
      "PontaPoint ＋ 抜き率。勝敗と枚抜きを合わせた総合力の指標です。",
  },
  {
    key: "pontaPoint",
    label: "PontaPoint",
    description:
      "(出兵勝 + 1.4×守備勝) ÷ 戦闘数。守備勝ちを1.4勝として評価します。",
  },
  {
    key: "winRate",
    label: "勝率",
    description:
      "(出兵勝 + 守備勝) ÷ 戦闘数。撤退・引分・不明は分母から除きます。",
  },
  {
    key: "breakthrough",
    label: "抜き数",
    description:
      "1×(1枚抜き) + 2×(2枚抜き) + …で求める、出兵側の突破数です。",
  },
  {
    key: "breakthroughRate",
    label: "抜き率",
    description:
      "抜き数 ÷ 出兵数。同一使用者・同一戦闘時刻を1出兵として数えます。",
  },
];

const MIN_USE_OPTIONS = ASSET_RANKING_MIN_COUNT_OPTIONS;
const SUMMARY_TOP_N = 3;

/** 初期表示では最低使用回数を10回以上にする。 */
const DEFAULT_MIN_USES = DEFAULT_RANKING_MIN_COUNT;

/** ランキングを開いたときに選択する集計期間。 */
const DEFAULT_PERIOD_KEY = DEFAULT_RANKING_PERIOD_KEY;

const VARIANT_COPY: Record<
  RankVariant,
  {
    title: string;
    noun: string;
    description: string;
    searchPlaceholder: string;
  }
> = {
  unit: {
    title: "兵種ランキング",
    noun: "兵種",
    description:
      "兵種ごとのPPN・PontaPoint・勝率・抜き数・抜き率を集計します。",
    searchPlaceholder: "兵種名で絞り込み",
  },
  weapon: {
    title: "武器ランキング",
    noun: "武器",
    description:
      "武将の持つ武器ごとのPPN・PontaPoint・勝率・抜き数・抜き率を集計します。",
    searchPlaceholder: "武器名で絞り込み",
  },
  item: {
    title: "品物ランキング",
    noun: "品物",
    description:
      "武将の持つ品物ごとのPPN・PontaPoint・勝率・抜き数・抜き率を集計します。",
    searchPlaceholder: "品物名で絞り込み",
  },
};

function metricValue(row: AssetMetricStat, metric: MetricKey): number {
  return row[metric];
}

function formatPontaPoint(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function metricLabel(row: AssetMetricStat, metric: MetricKey): string {
  switch (metric) {
    case "ppn":
      return row.ppn.toFixed(3);
    case "pontaPoint":
      return formatPontaPoint(row.pontaPoint);
    case "winRate":
      return formatWinRate(row.winRate, row.battles);
    case "breakthrough":
      return row.breakthrough.toLocaleString("ja-JP");
    case "breakthroughRate":
      return row.sorties > 0 ? row.breakthroughRate.toFixed(3) : "—";
  }
}

function formatSweepCounts(sweepCounts: number[]): string {
  const labels: string[] = [];
  for (let count = 0; count < sweepCounts.length; count++) {
    const sorties = sweepCounts[count] ?? 0;
    if (sorties > 0) {
      labels.push(
        `${count}枚抜き ${sorties.toLocaleString("ja-JP")}`
      );
    }
  }
  return labels.length > 0 ? labels.join(" ／ ") : "抜きなし";
}

function sortByMetric(
  rows: AssetMetricStat[],
  metric: MetricKey
): AssetMetricStat[] {
  return [...rows].sort((a, b) => {
    const valueDifference = metricValue(b, metric) - metricValue(a, metric);
    if (valueDifference !== 0) return valueDifference;
    if (metric === "breakthrough" || metric === "breakthroughRate") {
      return b.sorties - a.sorties || b.uses - a.uses;
    }
    return b.battles - a.battles || b.uses - a.uses;
  });
}

function MetricRankingRow({
  row,
  rank,
  metric,
  maxValue,
  compact = false,
  onSelectAsset,
  onSelectWarlord,
}: {
  row: AssetMetricStat;
  rank: number;
  metric: MetricKey;
  maxValue: number;
  compact?: boolean;
  onSelectAsset: (name: string) => void;
  onSelectWarlord: (name: string) => void;
}) {
  const value = metricValue(row, metric);
  const label = metricLabel(row, metric);
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <li className="swi-row">
      <span className="swi-rank">{rank}</span>
      <div className="swi-main">
        <div className="swi-head">
          <button
            type="button"
            className="swi-name link-like"
            onClick={() => onSelectAsset(row.name)}
            title={`${row.name} の詳細を見る`}
          >
            {row.name}
          </button>
          <span className="swi-value">{label}</span>
        </div>
        <span
          className="swi-bar"
          role="progressbar"
          aria-valuenow={Math.round(percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${row.name} ${label}`}
        >
          <span
            className="swi-bar-fill"
            style={{ width: `${percentage}%` }}
          />
        </span>
        <div className="swi-meta muted">
          {metric === "ppn" ? (
            <span className="rank-side-active">
              PontaPoint {formatPontaPoint(row.pontaPoint)} ＋ 抜き率{" "}
              {row.breakthroughRate.toFixed(3)}
            </span>
          ) : metric === "breakthrough" ? (
            <span className="rank-side-active">
              {formatSweepCounts(row.sweepCounts)}
            </span>
          ) : metric === "breakthroughRate" ? (
            <span className="rank-side-active">
              抜き数 {row.breakthrough.toLocaleString("ja-JP")} ／ 出兵{" "}
              {row.sorties.toLocaleString("ja-JP")}
            </span>
          ) : (
            <span className="rank-side-active">
              出兵 {row.attackWins.toLocaleString("ja-JP")}勝 ／ 守備{" "}
              {row.defenseWins.toLocaleString("ja-JP")}勝 ／ 戦闘{" "}
              {row.battles.toLocaleString("ja-JP")}
            </span>
          )}
          <span>
            使用 {row.uses.toLocaleString("ja-JP")}回
          </span>
          {!compact && row.topUsers.length > 0 && (
            <span className="rank-users">
              主な使用:{" "}
              {row.topUsers.map((user) => (
                <button
                  key={user.name}
                  type="button"
                  className="link-like"
                  onClick={() => onSelectWarlord(user.name)}
                  title={`${user.name} の戦績を見る`}
                >
                  {user.name}
                  <span className="muted">
                    ×{user.count.toLocaleString("ja-JP")}
                  </span>
                </button>
              ))}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function RankingTab({
  log,
  variant,
  onSelectUnit,
  onSelectEquip,
  onSelectWarlord,
}: Props) {
  const copy = VARIANT_COPY[variant];
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [keyword, setKeyword] = useState("");
  const [minUses, setMinUses] = useState(DEFAULT_MIN_USES);
  const [unitType, setUnitType] = useState("");
  const [showFilter, setShowFilter] = useState(DEFAULT_RANKING_FILTERS_OPEN);
  const [periodKey, setPeriodKey] = useState<string>(DEFAULT_PERIOD_KEY);

  const periods = useMemo(() => rankingPeriods(log), [log]);
  const range = useMemo(
    () => periods.find((period) => period.key === periodKey),
    [periodKey, periods]
  );
  const rows = useMemo(
    () => assetMetricRanking(log, variant, range),
    [log, range, variant]
  );

  // 兵種ランキングで選べる兵種タイプ。
  const unitTypeOptions = useMemo(
    () =>
      variant === "unit"
        ? Array.from(
            new Set(
              rows
                .map((row) => row.branch?.trim())
                .filter((value): value is string => !!value)
            )
          ).sort((a, b) => a.localeCompare(b, "ja"))
        : [],
    [rows, variant]
  );

  // 一覧・詳細で共有する名前・最低使用回数・兵種タイプフィルター。
  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim();
    return rows.filter(
      (row) =>
        row.uses >= minUses &&
        (variant !== "unit" || !unitType || row.branch === unitType) &&
        (!normalizedKeyword || row.name.includes(normalizedKeyword))
    );
  }, [keyword, minUses, rows, unitType, variant]);

  const summaries = useMemo(
    () =>
      METRIC_OPTIONS.map((option) => ({
        option,
        rows: sortByMetric(filteredRows, option.key).slice(0, SUMMARY_TOP_N),
      })),
    [filteredRows]
  );

  const detailRows = useMemo(() => {
    if (!activeMetric) return [];
    return sortByMetric(filteredRows, activeMetric);
  }, [activeMetric, filteredRows]);

  const activeOption = activeMetric
    ? METRIC_OPTIONS.find((option) => option.key === activeMetric)
    : undefined;
  const detailMaxValue =
    detailRows.reduce(
      (max, row) =>
        Math.max(max, activeMetric ? metricValue(row, activeMetric) : 0),
      0
    ) || 1;
  const hasFilter =
    keyword.trim() !== "" ||
    minUses !== 1 ||
    (variant === "unit" && unitType !== "");

  const openDetail = useCallback((metric: MetricKey) => {
    setActiveMetric(metric);
    window.scrollTo(0, 0);
  }, []);

  const backToSummary = useCallback(() => {
    setActiveMetric(null);
    window.scrollTo(0, 0);
  }, []);

  const clearFilters = () => {
    setKeyword("");
    setMinUses(1);
    setUnitType("");
  };

  const openAssetDetail = (name: string) => {
    if (variant === "unit") onSelectUnit(name);
    else onSelectEquip(name, variant);
  };

  return (
    <section className="panel ranking-panel">
      <h2>{copy.title}</h2>
      <p className="metric-note muted">{copy.description}</p>

      <div className="tmx-periods" role="tablist" aria-label="集計期間">
        {periods.map((period) => (
          <button
            key={period.key}
            type="button"
            role="tab"
            aria-selected={periodKey === period.key}
            className={
              "tmx-period" + (periodKey === period.key ? " active" : "")
            }
            onClick={() => setPeriodKey(period.key)}
          >
            {period.label}
          </button>
        ))}
      </div>

      <div className="search-row">
        <SearchBox
          value={keyword}
          onChange={setKeyword}
          placeholder={copy.searchPlaceholder}
        />
        <button
          type="button"
          className={
            "btn filter-toggle" +
            (showFilter || hasFilter ? " active" : "")
          }
          onClick={() => setShowFilter((visible) => !visible)}
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
          {activeMetric && (
            <label className="filter">
              <span>指標</span>
              <select
                className="select"
                value={activeMetric}
                onChange={(event) =>
                  setActiveMetric(event.target.value as MetricKey)
                }
              >
                {METRIC_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="filter">
            <span>最低使用回数</span>
            <select
              className="select"
              value={minUses}
              onChange={(event) => setMinUses(Number(event.target.value))}
            >
              {MIN_USE_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}回以上
                </option>
              ))}
            </select>
          </label>
          {variant === "unit" && (
            <label className="filter">
              <span>兵種タイプ</span>
              <select
                className="select"
                value={unitType}
                onChange={(event) => setUnitType(event.target.value)}
              >
                <option value="">すべて</option>
                {unitTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {activeMetric === null ? (
        <div className="ranking-metric-grid">
          {summaries.map(({ option, rows: summaryRows }) => {
            const maxValue =
              summaryRows.reduce(
                (max, row) =>
                  Math.max(max, metricValue(row, option.key)),
                0
              ) || 1;
            return (
              <div className="metric-section" key={option.key}>
                <div className="metric-section-head">
                  <h3>{option.label}</h3>
                  <button
                    type="button"
                    className="link-like"
                    onClick={() => openDetail(option.key)}
                  >
                    詳細を見る →
                  </button>
                </div>
                <details className="metric-description">
                  <summary>算出方法</summary>
                  <p>{option.description}</p>
                </details>
                {summaryRows.length === 0 ? (
                  <p className="metric-section-empty muted">
                    集計対象の{copy.noun}がありません。
                  </p>
                ) : (
                  <ol className="swi-list">
                    {summaryRows.map((row, index) => (
                      <MetricRankingRow
                        key={row.name}
                        row={row}
                        rank={index + 1}
                        metric={option.key}
                        maxValue={maxValue}
                        compact
                        onSelectAsset={openAssetDetail}
                        onSelectWarlord={onSelectWarlord}
                      />
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <nav className="metric-crumb" aria-label="パンくずリスト">
            <button
              type="button"
              className="link-like"
              onClick={backToSummary}
            >
              {copy.title}
            </button>
            <span className="metric-crumb-sep" aria-hidden="true">
              ›
            </span>
            <span className="metric-crumb-current">
              {activeOption?.label}
            </span>
          </nav>
          <p className="metric-section-desc muted">
            {activeOption?.description}
          </p>

          <p className="sr-only" role="status" aria-live="polite">
            該当 {detailRows.length.toLocaleString("ja-JP")}件
          </p>

          {detailRows.length === 0 ? (
            <div className="empty">
              <p className="empty-title">
                条件を満たす{copy.noun}がありません
              </p>
              <p className="empty-hint">
                集計期間、検索語、最低使用回数を見直してください。
              </p>
            </div>
          ) : (
            <ol className="swi-list">
              {detailRows.map((row, index) => (
                <MetricRankingRow
                  key={row.name}
                  row={row}
                  rank={index + 1}
                  metric={activeMetric}
                  maxValue={detailMaxValue}
                  onSelectAsset={openAssetDetail}
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
