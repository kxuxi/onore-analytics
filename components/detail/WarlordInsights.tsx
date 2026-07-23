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
    <li className="detail-rank-row">
      <span className="detail-rank-no">{rank}</span>
      <span className="detail-rank-name">
        <OpponentName name={stat.name} onSelect={onSelectWarlord} />
        {stat.faction && (
          <span
            className="detail-rank-faction"
            style={factionNameStyle(stat.faction, colors)}
          >
            {stat.faction}
          </span>
        )}
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
      <div className="detail-rank-cols">
        <div className="detail-rank-col">
          <h4 className="detail-rank-head detail-rank-head--good">
            相性の良い相手
          </h4>
          <ol className="detail-rank-list">
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
          <div className="detail-rank-col">
            <h4 className="detail-rank-head detail-rank-head--bad">
              苦手な相手
            </h4>
            <ol className="detail-rank-list">
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

/* ---------- 兵種別の勝率 ---------- */

export function BranchWinRates({ branches }: { branches: BranchStat[] }) {
  if (branches.length === 0) return null;
  return (
    <Section title="兵種別の勝率" mobileCollapsed>
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

/** 色を見なくてもヒートマップの母数と最高・最低の時間帯を把握できる要約。 */
export function describeWinHeatmap(heatmap: WinHeatmap): string {
  const decidedCells = heatmap.cells.flatMap((row, day) =>
    row
      .map((cell, bucket) => ({ cell, day, bucket }))
      .filter(({ cell }) => cell.decided > 0)
  );
  if (decidedCells.length === 0) {
    return `時間帯・曜日別の勝率。日時を確認できた${heatmap.dated.toLocaleString(
      "ja-JP"
    )}戦、勝敗が確定した時間帯なし`;
  }

  const best = decidedCells.reduce((current, candidate) =>
    candidate.cell.winRate > current.cell.winRate ||
    (candidate.cell.winRate === current.cell.winRate &&
      candidate.cell.decided > current.cell.decided)
      ? candidate
      : current
  );
  const worst = decidedCells.reduce((current, candidate) =>
    candidate.cell.winRate < current.cell.winRate ||
    (candidate.cell.winRate === current.cell.winRate &&
      candidate.cell.decided > current.cell.decided)
      ? candidate
      : current
  );
  const describeCell = ({
    cell,
    day,
    bucket,
  }: (typeof decidedCells)[number]) =>
    `${DAY_LABELS[day]}曜日 ${
      heatmap.bucketLabels[bucket]
    }時台 ${formatWinRate(cell.winRate, cell.decided)}（${cell.wins.toLocaleString(
      "ja-JP"
    )}勝${cell.losses.toLocaleString("ja-JP")}敗）`;
  const prefix = `時間帯・曜日別の勝率。日時を確認できた${heatmap.dated.toLocaleString(
    "ja-JP"
  )}戦`;
  if (best.day === worst.day && best.bucket === worst.bucket) {
    return `${prefix}。対象時間帯は${describeCell(best)}`;
  }
  return `${prefix}。最高は${describeCell(best)}、最低は${describeCell(worst)}`;
}

export function WinHeatmapSection({ heatmap }: { heatmap: WinHeatmap }) {
  if (heatmap.dated === 0) return null;
  return (
    <Section title="時間帯・曜日別の勝率" mobileCollapsed>
      <div
        className="heatmap-wrap"
        role="img"
        aria-label={describeWinHeatmap(heatmap)}
      >
        <div className="heatmap">
          <div className="heat-corner" />
          {heatmap.bucketLabels.map((label) => (
            <div key={label} className="heat-col-label">
              {label}
            </div>
          ))}
          {heatmap.cells.map((row, day) => (
            <div key={day} className="heat-row">
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

/* ---------- 通算勝率の推移（累積・管理者向け） ---------- */

/** 折れ線の色（勝率＝青系）。 */
const WR_LINE_COLOR = "var(--chart-primary)";

/**
 * 通算（累積）勝率の推移を折れ線で描く（Y 軸 0〜100%、50% 基準線つき）。
 * 各年の値は「その年までの全戦績」で計算した勝率で、年を追うごとに戦績が
 * 積み上がって緩やかに変化する（その年だけの勝率ではない）。
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

  // 各年時点の通算（累積）勝率。その年までの全 wins / (wins + losses)。
  // 非戦の年は戦績が増えないので、勝率は前年から横ばいのまま線が続く。
  let cumWins = 0;
  let cumLosses = 0;
  const cumPoints = points.map((p, i) => {
    cumWins += p.wins;
    cumLosses += p.losses;
    const decidedSoFar = cumWins + cumLosses;
    return {
      i,
      year: p.year,
      pct: decidedSoFar > 0 ? (cumWins / decidedSoFar) * 100 : 0,
      cumWins,
      cumLosses,
      hasBattle: p.decided > 0,
      started: decidedSoFar > 0,
    };
  });
  // 最初に勝敗が確定した年以降だけを線にする。
  const linePts = cumPoints.filter((p) => p.started);
  const firstPoint = linePts[0];
  const lastPoint = linePts[linePts.length - 1];
  const chartSummary =
    firstPoint && lastPoint
      ? `通算勝率の推移。${firstPoint.year}年時点は${Math.round(
          firstPoint.pct
        )}%、${lastPoint.year}年時点は${Math.round(
          lastPoint.pct
        )}%（通算${lastPoint.cumWins.toLocaleString(
          "ja-JP"
        )}勝${lastPoint.cumLosses.toLocaleString("ja-JP")}敗）`
      : "通算勝率の推移。勝敗が確定したデータなし";

  return (
    <Section title="通算勝率の推移" mobileCollapsed>
      <p className="muted home-series-hint">
        その年までの全戦績で計算した通算勝率（%）です。年を追うごとに戦績が積み上がり、勝てば少し上がり負ければ少し下がります。点にカーソルを合わせるとその時点の通算成績が出ます。
      </p>
      <div className="home-line-wrap">
        <svg
          className="home-linechart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={chartSummary}
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
          {linePts.length > 1 && (
            <polyline
              className="home-line-path"
              points={linePts
                .map((pt) => `${xAt(pt.i)},${yAt(pt.pct)}`)
                .join(" ")}
              style={{ stroke: WR_LINE_COLOR }}
            />
          )}
          {linePts
            .filter((pt) => pt.hasBattle)
            .map((pt) => (
              <circle
                key={pt.i}
                className="home-line-dot"
                cx={xAt(pt.i)}
                cy={yAt(pt.pct)}
                r={2.5}
                style={{ fill: WR_LINE_COLOR }}
              >
                <title>
                  {`${pt.year}年時点 通算勝率${Math.round(pt.pct)}%（通算${pt.cumWins}勝${pt.cumLosses}敗）`}
                </title>
              </circle>
            ))}
        </svg>
      </div>
    </Section>
  );
}
