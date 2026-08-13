"use client";

import { useState } from "react";
import { formatWinRate } from "@/lib/stats";
import { Section } from "@/components/detail/Section";
import type {
  OpponentUnitStat,
  UnitMatchupRanking as UnitMatchupRankingData,
  UsageTrendPoint,
  UserWinRate,
} from "@/lib/stats";

/* ---------- 相性の良い／苦手な敵兵種 ---------- */

function UnitRankRow({
  rank,
  stat,
  onSelectUnit,
}: {
  rank: number;
  stat: OpponentUnitStat;
  onSelectUnit: (name: string) => void;
}) {
  return (
    <li className="detail-rank-row">
      <span className="detail-rank-no">{rank}</span>
      <span className="detail-rank-name">
        <button
          type="button"
          className="link-like"
          onClick={() => onSelectUnit(stat.unit)}
          title={`${stat.unit} の戦績を見る`}
        >
          {stat.unit}
        </button>
      </span>
      <span className="detail-rank-rate">
        {formatWinRate(stat.winRate, stat.decided)}
      </span>
      <span className="detail-rank-record">
        {stat.wins.toLocaleString("ja-JP")}勝{stat.losses.toLocaleString("ja-JP")}敗
      </span>
    </li>
  );
}

export function UnitMatchupRanking({
  ranking,
  onSelectUnit,
}: {
  ranking: UnitMatchupRankingData;
  onSelectUnit: (name: string) => void;
}) {
  if (ranking.best.length === 0) return null;
  return (
    <Section title="敵兵種との相性" mobileCollapsed>
      <div className="detail-rank-cols">
        <div className="detail-rank-col">
          <h4 className="detail-rank-head detail-rank-head--good">
            相性の良い敵兵種
          </h4>
          <ol className="detail-rank-list">
            {ranking.best.map((s, i) => (
              <UnitRankRow
                key={s.unit}
                rank={i + 1}
                stat={s}
                onSelectUnit={onSelectUnit}
              />
            ))}
          </ol>
        </div>
        {ranking.worst.length > 0 && (
          <div className="detail-rank-col">
            <h4 className="detail-rank-head detail-rank-head--bad">
              苦手な敵兵種
            </h4>
            <ol className="detail-rank-list">
              {ranking.worst.map((s, i) => (
                <UnitRankRow
                  key={s.unit}
                  rank={i + 1}
                  stat={s}
                  onSelectUnit={onSelectUnit}
                />
              ))}
            </ol>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ---------- 武将別の勝率比較 ---------- */

export function UserWinRateList({
  users,
  onSelectWarlord,
}: {
  users: UserWinRate[];
  onSelectWarlord: (name: string) => void;
}) {
  if (users.length === 0) return null;
  const top = users.slice(0, 5);
  return (
    <Section title="武将別の勝率" mobileCollapsed>
      <ul className="user-winrate-list">
        {top.map((u) => (
          <li key={u.name} className="user-winrate-row">
            <div className="user-winrate-head">
              <button
                type="button"
                className="user-winrate-name link-like"
                onClick={() => onSelectWarlord(u.name)}
                title={`${u.name} の戦績を見る`}
              >
                {u.name}
              </button>
              <span className="user-winrate-meta">
                <span className="user-winrate-rate">
                  {formatWinRate(u.winRate, u.decided)}
                </span>
                <span className="muted">
                  {u.wins}勝{u.losses}敗（{u.battles}戦）
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- 時期別の使用率・勝敗数の推移 ---------- */

type TrendMetric = "rate" | "wins" | "losses";

const TREND_METRICS: { key: TrendMetric; label: string; color: string }[] = [
  { key: "rate", label: "使用率", color: "var(--chart-primary)" },
  { key: "wins", label: "勝利数", color: "var(--chart-win)" },
  { key: "losses", label: "敗北数", color: "var(--chart-loss)" },
];

function trendValue(point: UsageTrendPoint, metric: TrendMetric): number {
  if (metric === "rate") return point.rate * 100;
  return metric === "wins" ? point.wins : point.losses;
}

function formatTrendValue(value: number, metric: TrendMetric): string {
  if (metric === "rate") {
    return `${value.toLocaleString("ja-JP", {
      maximumFractionDigits: 1,
    })}%`;
  }
  return `${value.toLocaleString("ja-JP")}戦`;
}

/** 折れ線を見なくても期間・始点・終点・最大値を把握できる文章要約。 */
export function describeUsageTrend(
  points: UsageTrendPoint[],
  metric: TrendMetric
): string {
  const metricLabel =
    TREND_METRICS.find((candidate) => candidate.key === metric)?.label ??
    "使用率";
  if (points.length === 0) return `${metricLabel}の年別推移。データなし`;

  const first = points[0];
  const last = points[points.length - 1];
  const peak = points.reduce((best, point) =>
    trendValue(point, metric) > trendValue(best, metric) ? point : best
  );

  return `${metricLabel}の年別推移。${first.year}年は${formatTrendValue(
    trendValue(first, metric),
    metric
  )}、${last.year}年は${formatTrendValue(
    trendValue(last, metric),
    metric
  )}。最大は${peak.year}年の${formatTrendValue(
    trendValue(peak, metric),
    metric
  )}`;
}

/** 年別の推移を 1 本の折れ線で描く（Y 軸は指標に応じて % か戦闘数）。 */
function TrendLineChart({
  points,
  metric,
  color,
}: {
  points: UsageTrendPoint[];
  metric: TrendMetric;
  color: string;
}) {
  const W = 640;
  const H = 220;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const years = points.map((p) => p.year);
  const n = years.length;
  const xAt = (i: number) =>
    padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const isRate = metric === "rate";
  const valueOf = (point: UsageTrendPoint) => trendValue(point, metric);
  const rawMax = Math.max(0, ...points.map(valueOf));
  const niceMax = Math.max(4, Math.ceil(rawMax / 4) * 4);
  const yAt = (v: number) => padT + (1 - v / niceMax) * plotH;
  const linePts = points
    .map((p, i) => `${xAt(i)},${yAt(valueOf(p))}`)
    .join(" ");
  return (
    <div className="home-line-wrap">
      <svg
        className="home-linechart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={describeUsageTrend(points, metric)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const v = niceMax * g;
          return (
            <g key={g}>
              <line
                className="home-line-grid"
                x1={padL}
                y1={yAt(v)}
                x2={W - padR}
                y2={yAt(v)}
              />
              <text className="home-line-ytick" x={padL - 4} y={yAt(v) + 3}>
                {isRate ? `${Math.round(v)}%` : Math.round(v)}
              </text>
            </g>
          );
        })}
        {years.map((yr, i) =>
          yr % 10 === 0 ? (
            <text
              key={yr}
              className="home-line-xtick"
              x={xAt(i)}
              y={H - 6}
              textAnchor="middle"
            >
              {yr}
            </text>
          ) : null
        )}
        <polyline
          className="home-line-path"
          points={linePts}
          style={{ stroke: color }}
        />
      </svg>
    </div>
  );
}

export function UsageTrend({ points }: { points: UsageTrendPoint[] }) {
  // 使用実績が 1 件も無い、または期間が 1 点しか無い場合は推移にならないため非表示。
  const meaningful = points.filter((p) => p.unitBattles > 0);
  const [metric, setMetric] = useState<TrendMetric>("rate");
  if (meaningful.length === 0 || points.length < 2) return null;
  const active =
    TREND_METRICS.find((m) => m.key === metric) ?? TREND_METRICS[0];
  const note =
    metric === "rate"
      ? "各年の全戦闘のうち、この兵種が登場した割合。"
      : metric === "wins"
      ? "各年にこの兵種が挙げた勝利数（左右両陣営が使った戦闘は各視点で加算）。"
      : "各年にこの兵種が喫した敗北数（左右両陣営が使った戦闘は各視点で加算）。";
  return (
    <Section title="使用率・勝敗数の推移（年別）" mobileCollapsed>
      <div className="trend-controls">
        <label className="trend-metric-label">
          表示
          <select
            className="select trend-metric-select"
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendMetric)}
          >
            {TREND_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span className="trend-legend">
          <span
            className="trend-legend-dot"
            style={{ background: active.color }}
          />
          {active.label}
        </span>
      </div>
      <p className="trend-note muted">{note}</p>
      <TrendLineChart points={points} metric={metric} color={active.color} />
    </Section>
  );
}
