"use client";

import { PeriodSelector, useRankingPeriod } from "@/components/PeriodSelector";
import { useCallback, useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import {
  assetMetricRanking,
  factionsInYearRange,
  formatWinRate,
  type AssetMetricStat,
} from "@/lib/stats";
import {
  ASSET_RANKING_MIN_COUNT_OPTIONS,
  DEFAULT_RANKING_FILTERS_OPEN,
  DEFAULT_RANKING_MIN_COUNT,
  DEFAULT_RANKING_PERIOD_KEY,
  RANK_METRIC_DESCRIPTIONS,
} from "@/lib/rankingDefaults";
import { EmptyState } from "@/components/EmptyState";
import { FilterSelect } from "@/components/FilterSelect";
import { SearchBox } from "@/components/SearchBox";
import {
  FilterPanel,
  type ActiveFilter,
} from "@/components/FilterPanel";
import { PageHeader } from "@/components/layout/PageHeader";

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
    description: RANK_METRIC_DESCRIPTIONS.ppn,
  },
  {
    key: "pontaPoint",
    label: "PontaPoint",
    description: RANK_METRIC_DESCRIPTIONS.pontaPoint,
  },
  {
    key: "winRate",
    label: "勝率",
    description: RANK_METRIC_DESCRIPTIONS.winRate,
  },
  {
    key: "breakthrough",
    label: "抜き数",
    description: RANK_METRIC_DESCRIPTIONS.breakthrough,
  },
  {
    key: "breakthroughRate",
    label: "抜き率",
    description: RANK_METRIC_DESCRIPTIONS.breakthroughRate,
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
  compact = false,
  onSelectAsset,
  onSelectWarlord,
}: {
  row: AssetMetricStat;
  rank: number;
  metric: MetricKey;
  compact?: boolean;
  onSelectAsset: (name: string) => void;
  onSelectWarlord: (name: string) => void;
}) {
  const label = metricLabel(row, metric);

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
  const [faction, setFaction] = useState("");
  const [unitType, setUnitType] = useState("");
  const [showFilter, setShowFilter] = useState(DEFAULT_RANKING_FILTERS_OPEN);
  const {
    periods,
    periodKey,
    setPeriodKey,
    period: range,
  } = useRankingPeriod(log, DEFAULT_PERIOD_KEY);

  const availableFactions = useMemo(
    () => factionsInYearRange(log, range),
    [log, range]
  );
  const factionOptions = useMemo(() => {
    if (!faction || availableFactions.includes(faction)) {
      return availableFactions;
    }
    return [...availableFactions, faction].sort((a, b) =>
      a.localeCompare(b, "ja")
    );
  }, [availableFactions, faction]);
  const allRows = useMemo(
    () => assetMetricRanking(log, variant, range),
    [log, range, variant]
  );
  const rows = useMemo(
    () =>
      faction
        ? assetMetricRanking(log, variant, range, faction)
        : allRows,
    [allRows, faction, log, range, variant]
  );

  // 兵種ランキングで選べる兵種タイプ。
  const unitTypeOptions = useMemo(() => {
    if (variant !== "unit") return [];

    const options = Array.from(
      new Set(
        rows
          .map((row) => row.branch?.trim())
          .filter((value): value is string => !!value)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));

    if (!unitType || options.includes(unitType)) return options;
    return [...options, unitType].sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows, unitType, variant]);

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
  const hasFilter =
    keyword.trim() !== "" ||
    faction !== "" ||
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
    setFaction("");
    setMinUses(1);
    setUnitType("");
  };
  const activeFilters: ActiveFilter[] = [
    ...(faction
      ? [
          {
            key: "faction",
            label: "国",
            value: faction,
            onRemove: () => setFaction(""),
          },
        ]
      : []),
    ...(minUses !== 1
      ? [
          {
            key: "minimum-uses",
            label: "最低使用回数",
            value: `${minUses}回以上`,
            onRemove: () => setMinUses(1),
          },
        ]
      : []),
    ...(variant === "unit" && unitType
      ? [
          {
            key: "unit-type",
            label: "兵種タイプ",
            value: unitType,
            onRemove: () => setUnitType(""),
          },
        ]
      : []),
  ];

  const openAssetDetail = (name: string) => {
    if (variant === "unit") onSelectUnit(name);
    else onSelectEquip(name, variant);
  };

  return (
    <section className="panel ranking-panel">
      <PageHeader title={copy.title} description={copy.description} />

      <PeriodSelector
        periods={periods}
        value={periodKey}
        onChange={setPeriodKey}
      />

      <FilterPanel
        id={`${variant}-ranking-filters`}
        search={
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder={copy.searchPlaceholder}
          />
        }
        expanded={showFilter}
        onToggle={() => setShowFilter((visible) => !visible)}
        toggleActive={showFilter || hasFilter}
        hasActiveFilters={hasFilter}
        onClear={clearFilters}
        activeFilters={activeFilters}
        resultText={
          hasFilter
            ? `全${allRows.length.toLocaleString("ja-JP")}件中 ${filteredRows.length.toLocaleString("ja-JP")}件`
            : `全${allRows.length.toLocaleString("ja-JP")}件`
        }
      >
        <>
          {activeMetric && (
            <FilterSelect
              label="指標"
              value={activeMetric}
              options={METRIC_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              onChange={(value) => setActiveMetric(value as MetricKey)}
            />
          )}
          <FilterSelect
            label="国"
            value={faction}
            options={factionOptions}
            onChange={setFaction}
            emptyLabel="すべて"
          />
          <FilterSelect
            label="最低使用回数"
            value={String(minUses)}
            options={MIN_USE_OPTIONS.map((n) => ({ value: String(n), label: `${n}回以上` }))}
            onChange={(value) => setMinUses(Number(value))}
          />
          {variant === "unit" && (
            <FilterSelect
              label="兵種タイプ"
              value={unitType}
              options={unitTypeOptions}
              onChange={setUnitType}
              emptyLabel="すべて"
            />
          )}
        </>
      </FilterPanel>

      {activeMetric === null ? (
        <div className="ranking-metric-grid">
          {summaries.map(({ option, rows: summaryRows }) => {
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
          <h3 className="sr-only">{activeOption?.label}ランキング</h3>
          <p className="metric-section-desc muted">
            {activeOption?.description}
          </p>

          {detailRows.length === 0 ? (
            <EmptyState
              title={`条件を満たす${copy.noun}がありません`}
              hint="集計期間や絞り込み条件を見直してください。"
            />
          ) : (
            <ol className="swi-list">
              {detailRows.map((row, index) => (
                <MetricRankingRow
                  key={row.name}
                  row={row}
                  rank={index + 1}
                  metric={activeMetric}
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
