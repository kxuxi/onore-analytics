"use client";

import { useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import { unitStats, weaponStats, itemStats, formatWinRate } from "@/lib/stats";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";

/** ランキングの対象。unit=兵種 / weapon=武器(装備2) / item=品物(装備1)。 */
export type RankVariant = "unit" | "weapon" | "item";

interface Props {
  log: BattleRecord[];
  variant: RankVariant;
  /** 兵種名クリックで兵種ページを開く（variant=unit）。 */
  onSelectUnit: (name: string) => void;
  /** 武器・品物名クリックで装備ページを開く（variant=weapon|item）。 */
  onSelectEquip: (name: string, slot: "weapon" | "item") => void;
  /** 主な使用武将クリックで武将ページを開く。 */
  onSelectWarlord: (name: string) => void;
}

/** ランキング表示用に正規化した1行。 */
interface RankRow {
  name: string;
  /** 兵科（variant=unit のみ）。 */
  branch?: string;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
  topUsers: { name: string; count: number }[];
}

const VARIANT_COPY: Record<
  RankVariant,
  {
    title: string;
    noun: string;
    description: string;
    searchPlaceholder: string;
    emptyHint: string;
  }
> = {
  unit: {
    title: "兵種ランキング",
    noun: "兵種",
    description:
      "戦闘履歴の兵種を集計し、使用回数・勝率・主な使用武将でランキングします。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "兵種名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、出撃データから兵種ランキングを算出します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
  },
  weapon: {
    title: "武器ランキング",
    noun: "武器",
    description:
      "戦闘履歴の装備2（武器）を集計し、使用回数・勝率・主な使用武将でランキングします。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "武器名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、装備2（武器）のデータからランキングを算出します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
  },
  item: {
    title: "品物ランキング",
    noun: "品物",
    description:
      "戦闘履歴の装備1（品物）を集計し、使用回数・勝率・主な使用武将でランキングします。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "品物名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、装備1（品物）のデータからランキングを算出します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
  },
};

type SortKey = "battles" | "winRate";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "battles", label: "使用回数（多い順）" },
  { key: "winRate", label: "勝率（高い順）" },
];

/** 勝率の信頼度を確保するための最低使用回数の選択肢。 */
const MIN_USE_OPTIONS = [1, 10, 30, 50, 100];

export function RankingTab({
  log,
  variant,
  onSelectUnit,
  onSelectEquip,
  onSelectWarlord,
}: Props) {
  const copy = VARIANT_COPY[variant];
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("battles");
  const [minUses, setMinUses] = useState(10);
  const [showFilter, setShowFilter] = useState(false);

  // variant に応じた集計を共通の RankRow 形に正規化する。
  const rows = useMemo<RankRow[]>(() => {
    if (variant === "unit") {
      return unitStats(log).map((u) => ({
        name: u.unit,
        branch: u.branch || undefined,
        battles: u.battles,
        wins: u.wins,
        losses: u.losses,
        decided: u.decided,
        winRate: u.winRate,
        topUsers: u.topUsers,
      }));
    }
    const fn = variant === "weapon" ? weaponStats : itemStats;
    return fn(log).map((e) => ({
      name: e.name,
      battles: e.battles,
      wins: e.wins,
      losses: e.losses,
      decided: e.decided,
      winRate: e.winRate,
      topUsers: e.topUsers,
    }));
  }, [variant, log]);

  const view = useMemo(() => {
    const k = keyword.trim();
    const filtered = rows.filter(
      (r) => r.battles >= minUses && (k ? r.name.includes(k) : true)
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "winRate") {
        return b.winRate - a.winRate || b.battles - a.battles;
      }
      return b.battles - a.battles || b.winRate - a.winRate;
    });
  }, [rows, keyword, sortKey, minUses]);

  const hasDropdownFilter = sortKey !== "battles" || minUses !== 10;
  const hasFilter = !!keyword || hasDropdownFilter;
  const clearFilters = () => {
    setKeyword("");
    setSortKey("battles");
    setMinUses(10);
  };

  const byWinRate = sortKey === "winRate";
  const maxBattles =
    view.length > 0 ? Math.max(...view.map((r) => r.battles)) : 0;

  const openDetail = (name: string) => {
    if (variant === "unit") onSelectUnit(name);
    else onSelectEquip(name, variant);
  };

  return (
    <section className="panel">
      <h2>{copy.title}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {copy.description}
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">{copy.noun}の種類</div>
          <div className="value">{rows.length}</div>
        </div>
        <div className="stat">
          <div className="label">絞り込み結果</div>
          <div className="value">{view.length}</div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        絞り込み結果 {view.length.toLocaleString("ja-JP")}件
      </p>

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
            <span>並べ替え</span>
            <select
              className="select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>最低使用回数</span>
            <select
              className="select"
              value={minUses}
              onChange={(e) => setMinUses(Number(e.target.value))}
            >
              {MIN_USE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}回以上
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {view.length === 0 ? (
        <div className="empty">
          <p className="empty-title">該当する{copy.noun}がありません</p>
          <p className="empty-hint">{copy.emptyHint}</p>
        </div>
      ) : (
        <ol className="rank-list">
          {view.map((r, i) => {
            const frac = byWinRate
              ? r.winRate
              : maxBattles > 0
                ? r.battles / maxBattles
                : 0;
            const primary = byWinRate
              ? r.decided > 0
                ? formatWinRate(r.winRate, r.decided)
                : "-"
              : r.battles.toLocaleString("ja-JP");
            return (
              <li key={r.name} className="rank-row">
                <span className="rank-rank">{i + 1}</span>
                <div className="rank-main">
                  <div className="rank-head">
                    <button
                      type="button"
                      className="rank-name link-like"
                      onClick={() => openDetail(r.name)}
                      title={`${r.name} の詳細を見る`}
                    >
                      {r.name}
                      {r.branch && (
                        <span className="rank-branch">{r.branch}</span>
                      )}
                    </button>
                    <span className="rank-value">
                      {primary}
                      {!byWinRate && <span className="rank-unit">回</span>}
                    </span>
                  </div>
                  <span
                    className="rank-bar"
                    role="progressbar"
                    aria-valuenow={Math.round(frac * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${r.name} の${byWinRate ? "勝率" : "使用回数"}`}
                  >
                    <span
                      className="rank-bar-fill"
                      style={{ width: `${Math.round(frac * 100)}%` }}
                    />
                  </span>
                  <div className="rank-meta muted">
                    {byWinRate ? (
                      <span className="rank-side-active">
                        使用 {r.battles.toLocaleString("ja-JP")}回
                      </span>
                    ) : (
                      <span className="rank-side-active">
                        勝率{" "}
                        {r.decided > 0
                          ? formatWinRate(r.winRate, r.decided)
                          : "-"}
                      </span>
                    )}
                    {r.decided > 0 && (
                      <span>
                        （{r.wins.toLocaleString("ja-JP")}/
                        {r.decided.toLocaleString("ja-JP")}）
                      </span>
                    )}
                    {r.topUsers.length > 0 && (
                      <span className="rank-users">
                        主な使用:{" "}
                        {r.topUsers.map((u) => (
                          <button
                            key={u.name}
                            type="button"
                            className="link-like"
                            onClick={() => onSelectWarlord(u.name)}
                            title={`${u.name} の戦績を見る`}
                          >
                            {u.name}
                            <span className="muted">
                              ×{u.count.toLocaleString("ja-JP")}
                            </span>
                          </button>
                        ))}
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
