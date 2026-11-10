"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { BattleRecord } from "@/lib/types";
import {
  metaOverview,
  metaUnitUsage,
  rankingPeriods,
  type MetaUnitStat,
  type MetaUnitUsage,
} from "@/lib/stats";

interface Props {
  log: BattleRecord[];
  onSelectUnit: (name: string) => void;
  onSelectWarlord?: (name: string) => void;
}

/** 最初に表示する兵種の件数（残りは「さらに表示」）。 */
const INITIAL_ROWS = 20;
/** 展開した兵種で最初に表示する使い手の人数。 */
const INITIAL_USERS = 8;

const PREFS_KEY = "onore.meta.prefs.v2";

type SortKey = "battles" | "winRate" | "lift";
const SORT_LABEL: Record<SortKey, string> = {
  battles: "戦闘数",
  winRate: "勝率",
  lift: "普段との差",
};
const MIN_DECIDED_OPTIONS = [1, 5, 10, 20, 50];

interface Prefs {
  sort: SortKey;
  minDecided: number;
}
const DEFAULT_PREFS: Prefs = { sort: "battles", minDecided: 10 };

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      sort: p.sort && p.sort in SORT_LABEL ? p.sort : DEFAULT_PREFS.sort,
      minDecided:
        typeof p.minDecided === "number" &&
        MIN_DECIDED_OPTIONS.includes(p.minDecided)
          ? p.minDecided
          : DEFAULT_PREFS.minDecided,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** パーセント表示（整数）。 */
function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 勝率の差を表示（+8% / −3% / ±0%）。 */
function pt(diff: number): string {
  const n = Math.round(diff * 100);
  if (n === 0) return "±0%";
  return `${n > 0 ? "+" : "−"}${Math.abs(n)}%`;
}

export function sortMetaUnitsByBattleCount(
  units: MetaUnitStat[],
): MetaUnitStat[] {
  return [...units].sort(
    (a, b) =>
      b.decided - a.decided ||
      b.appearances - a.appearances ||
      b.winRate - a.winRate ||
      a.unit.localeCompare(b.unit, "ja"),
  );
}

export interface MetaRow {
  stat: MetaUnitStat;
  usage: MetaUnitUsage | null;
}

/** 並び替え（同順位は戦闘数順）。 */
export function sortMetaRows(rows: MetaRow[], sort: SortKey): MetaRow[] {
  const byBattles = sortMetaUnitsByBattleCount(rows.map((r) => r.stat));
  const order = new Map(byBattles.map((s, i) => [s.unit, i]));
  const tie = (a: MetaRow, b: MetaRow) =>
    (order.get(a.stat.unit) ?? 0) - (order.get(b.stat.unit) ?? 0);
  if (sort === "battles") return [...rows].sort(tie);
  if (sort === "winRate")
    return [...rows].sort(
      (a, b) => b.stat.winRate - a.stat.winRate || tie(a, b),
    );
  return [...rows].sort(
    (a, b) => (b.usage?.lift ?? -1) - (a.usage?.lift ?? -1) || tie(a, b),
  );
}

/**
 * 環境ダッシュボード。期間内の兵種ごとの勝敗と使い手を表示する。
 * 使い手の普段の勝率と並べ、勝率が兵種によるものか使い手によるものかを見られるようにする。
 */
export function MetaTab({ log, onSelectUnit, onSelectWarlord }: Props) {
  const [period, setPeriod] = useState<string>("all");
  const [type, setType] = useState<string>("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setPrefs(loadPrefs());
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // 保存できなくても表示には影響しない。
    }
  }, [prefs, prefsLoaded]);

  // 集計期間（先頭＝過去10年間、以降はメタ分析の絶対年バケット＋全期間）。
  const periods = useMemo(() => rankingPeriods(log), [log]);
  const range = useMemo(
    () => periods.find((p) => p.key === period) ?? null,
    [periods, period],
  );

  // 武将タイプの選択肢は期間に依存せず安定させたいので、全期間から抽出する。
  const typeOptions = useMemo(
    () => metaOverview(log).traits.map((t) => t.trait),
    [log],
  );

  const { totalBattles, units } = useMemo(
    () => metaOverview(log, range ?? undefined, type || undefined),
    [log, range, type],
  );
  const usage = useMemo(
    () => metaUnitUsage(log, range ?? undefined, type || undefined),
    [log, range, type],
  );

  const rows = useMemo(
    () =>
      sortMetaRows(
        units
          .filter((u) => u.decided >= prefs.minDecided)
          .map((stat) => ({ stat, usage: usage.get(stat.unit) ?? null })),
        prefs.sort,
      ),
    [units, usage, prefs],
  );
  const visibleRows = showAll ? rows : rows.slice(0, INITIAL_ROWS);

  const toggle = (unit: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });

  return (
    <section className="panel">
      <PageHeader
        title="環境ダッシュボード"
        description="兵種ごとの勝敗と使い手を表示します。"
      />

      <div className="tmx-periods" role="group" aria-label="集計期間">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            className={"tmx-period" + (period === p.key ? " active" : "")}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="meta-filter">
        <span className="meta-filter-pair">
          <label className="meta-filter-label" htmlFor="meta-type">
            武将タイプ
          </label>
          <select
            id="meta-type"
            className="select meta-filter-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">すべて</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </span>
        <span className="meta-filter-pair">
          <label className="meta-filter-label" htmlFor="meta-min">
            最低戦数
          </label>
          <select
            id="meta-min"
            className="select meta-filter-select meta-filter-narrow"
            value={prefs.minDecided}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, minDecided: Number(e.target.value) }))
            }
          >
            {MIN_DECIDED_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}戦以上
              </option>
            ))}
          </select>
        </span>
      </div>

      {totalBattles === 0 ? (
        <p className="muted">この期間の対戦データがありません。</p>
      ) : (
        <div className="meta-block">
          <div className="meta-listhead">
            <h3 className="meta-h3">
              兵種
              {type && <span className="meta-h3-tag">{type}</span>}
              <span className="meta-h3-sub">
                全{totalBattles.toLocaleString("ja-JP")}戦
              </span>
            </h3>
            <div className="meta-sort" role="group" aria-label="並び順">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={prefs.sort === k}
                  className={
                    "tmx-period meta-sort-btn" +
                    (prefs.sort === k ? " active" : "")
                  }
                  onClick={() => setPrefs((p) => ({ ...p, sort: k }))}
                >
                  {SORT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="meta-legend" aria-hidden="true">
            <span className="meta-legend-item">
              <span className="meta-legend-mark" />
              普段＝使い手が他の兵種で出している勝率
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="muted">この条件に当てはまる兵種がありません。</p>
          ) : (
            <ol className="meta-units">
              {visibleRows.map((r, i) => (
                <MetaUnitRow
                  key={r.stat.unit}
                  rank={i + 1}
                  row={r}
                  open={expanded.has(r.stat.unit)}
                  onToggle={() => toggle(r.stat.unit)}
                  onSelectUnit={onSelectUnit}
                  onSelectWarlord={onSelectWarlord}
                />
              ))}
            </ol>
          )}
          {rows.length > INITIAL_ROWS && (
            <button
              type="button"
              className="btn meta-more"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? "上位だけ表示"
                : `残り${rows.length - INITIAL_ROWS}兵種を表示`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** 勝率の棒。塗り＝勝率、縦線＝使い手の普段の勝率、点線＝50%。 */
function WinBar({
  winRate,
  expected,
}: {
  winRate: number;
  expected: number | null;
}) {
  const label =
    `勝率 ${pct(winRate)}` +
    (expected != null ? `、普段 ${pct(expected)}` : "");
  return (
    <div className="meta-bar" role="img" aria-label={label} title={label}>
      <span className="meta-bar-half" />
      <span className="meta-bar-fill" style={{ width: `${winRate * 100}%` }} />
      {expected != null && (
        <span
          className="meta-bar-mark"
          style={{ left: `${expected * 100}%` }}
        />
      )}
    </div>
  );
}

function MetaUnitRow({
  rank,
  row,
  open,
  onToggle,
  onSelectUnit,
  onSelectWarlord,
}: {
  rank: number;
  row: MetaRow;
  open: boolean;
  onToggle: () => void;
  onSelectUnit: (name: string) => void;
  onSelectWarlord?: (name: string) => void;
}) {
  const { stat, usage } = row;
  const [allUsers, setAllUsers] = useState(false);
  const users = usage?.users ?? [];
  const shownUsers = allUsers ? users : users.slice(0, INITIAL_USERS);
  const detailId = `meta-users-${encodeURIComponent(stat.unit)}`;

  return (
    <li className="meta-row">
      <div className="meta-row-main">
        <span className="meta-rank">{rank}</span>
        <div className="meta-who">
          <button
            type="button"
            className="link-like meta-name"
            onClick={() => onSelectUnit(stat.unit)}
          >
            {stat.unit}
          </button>
          {stat.branch && (
            <div className="meta-sub">
              <span>{stat.branch}</span>
            </div>
          )}
        </div>

        <div className="meta-rate">
          <div className="meta-rate-nums">
            <strong className="meta-rate-main">{pct(stat.winRate)}</strong>
            <span className="meta-wl">
              {stat.wins}勝{stat.losses}敗
            </span>
            {usage?.expectedRate != null && (
              <span className="meta-rate-cmp">
                普段 {pct(usage.expectedRate)}
                {usage.lift != null && (
                  <span className="meta-lift">（{pt(usage.lift)}）</span>
                )}
              </span>
            )}
          </div>
          <WinBar
            winRate={stat.winRate}
            expected={usage?.expectedRate ?? null}
          />
        </div>

        <button
          type="button"
          className="meta-users-btn"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={onToggle}
        >
          {usage?.userCount ?? 0}人
          <span aria-hidden="true">{open ? " ▴" : " ▾"}</span>
        </button>
      </div>

      {open && (
        <div className="meta-users" id={detailId}>
          <table className="meta-users-table">
            <caption className="sr-only">{stat.unit}の使い手</caption>
            <thead>
              <tr>
                <th scope="col">武将</th>
                <th scope="col" className="num">
                  この兵種
                </th>
                <th scope="col" className="num">
                  普段
                </th>
                <th scope="col" className="num">
                  差
                </th>
              </tr>
            </thead>
            <tbody>
              {shownUsers.map((u) => (
                <tr key={u.name}>
                  <th scope="row">
                    {onSelectWarlord ? (
                      <button
                        type="button"
                        className="link-like"
                        onClick={() => onSelectWarlord(u.name)}
                      >
                        {u.name}
                      </button>
                    ) : (
                      u.name
                    )}
                  </th>
                  <td className="num">
                    {u.decided > 0 ? pct(u.winRate) : "—"}
                    <span className="meta-cell-sub">
                      {u.wins}勝{u.losses}敗
                    </span>
                  </td>
                  <td className="num">
                    {u.baselineDecided > 0 ? pct(u.baselineRate) : "—"}
                  </td>
                  <td className="num">
                    {u.decided > 0 && u.baselineDecided > 0
                      ? pt(u.winRate - u.baselineRate)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length > INITIAL_USERS && (
            <button
              type="button"
              className="btn meta-more"
              onClick={() => setAllUsers((v) => !v)}
            >
              {allUsers
                ? "上位だけ表示"
                : `残り${users.length - INITIAL_USERS}人を表示`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
