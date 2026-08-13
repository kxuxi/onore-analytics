"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { lookup } from "@/lib/storage";
import { normalizeDisplayToken } from "@/lib/parser";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { getMyWarlord, setMyWarlord } from "@/lib/myWarlord";
import { StarIcon } from "@/components/icons";
import {
  collectWarlordBattles,
  summarize,
  latestSelfProfile,
  yearlyWinRates,
  formatWinRate,
  warlordNamesInLog,
  type BattleOutcome,
  type YearlyWinRate,
} from "@/lib/stats";
import { WinRateBar } from "@/components/detail/DetailParts";
import { HomeActivation, HomeWarlordSearch } from "./HomeActivation";
import { filterHomeWarlordSuggestions } from "./homeSearch";

interface Props {
  log: BattleRecord[];
  db: WarlordMap;
  colors: FactionColorMap;
  /** 管理者のみウォッチリストを表示する。 */
  isAdmin?: boolean;
  /** ウォッチ中の武将名（新しい順）。 */
  watchlist?: string[];
  /** ウォッチリストの追加／削除。 */
  onToggleWatch?: (name: string) => void;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectFaction: (name: string) => void;
  /** 未選択時に武将ランキングを開く。未指定時は導線を表示しない。 */
  onSelectRanking?: () => void;
  /** 未選択時に戦闘履歴を開く。未指定時は導線を表示しない。 */
  onSelectHistory?: () => void;
  /** 自分のステータス（能力値・最大徴兵兵数）を保存する。管理者のみ表示。 */
  onUpdateStats?: (stats: HomeStatsInput) => Promise<void>;
}

/** 自分のステータス編集フォームが送信する入力値。 */
export interface HomeStatsInput {
  name: string;
  power?: number;
  intelligence?: number;
  leadership?: number;
  politics?: number;
  strategy?: number;
  maxTroops?: number;
}

type WinLossSeriesKey = "wins" | "losses";

/** グラフに表示できる系列（勝利数=実線・敗北数=破線、色はテーマに追従）。 */
const SERIES_OPTIONS: {
  key: WinLossSeriesKey;
  label: string;
  color: string;
  valueOf: (y: YearlyWinRate) => number;
}[] = [
  {
    key: "wins",
    label: "勝利数",
    color: "var(--chart-win)",
    valueOf: (y) => y.wins,
  },
  {
    key: "losses",
    label: "敗北数",
    color: "var(--chart-loss)",
    valueOf: (y) => y.losses,
  },
];

/** これ以上戦闘のない年が続いたら「非戦期間」としてマスク表示する閾値（年）。 */
const NON_BATTLE_MIN_YEARS = 4;

/** 折れ線グラフ 1 系列分（共通の年軸に沿った値[勝利数 or 敗北数]の点列）。 */
interface ChartSeries {
  key: WinLossSeriesKey;
  label: string;
  color: string;
  points: { value: number; decided: number }[];
}

/** 折れ線を見なくても、対象期間と勝敗数の規模を把握できる文章要約。 */
export function describeWinLossTrend(
  data: YearlyWinRate[],
  selectedKeys: readonly WinLossSeriesKey[] = ["wins", "losses"]
): string {
  const showsWins = selectedKeys.includes("wins");
  const showsLosses = selectedKeys.includes("losses");
  const subject =
    showsWins && showsLosses
      ? "勝敗数"
      : showsWins
        ? "勝利数"
        : showsLosses
          ? "敗北数"
          : "勝敗数";
  const withBattles = data.filter((point) => point.battles > 0);
  if (withBattles.length === 0) {
    return `${subject}の年別推移。戦闘データなし`;
  }

  const first = withBattles[0];
  const last = withBattles[withBattles.length - 1];
  const totalWins = withBattles.reduce((sum, point) => sum + point.wins, 0);
  const totalLosses = withBattles.reduce(
    (sum, point) => sum + point.losses,
    0
  );
  const peakWins = withBattles.reduce((best, point) =>
    point.wins > best.wins ? point : best
  );
  const peakLosses = withBattles.reduce((best, point) =>
    point.losses > best.losses ? point : best
  );
  const period =
    first.year === last.year
      ? `${first.year}年`
      : `${first.year}年から${last.year}年まで`;
  const winsSummary = `期間合計${totalWins.toLocaleString(
    "ja-JP"
  )}勝。最多勝利は${peakWins.year}年の${peakWins.wins.toLocaleString(
    "ja-JP"
  )}勝`;
  const lossesSummary = `期間合計${totalLosses.toLocaleString(
    "ja-JP"
  )}敗。最多敗北は${peakLosses.year}年の${peakLosses.losses.toLocaleString(
    "ja-JP"
  )}敗`;

  if (showsWins && !showsLosses) {
    return `${period}の勝利数推移。${winsSummary}`;
  }
  if (showsLosses && !showsWins) {
    return `${period}の敗北数推移。${lossesSummary}`;
  }
  return `${period}の勝敗数推移。期間合計${totalWins.toLocaleString(
    "ja-JP"
  )}勝${totalLosses.toLocaleString("ja-JP")}敗。最多勝利は${
    peakWins.year
  }年の${peakWins.wins.toLocaleString("ja-JP")}勝、最多敗北は${
    peakLosses.year
  }年の${peakLosses.losses.toLocaleString("ja-JP")}敗`;
}

/** 勝敗数推移の折れ線グラフ（系列ごとに勝利数=実線・敗北数=破線、Y 軸=戦闘数）。 */
function WinLossLineChart({
  years,
  series,
  maskRanges,
  summary,
}: {
  years: number[];
  series: ChartSeries[];
  maskRanges: { fromIdx: number; toIdx: number }[];
  summary: string;
}) {
  const summaryId = `home-win-loss-summary-${useId()}`;
  const W = 640;
  const H = 220;
  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = years.length;
  const xAt = (i: number) =>
    padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  // Y 軸は戦闘数。全系列・全年の最大値をきりの良い数へ切り上げてスケールにする。
  const maxCount = Math.max(
    1,
    ...series.flatMap((s) => s.points.map((p) => p.value))
  );
  const niceMax = Math.max(4, Math.ceil(maxCount / 4) * 4);
  const yAt = (count: number) => padT + (1 - count / niceMax) * plotH;

  // データのある点（decided>0）を非戦期間マスクの区間でのみ分断してセグメント化する。
  const buildSegs = (pts: { i: number; value: number }[]) => {
    const segs: { i: number; value: number }[][] = [];
    let cur: { i: number; value: number }[] = [];
    for (const pt of pts) {
      if (cur.length > 0) {
        const prev = cur[cur.length - 1];
        const maskedBetween = maskRanges.some(
          (m) => m.fromIdx > prev.i && m.toIdx < pt.i
        );
        if (maskedBetween) {
          segs.push(cur);
          cur = [];
        }
      }
      cur.push({ i: pt.i, value: pt.value });
    }
    if (cur.length) segs.push(cur);
    return segs;
  };

  // セグメント群を描画する（1 点のみは点、複数は線）。
  const renderSegs = (
    segs: { i: number; value: number }[][],
    color: string,
    seriesKey: string,
    keyPrefix: string
  ) =>
    segs.map((seg, si) =>
      seg.length === 1 ? (
        seriesKey === "losses" ? (
          <rect
            key={`${keyPrefix}${si}`}
            className="home-line-dot home-line-dot--losses"
            x={xAt(seg[0].i) - 3}
            y={yAt(seg[0].value) - 3}
            width={6}
            height={6}
            rx={0.75}
            style={{ fill: color }}
          />
        ) : (
          <circle
            key={`${keyPrefix}${si}`}
            className="home-line-dot home-line-dot--wins"
            cx={xAt(seg[0].i)}
            cy={yAt(seg[0].value)}
            r={3}
            style={{ fill: color }}
          />
        )
      ) : (
        <polyline
          key={`${keyPrefix}${si}`}
          className={`home-line-path home-line-path--${seriesKey}`}
          points={seg.map((pt) => `${xAt(pt.i)},${yAt(pt.value)}`).join(" ")}
          style={{ stroke: color }}
        />
      )
    );

  return (
    <div className="home-line-wrap">
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <svg
        className="home-linechart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="年別の勝敗数推移グラフ"
        aria-describedby={summaryId}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const count = Math.round(niceMax * g);
          return (
            <g key={g}>
              <line
                className="home-line-grid"
                x1={padL}
                y1={yAt(count)}
                x2={W - padR}
                y2={yAt(count)}
              />
              <text
                className="home-line-ytick"
                x={padL - 4}
                y={yAt(count) + 3}
              >
                {count}
              </text>
            </g>
          );
        })}
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
        {series.map((s) => {
          // データのある年（decided>0）の値を折れ線で描く。
          // 非戦期間マスクで分断し、短い空白年は線で結ぶ。
          const pts = s.points
            .map((p, i) => ({ i, value: p.value, decided: p.decided }))
            .filter((p) => p.decided > 0);
          return (
            <g key={s.key}>
              {renderSegs(buildSegs(pts), s.color, s.key, `${s.key}-`)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 勝敗結果を表示テキスト＋色クラスに変換する。 */
function resultBadge(o: BattleOutcome): { text: string; cls: string } {
  if (o.result === "win") return { text: "勝利", cls: "home-res-win" };
  if (o.result === "loss") return { text: "敗北", cls: "home-res-loss" };
  return { text: "引分・撤退", cls: "home-res-other" };
}

interface StatFieldDef {
  key: keyof Omit<HomeStatsInput, "name">;
  label: string;
  step?: string;
}

const STATS_FIELDS: StatFieldDef[] = [
  { key: "power", label: "武力" },
  { key: "intelligence", label: "知力" },
  { key: "leadership", label: "統率力" },
  { key: "politics", label: "政治力" },
  { key: "strategy", label: "計略", step: "0.1" },
  { key: "maxTroops", label: "最大徴兵兵数" },
];

type StatFormState = Record<StatFieldDef["key"], string>;

function statFormStateFrom(warlord: Warlord | undefined): StatFormState {
  return {
    power: warlord?.power?.toString() ?? "",
    intelligence: warlord?.intelligence?.toString() ?? "",
    leadership: warlord?.leadership?.toString() ?? "",
    politics: warlord?.politics?.toString() ?? "",
    strategy: warlord?.strategy?.toString() ?? "",
    maxTroops: warlord?.maxTroops?.toString() ?? "",
  };
}

/**
 * 「自分のステータス」編集カード。能力値と最大徴兵兵数を自己申告で保存する。
 * 管理者のみ表示（`key={name}` で武将を切り替えるたびに入力を作り直す）。
 */
function HomeStatsEditor({
  name,
  warlord,
  onSave,
}: {
  name: string;
  warlord: Warlord | undefined;
  onSave: (stats: HomeStatsInput) => Promise<void>;
}) {
  const [form, setForm] = useState<StatFormState>(() =>
    statFormStateFrom(warlord)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: StatFieldDef["key"], value: string) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const stats: HomeStatsInput = { name };
      for (const { key } of STATS_FIELDS) {
        const raw = form[key].trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (Number.isNaN(n)) {
          setError(`「${STATS_FIELDS.find((f) => f.key === key)?.label}」は数値で入力してください`);
          setBusy(false);
          return;
        }
        stats[key] = n;
      }
      await onSave(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-card">
      <h3 className="home-card-title">⚙️ 自分のステータス</h3>
      <p className="muted">
        能力値と最大徴兵兵数を自己申告で設定できます（このブラウザ以外の利用者にも公開されます）。
      </p>
      <form onSubmit={handleSubmit}>
        <div className="filter-grid">
          {STATS_FIELDS.map(({ key, label, step }) => (
            <label key={key} className="filter">
              <span>{label}</span>
              <input
                type="number"
                inputMode="decimal"
                step={step ?? "1"}
                className="text-input"
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        {error && (
          <p style={{ color: "var(--outcome-loss-text)", fontSize: 13 }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
      </form>
    </div>
  );
}

/** ウォッチリスト（お気に入り武将）のカード。管理者のみ表示。 */
function WatchlistSection({
  watchlist,
  db,
  colors,
  onSelectWarlord,
  onToggleWatch,
}: {
  watchlist: string[];
  db: WarlordMap;
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onToggleWatch: (name: string) => void;
}) {
  return (
    <div className="home-card home-watchlist">
      <h3 className="home-card-title">
        ⭐ ウォッチリスト
        {watchlist.length > 0 && (
          <span className="home-watchlist-count">{watchlist.length}</span>
        )}
      </h3>
      {watchlist.length === 0 ? (
        <p className="muted home-watchlist-empty">
          武将の詳細ページで星アイコンを押すと、ここにブックマークされます。
        </p>
      ) : (
        <ul className="home-watchlist-list">
          {watchlist.map((n) => {
            const info = lookup(db, n);
            return (
              <li key={n} className="home-watchlist-row">
                <button
                  type="button"
                  className="home-watchlist-name link-btn"
                  onClick={() => onSelectWarlord(n)}
                  title={`${n} の戦績を見る`}
                >
                  {n}
                </button>
                {info?.faction && (
                  <span
                    className="tag faction"
                    style={factionBadgeStyle(info.faction, colors)}
                  >
                    {info.faction}
                  </span>
                )}
                <button
                  type="button"
                  className="home-watchlist-remove"
                  onClick={() => onToggleWatch(n)}
                  aria-label={`${n} をウォッチリストから外す`}
                  title="ウォッチリストから外す"
                >
                  <StarIcon filled />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * ホーム画面のダッシュボード。
 * 「自分の武将」をクッキーで管理し、その武将に関する各種サマリを表示する。
 */
export function HomeTab({
  log,
  db,
  colors,
  isAdmin = false,
  watchlist,
  onToggleWatch,
  onSelectWarlord,
  onSelectUnit,
  onSelectFaction,
  onSelectRanking,
  onSelectHistory,
  onUpdateStats,
}: Props) {
  // 自分の武将名（クッキー由来）。詳細はハイドレーション後にマウントされるため
  // 初期化子で同期的にクッキーを読んでも SSR 不整合は起きない。
  const [name, setName] = useState<string | null>(() => getMyWarlord());
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  // 折れ線グラフで表示中の系列（初期は勝利数・敗北数の両方）。
  const [selectedKeys, setSelectedKeys] = useState<WinLossSeriesKey[]>([
    "wins",
    "losses",
  ]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dashboardHeadingRef = useRef<HTMLHeadingElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<"dashboard" | "search" | "change" | null>(
    null
  );

  // 武将選択の候補は「対象の期に登場した武将」に絞る（log は対象の期でフィルタ済み）。
  const allNames = useMemo(() => {
    const set = warlordNamesInLog(log, db);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [log, db]);

  const suggestions = useMemo(
    () => filterHomeWarlordSuggestions(allNames, query),
    [allNames, query]
  );

  // 自分の武将の戦績（household 別名を統合して集計）。
  const outcomes = useMemo(
    () => (name ? collectWarlordBattles(log, name) : []),
    [log, name]
  );
  const overall = useMemo(() => summarize(outcomes), [outcomes]);
  // 年別の勝敗数推移。全系列で共通の X 軸（年）に使う。
  const yearly = useMemo(() => yearlyWinRates(outcomes), [outcomes]);
  // X 軸はデータのある年範囲に限定する（先頭・末尾の空白年を除いて間延びを防ぐ）。
  const years = useMemo(() => {
    const withData = yearly.filter((y) => y.battles > 0);
    if (withData.length === 0) return [];
    const minYear = withData[0].year;
    const maxYear = withData[withData.length - 1].year;
    return yearly
      .filter((y) => y.year >= minYear && y.year <= maxYear)
      .map((y) => y.year);
  }, [yearly]);
  // 4 年以上戦闘のない区間（非戦期間）を検出し、グラフ上に灰色マスクで示す。
  const maskRanges = useMemo(() => {
    const battleByYear = new Map(
      yearly.map((y) => [y.year, y.battles] as const)
    );
    const ranges: { fromIdx: number; toIdx: number }[] = [];
    let start = -1;
    for (let i = 0; i < years.length; i++) {
      const hasBattle = (battleByYear.get(years[i]) ?? 0) > 0;
      if (!hasBattle) {
        if (start < 0) start = i;
      } else {
        if (start >= 0 && i - start >= NON_BATTLE_MIN_YEARS) {
          ranges.push({ fromIdx: start, toIdx: i - 1 });
        }
        start = -1;
      }
    }
    return ranges;
  }, [years, yearly]);

  const toggleSeries = (key: WinLossSeriesKey) =>
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  // 選択された系列を、共通の年軸（years）に沿った値（勝利数 or 敗北数）の点列に変換する。
  const chartSeries = useMemo<ChartSeries[]>(() => {
    const yearlyMap = new Map(yearly.map((y) => [y.year, y] as const));
    return selectedKeys
      .map((key) => {
        const opt = SERIES_OPTIONS.find((o) => o.key === key);
        if (!opt) return null;
        const points = years.map((yr) => {
          const e = yearlyMap.get(yr);
          return { value: e ? opt.valueOf(e) : 0, decided: e?.decided ?? 0 };
        });
        return { key, label: opt.label, color: opt.color, points };
      })
      .filter((s): s is ChartSeries => s !== null);
  }, [selectedKeys, yearly, years]);
  const chartSummary = useMemo(
    () => describeWinLossTrend(yearly, selectedKeys),
    [selectedKeys, yearly]
  );

  const dbInfo = name ? lookup(db, name) : undefined;
  const profile = latestSelfProfile(outcomes);
  const faction = dbInfo?.faction ?? profile?.faction;
  const type = dbInfo?.type ?? profile?.type;
  const branch = dbInfo?.branch ?? profile?.branch;

  const choose = (n: string) => {
    pendingFocusRef.current = "dashboard";
    setMyWarlord(n);
    setName(n);
    setEditing(false);
    setQuery("");
  };

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (pendingFocus === "dashboard" && name && !editing) {
      dashboardHeadingRef.current?.focus();
      pendingFocusRef.current = null;
    } else if (pendingFocus === "search" && editing) {
      searchInputRef.current?.focus();
      pendingFocusRef.current = null;
    } else if (pendingFocus === "change" && name && !editing) {
      changeButtonRef.current?.focus();
      pendingFocusRef.current = null;
    }
  }, [editing, name]);

  // 初回の未選択状態だけに、サービスの価値と補助導線を表示する。
  if (!name) {
    return (
      <HomeActivation
        query={query}
        suggestions={suggestions}
        inputRef={searchInputRef}
        onQueryChange={setQuery}
        onChoose={choose}
        onSelectRanking={onSelectRanking}
        onSelectHistory={onSelectHistory}
      />
    );
  }

  // 選択済み武将を変更するときは、従来どおり検索とキャンセルだけを表示する。
  if (editing) {
    return (
      <section className="panel home-panel">
        <div className="home-picker">
          <h2 className="home-picker-title">自分の武将を選ぶ</h2>
          <p className="muted">
            ホームに成績サマリを表示する武将を選びます。選択はこのブラウザ（クッキー）に保存されます。
          </p>
          <HomeWarlordSearch
            inputRef={searchInputRef}
            query={query}
            suggestions={suggestions}
            onQueryChange={setQuery}
            onChoose={choose}
          />
          <button
            type="button"
            className="btn home-picker-cancel"
            onClick={() => {
              pendingFocusRef.current = "change";
              setEditing(false);
              setQuery("");
            }}
          >
            キャンセル
          </button>
        </div>
      </section>
    );
  }

  const tags = (
    <>
      {faction && (
        <button
          type="button"
          className="tag faction faction-link"
          style={factionBadgeStyle(faction, colors)}
          onClick={() => onSelectFaction(faction)}
          title={`${faction} の成績を見る`}
        >
          {faction}
        </button>
      )}
      {type && <span className="tag type">{type}</span>}
      {branch && <span className="tag branch">{branch}</span>}
    </>
  );

  return (
    <section className="panel home-panel">
      <div className="home-dash">
        {/* 📊 あなたの成績（ヒーロー） */}
        <div className="home-hero home-card">
          <div className="home-hero-head">
            <div className="home-hero-id">
              <div className="home-hero-eyebrow">
                📊 あなたの成績（通算）
              </div>
              <h2
                ref={dashboardHeadingRef}
                className="home-hero-name"
                tabIndex={-1}
              >
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onSelectWarlord(name)}
                  title={`${name} の詳細を見る`}
                >
                  {name}
                </button>
              </h2>
              <div className="home-hero-tags">{tags}</div>
            </div>
            <button
              ref={changeButtonRef}
              type="button"
              className="btn home-change"
              onClick={() => {
                pendingFocusRef.current = "search";
                setEditing(true);
                setQuery("");
              }}
            >
              武将を変更
            </button>
          </div>

          {outcomes.length === 0 ? (
            <p className="home-empty muted">
              この期の戦闘履歴に「{name}」の戦績が見つかりません。サイドバーで期を切り替えるか、別の武将を選んでください。
            </p>
          ) : (
            <>
              <div className="home-hero-stats">
                <div className="home-bigstat">
                  <div className="home-bigstat-val">
                    {formatWinRate(overall.winRate, overall.decided)}
                  </div>
                  <div className="home-bigstat-label">勝率</div>
                </div>
                <div className="home-bigstat">
                  <div className="home-bigstat-val">
                    {overall.wins.toLocaleString("ja-JP")} -{" "}
                    {overall.losses.toLocaleString("ja-JP")}
                  </div>
                  <div className="home-bigstat-label">勝敗</div>
                </div>
                <div className="home-bigstat">
                  <div className="home-bigstat-val">
                    {overall.battles.toLocaleString("ja-JP")}
                  </div>
                  <div className="home-bigstat-label">総戦闘数</div>
                </div>
              </div>
              <WinRateBar summary={overall} />
            </>
          )}
        </div>

        {isAdmin && onUpdateStats && (
          <HomeStatsEditor
            key={name}
            name={name}
            warlord={dbInfo}
            onSave={onUpdateStats}
          />
        )}

        {isAdmin && onToggleWatch && (
          <WatchlistSection
            watchlist={watchlist ?? []}
            db={db}
            colors={colors}
            onSelectWarlord={onSelectWarlord}
            onToggleWatch={onToggleWatch}
          />
        )}

        {outcomes.length > 0 && (
          <div className="home-grid">
            {/* 📈 勝敗数の推移（折れ線・複数系列） */}
            <div className="home-card home-card-wide">
              <h3 className="home-card-title">📈 勝敗数の推移（年別）</h3>
              {years.length === 0 ? (
                <p className="muted">データがありません。</p>
              ) : (
                <>
                  <p className="muted home-series-hint">
                    勝利数（実線）・敗北数（破線）の年別推移です。下のチェックで表示を切り替えられます。
                  </p>
                  <div className="home-series-picker">
                    {SERIES_OPTIONS.map((opt) => {
                      const active = selectedKeys.includes(opt.key);
                      return (
                        <label
                          key={opt.key}
                          className={
                            "home-series-check" + (active ? " active" : "")
                          }
                          style={
                            active ? { borderColor: opt.color } : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleSeries(opt.key)}
                          />
                          <span
                            className={`home-series-line home-series-line--${opt.key}`}
                            style={{
                              borderColor: opt.color,
                              color: opt.color,
                            }}
                            aria-hidden="true"
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                  {chartSeries.length === 0 ? (
                    <p className="muted">表示する系列を選択してください。</p>
                  ) : (
                    <WinLossLineChart
                      years={years}
                      series={chartSeries}
                      maskRanges={maskRanges}
                      summary={chartSummary}
                    />
                  )}
                </>
              )}
            </div>

            {/* 📋 最近の戦闘結果（直近5戦） */}
            <div className="home-card home-card-wide">
              <h3 className="home-card-title">📋 最近の戦闘結果（直近5戦）</h3>
              <div className="table-wrap">
                <table className="home-recent-table">
                  <caption className="sr-only">
                    最近の戦闘結果（直近5戦）
                  </caption>
                  <thead>
                    <tr>
                      <th>日時</th>
                      <th>相手</th>
                      <th>相手の兵種</th>
                      <th>結果</th>
                      <th className="num">ターン</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.slice(0, 5).map((o, i) => {
                      const badge = resultBadge(o);
                      const unit = o.opponent.unit
                        ? normalizeDisplayToken(o.opponent.unit)
                        : "—";
                      return (
                        <tr key={o.record.id ?? `${o.record.savedAt}-${i}`}>
                          <td className="home-recent-time">
                            {o.record.time ?? o.card.battleAt ?? "—"}
                          </td>
                          <td>
                            {o.opponent.name ? (
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() =>
                                  onSelectWarlord(o.opponent.name)
                                }
                              >
                                {o.opponent.name}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{unit}</td>
                          <td className={badge.cls}>{badge.text}</td>
                          <td className="num">{o.card.turns ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
