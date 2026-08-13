"use client";

import { useCallback, useMemo, useState } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { SearchBox } from "@/components/SearchBox";
import {
  FilterPanel,
  type ActiveFilter,
} from "@/components/FilterPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  breakthroughRanking,
  factionsInYearRange,
  formatWinRate,
  pontaPointRanking,
  rankingPeriods,
  warlordRanking,
} from "@/lib/stats";
import {
  DEFAULT_RANKING_FILTERS_OPEN,
  DEFAULT_RANKING_MIN_COUNT,
  DEFAULT_RANKING_PERIOD_KEY,
  RANK_METRIC_DESCRIPTIONS,
  WARLORD_RANKING_MIN_COUNT_OPTIONS,
} from "@/lib/rankingDefaults";

interface Props {
  log: BattleRecord[];
  db?: WarlordMap;
  onSelectWarlord: (name: string) => void;
}

/** 並べ替えの指標。 */
type SortKey =
  | "ppn"
  | "pontaPoint"
  | "winRate"
  | "breakthrough"
  | "breakthroughRate"
  | "attackWinRate"
  | "defenseWinRate"
  | "avgBreakthrough"
  | "defenseEfficiency"
  | "assists";

/** ノイズ除去用の最低戦闘数の選択肢。 */
const MIN_CONTACT_OPTIONS = WARLORD_RANKING_MIN_COUNT_OPTIONS;

/** サマリーで各指標を上位何位まで出すか。 */
const TOP_N = 3;

/** 初期表示では最低戦闘数を10回以上にする。 */
const DEFAULT_MIN_CONTACTS = DEFAULT_RANKING_MIN_COUNT;

/** 武将ランキングを開いたときに選択する集計期間。 */
const DEFAULT_PERIOD_KEY = DEFAULT_RANKING_PERIOD_KEY;

const SORT_OPTIONS: { key: SortKey; label: string; desc: string }[] = [
  {
    key: "ppn",
    label: "PPN",
    desc: RANK_METRIC_DESCRIPTIONS.ppn,
  },
  {
    key: "pontaPoint",
    label: "PontaPoint",
    desc: RANK_METRIC_DESCRIPTIONS.pontaPoint,
  },
  {
    key: "winRate",
    label: "勝率",
    desc: RANK_METRIC_DESCRIPTIONS.winRate,
  },
  {
    key: "breakthrough",
    label: "抜き数",
    desc: RANK_METRIC_DESCRIPTIONS.breakthrough,
  },
  {
    key: "breakthroughRate",
    label: "抜き率",
    desc: RANK_METRIC_DESCRIPTIONS.breakthroughRate,
  },
  {
    key: "attackWinRate",
    label: "出兵勝率",
    desc: "出兵側として参加した決着戦目のうち、勝利した戦目の割合。",
  },
  {
    key: "defenseWinRate",
    label: "守備勝率",
    desc: "守備側として参加した決着戦目のうち、勝利した戦目の割合。",
  },
  {
    key: "avgBreakthrough",
    label: "撃破効率",
    desc: "出兵側での勝利戦目数 ÷ 撤退を含まない出兵数。1出兵あたりの平均撃破数を示します。",
  },
  {
    key: "defenseEfficiency",
    label: "守備効率",
    desc: "守備側での勝利戦目数 ÷ 撤退を含まない守備回数。1守備あたりの平均撃破数を示します。",
  },
  {
    key: "assists",
    label: "アシスト数",
    desc: "削った相手が、その後40分以内に別の戦闘で倒された回数。",
  },
];

/** 武将 1 行分の指標（PPN・PontaPoint・抜き数・抜き率をまとめたもの）。 */
interface MetricRow {
  name: string;
  faction?: string;
  branch?: string;
  /** 武将タイプ（武特・知特・統特など）。 */
  warlordType?: string;
  /** PPN = PontaPoint + 抜き率。 */
  ppn: number;
  /** PontaPoint = (出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。 */
  pontaPoint: number;
  /** 出兵側として勝った戦闘数。 */
  attackWins: number;
  /** 守備側として勝った戦闘数。 */
  defenseWins: number;
  /** 戦闘数（撤退戦を除く＝勝＋負。PontaPoint・最低戦闘数の母数）。 */
  battles: number;
  /** 勝率 = (出兵勝 + 守備勝) ÷ 戦闘数（撤退戦を除く）。0〜1。 */
  winRate: number;
  /** 抜き数 = Σ n×(n枚抜き)。 */
  breakthrough: number;
  /** 抜き率 = 抜き数 ÷ 出兵数（sorties。出兵ごとに1、２戦目以降は数えない）。 */
  breakthroughRate: number;
  /** 出兵数（参考）。 */
  sorties: number;
  /** 枚抜きの内訳（index=n 枚抜き, value=回数）。抜き数の内訳表示に使う。 */
  sweepCounts: number[];
  /** 出兵側として参加した決着戦目の勝率。 */
  attackWinRate: number;
  /** 守備側として参加した決着戦目の勝率。 */
  defenseWinRate: number;
  /** 出兵側の勝利戦目数 ÷ 撤退を含まない出兵数。 */
  avgBreakthrough: number;
  /** 守備側の勝利戦目数 ÷ 撤退を含まない守備数。 */
  defenseEfficiency: number;
  /** 出兵側として参加した決着戦目数。 */
  attackRounds: number;
  /** 出兵側として勝った決着戦目数。 */
  attackWinRounds: number;
  /** 守備側として参加した決着戦目数。 */
  defenseRounds: number;
  /** 守備側として勝った決着戦目数。 */
  defenseWinRounds: number;
  /** 撤退を含まない出兵数。 */
  attackSorties: number;
  /** 撤退を含まない守備数。 */
  defenseSorties: number;
  /** アシスト数。 */
  assists: number;
}

/** 各集計結果を安全に結合するための空行を作る。 */
function createMetricRow(
  name: string,
  faction?: string,
  branch?: string
): MetricRow {
  return {
    name,
    faction,
    branch,
    ppn: 0,
    pontaPoint: 0,
    attackWins: 0,
    defenseWins: 0,
    battles: 0,
    winRate: 0,
    breakthrough: 0,
    breakthroughRate: 0,
    sorties: 0,
    sweepCounts: [],
    attackWinRate: 0,
    defenseWinRate: 0,
    avgBreakthrough: 0,
    defenseEfficiency: 0,
    attackRounds: 0,
    attackWinRounds: 0,
    defenseRounds: 0,
    defenseWinRounds: 0,
    attackSorties: 0,
    defenseSorties: 0,
    assists: 0,
  };
}

/** PontaPoint（(出兵勝+1.4×守備勝)÷戦闘数）をパーセント表示（小数点第2位）に整形する。 */
function formatPontaPoint(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/** 枚抜きの内訳を「0枚抜き 13 ／ 1枚抜き 5 ／ 2枚抜き 3」の形に整形する（回数0の枚数は省略）。
 *  0枚抜き＝出兵したが1戦目で負けて1枚も抜けなかった回。全枚数の合計＝出兵数になる。 */
function formatSweepCounts(sweepCounts: number[]): string {
  const parts: string[] = [];
  for (let n = 0; n < sweepCounts.length; n++) {
    const c = sweepCounts[n] ?? 0;
    if (c > 0) parts.push(`${n}枚抜き ${c.toLocaleString("ja-JP")}`);
  }
  return parts.length > 0 ? parts.join(" ／ ") : "抜きなし";
}

/** 指標 metric における行 r のバー用の数値。 */
function metricValue(r: MetricRow, metric: SortKey): number {
  return r[metric];
}

/** 指標 metric における行 r の表示用ラベル。 */
function metricLabel(r: MetricRow, metric: SortKey): string {
  switch (metric) {
    case "ppn":
      return r.battles > 0 || r.sorties > 0 ? r.ppn.toFixed(3) : "—";
    case "pontaPoint":
      return r.battles > 0 ? formatPontaPoint(r.pontaPoint) : "—";
    case "winRate":
      return formatWinRate(r.winRate, r.battles);
    case "breakthrough":
      return r.breakthrough.toLocaleString("ja-JP");
    case "breakthroughRate":
      return r.sorties > 0 ? r.breakthroughRate.toFixed(3) : "—";
    case "attackWinRate":
      return formatWinRate(r.attackWinRate, r.attackRounds);
    case "defenseWinRate":
      return formatWinRate(r.defenseWinRate, r.defenseRounds);
    case "avgBreakthrough":
      return r.attackSorties > 0 ? `${r.avgBreakthrough.toFixed(2)}枚` : "—";
    case "defenseEfficiency":
      return r.defenseSorties > 0
        ? `${r.defenseEfficiency.toFixed(2)}枚`
        : "—";
    case "assists":
      return r.assists.toLocaleString("ja-JP");
  }
}

/** 指標ごとの最低回数フィルターに使う母数。 */
function metricContactCount(r: MetricRow, metric: SortKey): number {
  switch (metric) {
    case "attackWinRate":
      return r.attackRounds;
    case "defenseWinRate":
      return r.defenseRounds;
    case "avgBreakthrough":
      return r.attackSorties;
    case "defenseEfficiency":
      return r.defenseSorties;
    case "assists":
      return r.attackSorties + r.defenseSorties;
    default:
      return r.battles;
  }
}

/** 詳細フィルターに表示する回数の名称。 */
function metricContactLabel(metric: SortKey): string {
  switch (metric) {
    case "attackWinRate":
    case "avgBreakthrough":
      return "最低出兵数";
    case "defenseWinRate":
    case "defenseEfficiency":
      return "最低守備数";
    default:
      return "最低戦闘数";
  }
}

/** 指標 metric で降順に並べ替えた新しい配列を返す。 */
function sortByMetric(rows: MetricRow[], metric: SortKey): MetricRow[] {
  return [...rows].sort((a, b) => {
    const valueDifference = metricValue(b, metric) - metricValue(a, metric);
    if (valueDifference !== 0) return valueDifference;
    return metricContactCount(b, metric) - metricContactCount(a, metric);
  });
}

/** ランキング 1 行（サマリー・詳細で共用）。 */
function MetricRowItem({
  r,
  rank,
  metric,
  onSelectWarlord,
}: {
  r: MetricRow;
  rank: number;
  metric: SortKey;
  onSelectWarlord: (name: string) => void;
}) {
  const label = metricLabel(r, metric);
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
        <div className="swi-meta muted">
          {metric === "ppn" ? (
            <span className="rank-side-active">
              PontaPoint {formatPontaPoint(r.pontaPoint)} ＋ 抜き率{" "}
              {r.breakthroughRate.toFixed(3)}
            </span>
          ) : metric === "breakthrough" ? (
            <span className="rank-side-active">
              {formatSweepCounts(r.sweepCounts)}
            </span>
          ) : metric === "breakthroughRate" ? (
            <span className="rank-side-active">
              抜き数 {r.breakthrough.toLocaleString("ja-JP")} ／ 出兵{" "}
              {r.sorties.toLocaleString("ja-JP")}
            </span>
          ) : metric === "attackWinRate" ? (
            <span className="rank-side-active">
              出兵 {r.attackWinRounds.toLocaleString("ja-JP")}勝 ／{" "}
              {(r.attackRounds - r.attackWinRounds).toLocaleString("ja-JP")}敗
            </span>
          ) : metric === "defenseWinRate" ? (
            <span className="rank-side-active">
              守備 {r.defenseWinRounds.toLocaleString("ja-JP")}勝 ／{" "}
              {(r.defenseRounds - r.defenseWinRounds).toLocaleString("ja-JP")}敗
            </span>
          ) : metric === "avgBreakthrough" ? (
            <span className="rank-side-active">
              出兵側勝利 {r.attackWinRounds.toLocaleString("ja-JP")} ／ 出兵{" "}
              {r.attackSorties.toLocaleString("ja-JP")}回
            </span>
          ) : metric === "defenseEfficiency" ? (
            <span className="rank-side-active">
              守備側勝利 {r.defenseWinRounds.toLocaleString("ja-JP")} ／ 守備{" "}
              {r.defenseSorties.toLocaleString("ja-JP")}回
            </span>
          ) : metric === "assists" ? (
            <span className="rank-side-active">
              アシスト {r.assists.toLocaleString("ja-JP")}（40分以内追撃）
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
 * 武将ランキング。武将ごとの総合指標・勝率・効率・アシストを表示する。
 *
 * PPN＝PontaPoint＋抜き率。PontaPoint＝勝率の分子で守備の1勝を1.4勝として評価した率。
 * 抜き数・抜き率は出兵側の枚抜き（突破）を集計したもの。いずれも「対象の期」で
 * フィルタ済みのログから算出する。
 */
export function MetricsTab({ log, db, onSelectWarlord }: Props) {
  // null = サマリー（各指標TOP3）、非null = その指標の詳細ランキング。
  const [activeMetric, setActiveMetric] = useState<SortKey | null>(null);
  const [minContacts, setMinContacts] = useState(DEFAULT_MIN_CONTACTS);
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState("");
  const [branch, setBranch] = useState("");
  const [warlordType, setWarlordType] = useState("");
  const [showFilter, setShowFilter] = useState(DEFAULT_RANKING_FILTERS_OPEN);
  const [periodKey, setPeriodKey] = useState<string>(DEFAULT_PERIOD_KEY);
  const periods = useMemo(() => rankingPeriods(log), [log]);
  const range = useMemo(
    () => periods.find((period) => period.key === periodKey),
    [periodKey, periods]
  );
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

  // PontaPoint・枚抜き・旧武将ランキングの各指標を武将ごとに統合する。
  const ranking = useMemo<MetricRow[]>(() => {
    const byName = new Map<string, MetricRow>();
    for (const p of pontaPointRanking(log, db, range, faction)) {
      const row = createMetricRow(p.name, p.faction, p.branch);
      row.pontaPoint = p.pontaPoint;
      row.attackWins = p.attackWins;
      row.defenseWins = p.defenseWins;
      row.battles = p.battles;
      byName.set(p.name, row);
    }
    for (const b of breakthroughRanking(log, db, range, faction)) {
      const row =
        byName.get(b.name) ?? createMetricRow(b.name, b.faction, b.branch);
      row.breakthrough = b.score;
      row.sorties = b.sorties;
      row.sweepCounts = b.sweepCounts;
      row.faction = row.faction ?? b.faction;
      row.branch = row.branch ?? b.branch;
      byName.set(b.name, row);
    }
    for (const oldRanking of warlordRanking(log, db, range, faction)) {
      const row =
        byName.get(oldRanking.name) ??
        createMetricRow(
          oldRanking.name,
          oldRanking.faction,
          oldRanking.branch
        );
      row.faction = row.faction ?? oldRanking.faction;
      row.branch = row.branch ?? oldRanking.branch;
      row.attackWinRate = oldRanking.attackWinRate;
      row.defenseWinRate = oldRanking.defenseWinRate;
      row.avgBreakthrough = oldRanking.avgBreakthrough;
      row.defenseEfficiency = oldRanking.defenseEfficiency;
      row.attackRounds = oldRanking.attackRounds;
      row.attackWinRounds = oldRanking.attackWinRounds;
      row.defenseRounds = oldRanking.defenseRounds;
      row.defenseWinRounds = oldRanking.defenseWinRounds;
      row.attackSorties = oldRanking.attackSorties;
      row.defenseSorties = oldRanking.defenseSorties;
      row.assists = oldRanking.assists;
      byName.set(oldRanking.name, row);
    }
    const rows = Array.from(byName.values());
    // 抜き率 = 抜き数 ÷ 出兵数（出兵数 0 は 0）。PPN = PontaPoint + 抜き率。
    for (const r of rows) {
      r.breakthroughRate = r.sorties > 0 ? r.breakthrough / r.sorties : 0;
      r.ppn = r.pontaPoint + r.breakthroughRate;
      r.winRate =
        r.battles > 0 ? (r.attackWins + r.defenseWins) / r.battles : 0;
      r.warlordType = db?.[r.name]?.type?.trim() || undefined;
    }
    return rows;
  }, [log, db, range, faction]);

  // 兵種の選択肢（集計対象から収集）。
  const branchOptions = useMemo(() => {
    const options = Array.from(
      new Set(
        ranking
          .map((r) => r.branch?.trim())
          .filter((v): v is string => !!v)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
    if (!branch || options.includes(branch)) return options;
    return [...options, branch].sort((a, b) => a.localeCompare(b, "ja"));
  }, [branch, ranking]);

  // 武将タイプの選択肢（集計対象から収集）。
  const warlordTypeOptions = useMemo(() => {
    const options = Array.from(
      new Set(
        ranking
          .map((row) => row.warlordType)
          .filter((value): value is string => !!value)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
    if (!warlordType || options.includes(warlordType)) return options;
    return [...options, warlordType].sort((a, b) =>
      a.localeCompare(b, "ja")
    );
  }, [ranking, warlordType]);

  // サマリー：共通フィルターを適用してから、指標ごとの上位 TOP_N を切り出す。
  const summaries = useMemo(
    () => {
      const q = query.trim();
      const filteredBySharedConditions = ranking.filter(
        (row) =>
          (branch ? row.branch === branch : true) &&
          (warlordType ? row.warlordType === warlordType : true) &&
          (q ? row.name.includes(q) : true)
      );
      return SORT_OPTIONS.map((opt) => {
        const eligibleRows = sortByMetric(
          filteredBySharedConditions.filter(
            (row) => metricContactCount(row, opt.key) >= minContacts
          ),
          opt.key
        );
        return {
          opt,
          totalCount: eligibleRows.length,
          rows: eligibleRows.slice(0, TOP_N),
        };
      });
    },
    [ranking, query, branch, warlordType, minContacts]
  );

  // 詳細：選択中の指標で絞り込み・並べ替えた全ランキング。
  const detailRows = useMemo(() => {
    if (!activeMetric) return [];
    const q = query.trim();
    const filtered = ranking.filter(
      (r) =>
        metricContactCount(r, activeMetric) >= minContacts &&
        (branch ? r.branch === branch : true) &&
        (warlordType ? r.warlordType === warlordType : true) &&
        (q ? r.name.includes(q) : true)
    );
    return sortByMetric(filtered, activeMetric);
  }, [ranking, activeMetric, query, branch, warlordType, minContacts]);

  const activeOption = activeMetric
    ? SORT_OPTIONS.find((o) => o.key === activeMetric)
    : undefined;
  const activeLabel = activeOption?.label ?? "";
  const activeDesc = activeOption?.desc ?? "";

  // 詳細ビューを開く（一覧で指定した絞り込みは引き継ぐ）。
  const openDetail = useCallback((metric: SortKey) => {
    setActiveMetric(metric);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  // サマリーへ戻る（絞り込み状態は維持する）。
  const backToSummary = useCallback(() => {
    setActiveMetric(null);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  // 検索ボックスとは別にトグルするドロップダウン系の絞り込み。
  const hasDropdownFilter = !!(
    faction ||
    branch ||
    warlordType ||
    minContacts !== 1
  );
  const hasFilter = !!(
    query ||
    faction ||
    branch ||
    warlordType ||
    minContacts !== 1
  );
  const clearFilters = () => {
    setQuery("");
    setFaction("");
    setBranch("");
    setWarlordType("");
    setMinContacts(1);
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
    ...(minContacts !== 1
      ? [
          {
            key: "minimum-contacts",
            label: activeMetric
              ? metricContactLabel(activeMetric)
              : "最低戦闘数",
            value: `${minContacts}回以上`,
            onRemove: () => setMinContacts(1),
          },
        ]
      : []),
    ...(branch
      ? [
          {
            key: "branch",
            label: "兵種タイプ",
            value: branch,
            onRemove: () => setBranch(""),
          },
        ]
      : []),
    ...(warlordType
      ? [
          {
            key: "warlord-type",
            label: "武将タイプ",
            value: warlordType,
            onRemove: () => setWarlordType(""),
          },
        ]
      : []),
  ];

  return (
    <section className="panel ranking-panel">
      <PageHeader
        title="武将ランキング"
        description="※初期設定では、各指標の集計対象回数が10回未満の武将を除外します。"
      />

      <div className="tmx-periods" role="group" aria-label="集計期間">
        {periods.map((period) => (
          <button
            key={period.key}
            type="button"
            aria-pressed={periodKey === period.key}
            className={
              "tmx-period" + (periodKey === period.key ? " active" : "")
            }
            onClick={() => setPeriodKey(period.key)}
          >
            {period.label}
          </button>
        ))}
      </div>

      <FilterPanel
        id="warlord-ranking-filters"
        search={
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="武将名で検索"
          />
        }
        expanded={showFilter}
        onToggle={() => setShowFilter((visible) => !visible)}
        toggleActive={showFilter || hasDropdownFilter}
        hasActiveFilters={hasFilter}
        onClear={clearFilters}
        activeFilters={activeFilters}
        resultText={
          activeMetric
            ? `該当 ${detailRows.length.toLocaleString("ja-JP")}名`
            : `${SORT_OPTIONS.length.toLocaleString("ja-JP")}指標`
        }
      >
        <>
          <label className="filter">
            <span>国</span>
            <select
              className="select"
              value={faction}
              onChange={(event) => setFaction(event.target.value)}
            >
              <option value="">すべて</option>
              {factionOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>
              {activeMetric
                ? metricContactLabel(activeMetric)
                : "最低戦闘数"}
            </span>
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
            <span>兵種タイプ</span>
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
          <label className="filter">
            <span>武将タイプ</span>
            <select
              className="select"
              value={warlordType}
              onChange={(e) => setWarlordType(e.target.value)}
            >
              <option value="">すべて</option>
              {warlordTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </>
      </FilterPanel>

      {activeMetric === null ? (
        // サマリー：指標ごとの上位 TOP3 を並べ、詳細へ誘導する。
        <div className="ranking-metric-grid">
          {summaries.map(({ opt, rows, totalCount }) => {
            return (
              <div className="metric-section" key={opt.key}>
                <div className="metric-section-head">
                  <h3>
                    {opt.label}
                    <span className="metric-section-count">
                      対象{totalCount.toLocaleString("ja-JP")}名
                    </span>
                  </h3>
                  <button
                    type="button"
                    className="link-like"
                    onClick={() => openDetail(opt.key)}
                  >
                    詳細を見る →
                  </button>
                </div>
                <details className="metric-description">
                  <summary>算出方法</summary>
                  <p>{opt.desc}</p>
                </details>
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
        // 詳細：パンくず＋絞り込み＋その指標の全ランキング。
        <>
          <nav className="metric-crumb" aria-label="パンくずリスト">
            <button
              type="button"
              className="link-like"
              onClick={backToSummary}
            >
              武将ランキング
            </button>
            <span className="metric-crumb-sep" aria-hidden="true">
              ›
            </span>
            <span className="metric-crumb-current">{activeLabel}</span>
          </nav>
          <h3 className="sr-only">{activeLabel}ランキング</h3>
          <p className="metric-section-desc muted">{activeDesc}</p>

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
