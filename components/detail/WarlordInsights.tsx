"use client";

import { useEffect, useRef, useState } from "react";
import {
  DAY_LABELS,
  formatWinRate,
  type BranchStat,
  type FactionStint,
  type HeatCell,
  type MatchupRanking as MatchupRankingData,
  type OpponentStat,
  type WinHeatmap,
  type YearlyWinRate,
} from "@/lib/stats";
import { getWarlordNote, setWarlordNote } from "@/lib/warlordNotes";
import { factionNameStyle, type FactionColorMap } from "@/lib/factionColors";
import type { Warlord } from "@/lib/types";
import { hasWarlordStats } from "@/lib/warlordStats";
import { Section } from "@/components/detail/Section";

/** 対戦相手名のリンクボタン（クリックでその武将ページへ）。 */
function OpponentName({
  name,
  onSelect,
}: {
  name: string;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      className="link-like"
      onClick={() => onSelect(name)}
      title={`${name} の戦績を見る`}
    >
      {name}
    </button>
  );
}

/* ---------- 相性ランキング ---------- */

function RankRow({
  rank,
  stat,
  colors,
  onSelectWarlord,
}: {
  rank: number;
  stat: OpponentStat;
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
}) {
  return (
    <li className="rank-row">
      <span className="rank-no">{rank}</span>
      <span className="rank-name">
        <OpponentName name={stat.name} onSelect={onSelectWarlord} />
        {stat.faction && (
          <span
            className="rank-faction"
            style={factionNameStyle(stat.faction, colors)}
          >
            {stat.faction}
          </span>
        )}
      </span>
      <span className="rank-rate">{formatWinRate(stat.winRate, stat.decided)}</span>
      <span className="rank-record">
        {stat.wins.toLocaleString("ja-JP")}勝{stat.losses.toLocaleString("ja-JP")}敗
      </span>
    </li>
  );
}

export function MatchupRanking({
  ranking,
  colors,
  onSelectWarlord,
}: {
  ranking: MatchupRankingData;
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
}) {
  if (ranking.best.length === 0) return null;
  return (
    <Section title="相性ランキング" mobileCollapsed>
      <div className="rank-cols">
        <div className="rank-col">
          <h4 className="rank-head rank-head--good">相性の良い相手</h4>
          <ol className="rank-list">
            {ranking.best.map((s, i) => (
              <RankRow
                key={s.name}
                rank={i + 1}
                stat={s}
                colors={colors}
                onSelectWarlord={onSelectWarlord}
              />
            ))}
          </ol>
        </div>
        {ranking.worst.length > 0 && (
          <div className="rank-col">
            <h4 className="rank-head rank-head--bad">苦手な相手</h4>
            <ol className="rank-list">
              {ranking.worst.map((s, i) => (
                <RankRow
                  key={s.name}
                  rank={i + 1}
                  stat={s}
                  colors={colors}
                  onSelectWarlord={onSelectWarlord}
                />
              ))}
            </ol>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ---------- 兵科別の勝率 ---------- */

export function BranchWinRates({ branches }: { branches: BranchStat[] }) {
  if (branches.length === 0) return null;
  return (
    <Section title="兵科別の勝率" mobileCollapsed>
      <ul className="branch-list">
        {branches.map((b) => {
          return (
            <li key={b.branch} className="branch-row">
              <span className="branch-name">{b.branch}</span>
              <span
                className="branch-bar"
                role="progressbar"
                aria-valuenow={b.decided > 0 ? Math.round(b.winRate * 100) : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${b.branch} の勝率 ${
                  b.decided > 0 ? Math.round(b.winRate * 100) : 0
                }%`}
              >
                <span
                  className="branch-bar-fill"
                  style={{ width: `${b.decided > 0 ? b.winRate * 100 : 0}%` }}
                />
              </span>
              <span className="branch-rate">
                {formatWinRate(b.winRate, b.decided)}
              </span>
              <span className="branch-record">
                {b.wins.toLocaleString("ja-JP")}勝{b.losses.toLocaleString("ja-JP")}敗
                <span className="muted">（{b.battles.toLocaleString("ja-JP")}戦）</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ---------- 時間帯・曜日別の勝率ヒートマップ ---------- */

/** セルの背景色を勝率で決める（GitHub 風の緑グラデーション）。 */
function heatStyle(cell: HeatCell): React.CSSProperties {
  if (cell.decided > 0) {
    const alpha = 0.18 + 0.82 * cell.winRate;
    return { background: `rgba(29, 158, 117, ${alpha.toFixed(3)})` };
  }
  if (cell.battles > 0) {
    // 戦闘はあるが勝敗未確定（撤退・引分のみ）
    return { background: "rgba(255, 255, 255, 0.06)" };
  }
  return {};
}

function heatTitle(
  day: string,
  startHour: string,
  cell: HeatCell
): string {
  const range = `${day} ${startHour}時台`;
  if (cell.battles === 0) return `${range}・戦闘なし`;
  return `${range}・${cell.wins.toLocaleString("ja-JP")}勝${cell.losses.toLocaleString(
    "ja-JP"
  )}敗（勝率 ${formatWinRate(
    cell.winRate,
    cell.decided
  )} / ${cell.battles.toLocaleString("ja-JP")}戦）`;
}

export function WinHeatmapSection({ heatmap }: { heatmap: WinHeatmap }) {
  if (heatmap.dated === 0) return null;
  return (
    <Section title="時間帯・曜日別の勝率" mobileCollapsed>
      <div className="heatmap-wrap">
        <div className="heatmap">
          <div className="heat-corner" />
          {heatmap.bucketLabels.map((label) => (
            <div key={label} className="heat-col-label">
              {label}
            </div>
          ))}
          {heatmap.cells.map((row, day) => (
            <div key={day} className="heat-row" role="row">
              <div className="heat-row-label">{DAY_LABELS[day]}</div>
              {row.map((cell, b) => (
                <div
                  key={b}
                  className="heat-cell"
                  style={heatStyle(cell)}
                  title={heatTitle(
                    DAY_LABELS[day],
                    heatmap.bucketLabels[b],
                    cell
                  )}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="heat-legend">
          <span className="muted">低</span>
          <span className="heat-legend-scale" />
          <span className="muted">高（勝率）</span>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 所属国の遍歴 ---------- */

function stintYears(s: FactionStint): string {
  if (s.startYear === 0 && s.endYear === 0) return "在籍年不明";
  if (s.startYear === s.endYear) return `${s.startYear}年`;
  return `${s.startYear}〜${s.endYear}年`;
}

export function FactionHistory({
  stints,
  colors,
}: {
  stints: FactionStint[];
  colors: FactionColorMap;
}) {
  if (stints.length === 0) return null;
  const returned = stints.filter((s) => s.returning);
  return (
    <Section title="所属国の遍歴" mobileCollapsed>
      <ol className="faction-timeline">
        {stints.map((s, i) => (
          <li key={`${s.faction}-${i}`} className="faction-stint">
            <span className="faction-dot" />
            <span className="faction-stint-body">
              <span
                className="faction-stint-name"
                style={factionNameStyle(s.faction, colors)}
              >
                {s.faction}
              </span>
              {s.returning && (
                <span className="faction-return-badge">出戻り</span>
              )}
              <span className="faction-stint-years">{stintYears(s)}</span>
              <span className="muted faction-stint-battles">
                {s.battles.toLocaleString("ja-JP")}戦
              </span>
            </span>
          </li>
        ))}
      </ol>
      {returned.length > 0 && (
        <p className="faction-return-note">
          ※「出戻り」は一度離れた国へ戻った在籍を表します。
        </p>
      )}
    </Section>
  );
}

/* ---------- 一言コメント ---------- */

export function WarlordComment({ name }: { name: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  // 武将が切り替わったら保存済みコメントを読み込む。
  useEffect(() => {
    setText(getWarlordNote(name));
    setSaved(false);
  }, [name]);

  const savedTimer = useRef<number | null>(null);
  const persist = (value: string) => {
    setWarlordNote(name, value);
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
  };
  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, []);

  return (
    <div className="detail-section">
      <h3 className="comment-head">
        一言コメント
        {saved && <span className="comment-saved">保存しました</span>}
      </h3>
      <textarea
        className="comment-box"
        value={text}
        placeholder="この武将についてのメモ（強さ・クセ・対策など）を自由に記録できます。"
        aria-label="一言コメント"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => persist(text)}
      />
    </div>
  );
}

/* ---------- 能力値（ランキング取り込み） ---------- */

/** 計略などの数値を表示用文字列にする（String() が整数・小数のどちらも適切に表記する）。 */
function formatStatValue(value: number): string {
  return String(value);
}

/**
 * ランキングから取り込んだ能力値（武力〜計略）と自己PRを表示する。
 * 能力値も自己PRも無ければ何も描画しない。
 */
export function AbilityStats({ warlord }: { warlord: Warlord | undefined }) {
  if (!warlord || !hasWarlordStats(warlord)) return null;
  const items: Array<{ label: string; value: number | undefined }> = [
    { label: "武力", value: warlord.power },
    { label: "知力", value: warlord.intelligence },
    { label: "統率力", value: warlord.leadership },
    { label: "政治力", value: warlord.politics },
    { label: "計略", value: warlord.strategy },
  ];
  const shown = items.filter((i) => i.value !== undefined);
  return (
    <div className="detail-section">
      <h3>能力値</h3>
      {shown.length > 0 && (
        <div className="ability-grid">
          {shown.map((i) => (
            <div key={i.label} className="ability-cell">
              <div className="ability-label">{i.label}</div>
              <div className="ability-value">
                {formatStatValue(i.value as number)}
              </div>
            </div>
          ))}
        </div>
      )}
      {warlord.selfPr && (
        <div className="ability-pr">
          <div className="ability-pr-label">自己PR</div>
          <p className="ability-pr-text">{warlord.selfPr}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- 勝率の推移（年別・管理者向け） ---------- */

/** 非戦期間（戦闘0が続く区間）をマスクする閾値（年）。 */
const WR_NON_BATTLE_MIN_YEARS = 4;

/** 折れ線の色（勝率＝青系）。 */
const WR_LINE_COLOR = "#3b82f6";

/**
 * 年別の勝率(%)推移を折れ線で描く（Y 軸 0〜100%、・50% 基準線つき）。
 * 勝敗が確定した年のみ点を打ち、4 年以上の非戦期間はマスクで分断する。
 */
export function WinRateTrend({ data }: { data: YearlyWinRate[] }) {
  const withData = data.filter((y) => y.battles > 0);
  if (withData.length === 0) return null;
  const minYear = withData[0].year;
  const maxYear = withData[withData.length - 1].year;
  const points = data.filter((y) => y.year >= minYear && y.year <= maxYear);
  const years = points.map((p) => p.year);
  const n = years.length;

  const W = 640;
  const H = 220;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (pct: number) => padT + (1 - pct / 100) * plotH;

  // 4 年以上戦闘のない区間を検出（マスク表示用）。
  const maskRanges: { fromIdx: number; toIdx: number }[] = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (points[i].battles === 0) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && i - start >= WR_NON_BATTLE_MIN_YEARS) {
        maskRanges.push({ fromIdx: start, toIdx: i - 1 });
      }
      start = -1;
    }
  }

  // 勝敗が確定した年のみ点を打ち、マスク区間で線を分断する。
  const dataPts = points
    .map((p, i) => ({
      i,
      pct: p.winRate * 100,
      decided: p.decided,
      year: p.year,
      wins: p.wins,
      losses: p.losses,
    }))
    .filter((p) => p.decided > 0);
  const segs: (typeof dataPts)[] = [];
  let cur: typeof dataPts = [];
  for (const pt of dataPts) {
    if (cur.length > 0) {
      const prev = cur[cur.length - 1];
      if (maskRanges.some((m) => m.fromIdx > prev.i && m.toIdx < pt.i)) {
        segs.push(cur);
        cur = [];
      }
    }
    cur.push(pt);
  }
  if (cur.length) segs.push(cur);

  return (
    <Section title="勝率の推移" mobileCollapsed>
      <p className="muted home-series-hint">
        年別の勝率（%）です。勝敗が確定した年のみ点で表し、点にカーソルを合わせると戦績が出ます。
      </p>
      <div className="home-line-wrap">
        <svg
          className="home-linechart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="年別の勝率推移グラフ"
        >
          {[0, 25, 50, 75, 100].map((pct) => (
            <g key={pct}>
              <line
                className={
                  pct === 50 ? "home-line-grid home-line-mid" : "home-line-grid"
                }
                x1={padL}
                y1={yAt(pct)}
                x2={W - padR}
                y2={yAt(pct)}
              />
              <text className="home-line-ytick" x={padL - 4} y={yAt(pct) + 3}>
                {pct}
              </text>
            </g>
          ))}
          {maskRanges.map((m, mi) => {
            const step = n <= 1 ? plotW : plotW / (n - 1);
            const x1 = Math.max(padL, xAt(m.fromIdx) - step / 2);
            const x2 = Math.min(W - padR, xAt(m.toIdx) + step / 2);
            const maskW = Math.max(0, x2 - x1);
            return (
              <g key={`mask-${mi}`}>
                <rect
                  className="home-line-mask"
                  x={x1}
                  y={padT}
                  width={maskW}
                  height={plotH}
                />
                <text
                  className="home-line-masklabel"
                  x={x1 + maskW / 2}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  非戦中
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
          {segs.map((seg, si) => (
            <g key={`seg-${si}`}>
              {seg.length > 1 && (
                <polyline
                  className="home-line-path"
                  points={seg
                    .map((pt) => `${xAt(pt.i)},${yAt(pt.pct)}`)
                    .join(" ")}
                  style={{ stroke: WR_LINE_COLOR }}
                />
              )}
              {seg.map((pt) => (
                <circle
                  key={pt.i}
                  className="home-line-dot"
                  cx={xAt(pt.i)}
                  cy={yAt(pt.pct)}
                  r={2.5}
                  style={{ fill: WR_LINE_COLOR }}
                >
                  <title>
                    {`${pt.year}年 勝率${Math.round(pt.pct)}%（${pt.wins}勝${pt.losses}敗）`}
                  </title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </Section>
  );
}
