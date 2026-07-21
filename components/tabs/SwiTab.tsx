"use client";

import { useMemo, useState } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import {
  warlordRanking,
  rankMetricValue,
  rankingPeriods,
  RANKING_LAST10_KEY,
  type RankMetric,
} from "@/lib/stats";

interface Props {
  log: BattleRecord[];
  db?: WarlordMap;
  onSelectWarlord: (name: string) => void;
}

/** 最低出兵数の選択肢。ノイズを除くためのしきい値（指標側の出撃数に適用）。 */
const MIN_SORTIE_OPTIONS = [1, 5, 10, 20, 30];

const METRIC_OPTIONS: {
  key: RankMetric;
  label: string;
  kind: "count" | "ratio" | "percent";
}[] = [
  { key: "attackWinRate", label: "攻撃勝率", kind: "percent" },
  { key: "defenseWinRate", label: "守備勝率", kind: "percent" },
  { key: "avgBreakthrough", label: "撃破効率", kind: "ratio" },
  { key: "defenseEfficiency", label: "守備効率", kind: "ratio" },
  { key: "assists", label: "アシスト数", kind: "count" },
];

export function SwiTab({ log, db, onSelectWarlord }: Props) {
  const [metric, setMetric] = useState<RankMetric>("attackWinRate");
  const [minSorties, setMinSorties] = useState(1);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [periodKey, setPeriodKey] = useState<string>(RANKING_LAST10_KEY);

  // 集計期間のプリセット（先頭＝過去10年間、以降はメタ分析と同じ絶対年バケット）。
  const periods = useMemo(() => rankingPeriods(log), [log]);
  const range = useMemo(
    () => periods.find((p) => p.key === periodKey) ?? null,
    [periods, periodKey]
  );

  const ranking = useMemo(
    () => warlordRanking(log, db, range ?? undefined),
    [log, db, range]
  );

  const metricKind =
    METRIC_OPTIONS.find((m) => m.key === metric)?.kind ?? "count";
  const metricLabel =
    METRIC_OPTIONS.find((m) => m.key === metric)?.label ?? "";
  const isDefenseMetric =
    metric === "defenseEfficiency" || metric === "defenseWinRate";

  // 兵科の選択肢（ランキング対象から収集）。
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

  // 絞り込み・並べ替えを適用した表示用リスト。
  const view = useMemo(() => {
    const q = query.trim();
    const activeSorties = (s: (typeof ranking)[number]): number => {
      if (metric === "attackWinRate") return s.attackRounds;
      if (metric === "defenseWinRate") return s.defenseRounds;
      if (metric === "defenseEfficiency") return s.defenseSorties;
      if (metric === "assists") return s.attackSorties + s.defenseSorties;
      return s.attackSorties;
    };
    const filtered = ranking.filter(
      (r) =>
        activeSorties(r) >= minSorties &&
        (branch ? r.branch === branch : true) &&
        (q ? r.name.includes(q) : true)
    );
    return [...filtered].sort((a, b) => {
      const va = rankMetricValue(a, metric);
      const vb = rankMetricValue(b, metric);
      if (vb !== va) return vb - va;
      // 同値はその側の出撃数で安定させる。
      return activeSorties(b) - activeSorties(a);
    });
  }, [ranking, query, branch, minSorties, metric]);

  // バー幅の基準となる最大値（表示対象の最大・ループ外で計算）。
  const maxValue =
    view.reduce((m, r) => Math.max(m, rankMetricValue(r, metric)), 0) || 1;

  const formatValue = (v: number) => {
    if (metricKind === "percent") return `${(v * 100).toFixed(1)}%`;
    if (metricKind === "ratio") return `${v.toFixed(2)}枚`;
    return v.toLocaleString("ja-JP");
  };

  // 検索ボックスとは別にトグルするドロップダウン系の絞り込み。
  const hasDropdownFilter = !!branch;
  const hasFilter = !!(query || branch);
  const clearFilters = () => {
    setQuery("");
    setBranch("");
  };

  return (
    <section className="panel">
      <h2>武将ランキング</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {metric === "attackWinRate"
          ? "攻撃勝率は、攻撃側として参加した戦目のうち勝った割合です。"
          : metric === "defenseWinRate"
            ? "守備勝率は、守備側として参加した戦目のうち勝った割合です。"
            : metric === "avgBreakthrough"
              ? "撃破効率は、1出兵あたり平均で何枚抜けるかを示す指標です。"
              : metric === "defenseEfficiency"
                ? "守備効率は、1守備あたり平均で何枚守り切れるかを示す指標です。"
                : "アシスト数は、削った相手が40分以内に倒された回数です（攻守どちらでも加算）。"}
      </p>

      <details className="swi-formula">
        <summary>{metricLabel}の詳細</summary>
        <p className="muted">
          {metric === "attackWinRate"
            ? "攻撃勝率 = 攻撃側として勝った戦目数 ÷ 攻撃側として参加した決着戦目数。撤退を除いた全攻撃戦目が母数です。"
            : metric === "defenseWinRate"
              ? "守備勝率 = 守備側として勝った戦目数 ÷ 守備側として参加した決着戦目数。撤退を除いた全守備戦目が母数です。"
              : metric === "avgBreakthrough"
                ? "撃破効率 = 攻撃勝利数 ÷ 攻撃出撃数。値が 1.00 なら、1出兵で平均1枚撃破している状態です。"
                : metric === "defenseEfficiency"
                  ? "守備効率 = 守備勝利数 ÷ 守備出撃数。値が 1.00 なら、1守備で平均1枚守り切っている状態です。"
                  : "A が B を削った時刻 T の後 40 分以内に、別イベントで B が倒されると A に 1 アシストが付きます。"}
        </p>
      </details>

      <div className="tmx-periods" role="tablist" aria-label="集計期間">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={periodKey === p.key}
            className={"tmx-period" + (periodKey === p.key ? " active" : "")}
            onClick={() => setPeriodKey(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

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
            <span>指標</span>
            <select
              className="select"
              value={metric}
              onChange={(e) => setMetric(e.target.value as RankMetric)}
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>
              {metric === "attackWinRate"
                ? "最低出兵数"
                : metric === "defenseWinRate"
                  ? "最低守備数"
                  : isDefenseMetric
                    ? "最低守備数"
                    : "最低出兵数"}
            </span>
            <select
              className="select"
              value={minSorties}
              onChange={(e) => setMinSorties(Number(e.target.value))}
            >
              {MIN_SORTIE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}回以上
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>兵科</span>
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
        該当 {view.length.toLocaleString("ja-JP")}件
      </p>

      {view.length === 0 ? (
        <div className="empty">
          <p className="empty-title">条件を満たす武将がいません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を登録すると、出撃データからランキングを算出します。
            すでに登録済みの場合は、指標・検索語・兵科・最低出兵数の条件を見直してください。
          </p>
        </div>
      ) : (
        <ol className="swi-list">
          {view.map((r, i) => {
            const value = rankMetricValue(r, metric);
            return (
              <li key={r.name} className="swi-row">
                <span className="swi-rank">{i + 1}</span>
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
                    <span className="swi-value">{formatValue(value)}</span>
                  </div>
                  <span
                    className="swi-bar"
                    role="progressbar"
                    aria-valuenow={Math.round((value / maxValue) * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${r.name} の${metricLabel} ${formatValue(
                      value
                    )}`}
                  >
                    <span
                      className="swi-bar-fill"
                      style={{ width: `${(value / maxValue) * 100}%` }}
                    />
                  </span>
                  <div className="swi-meta muted">
                    {metric === "attackWinRate" ? (
                      <span className="rank-side-active">
                        攻撃 {r.attackWinRounds.toLocaleString("ja-JP")}勝 ／{" "}
                        {(r.attackRounds - r.attackWinRounds).toLocaleString("ja-JP")}敗
                      </span>
                    ) : metric === "defenseWinRate" ? (
                      <span className="rank-side-active">
                        守備 {r.defenseWinRounds.toLocaleString("ja-JP")}勝 ／{" "}
                        {(r.defenseRounds - r.defenseWinRounds).toLocaleString("ja-JP")}敗
                      </span>
                    ) : metric === "avgBreakthrough" ? (
                      <span className="rank-side-active">
                        攻撃 {r.attackWinRounds.toLocaleString("ja-JP")}勝 ／{" "}
                        {r.attackRounds.toLocaleString("ja-JP")}戦目
                      </span>
                    ) : metric === "defenseEfficiency" ? (
                      <span className="rank-side-active">
                        守備 {r.defenseWinRounds.toLocaleString("ja-JP")}勝 ／{" "}
                        {r.defenseRounds.toLocaleString("ja-JP")}戦目
                      </span>
                    ) : (
                      <span className="rank-side-active">
                        アシスト {r.assists.toLocaleString("ja-JP")}（40分以内追撃）
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
