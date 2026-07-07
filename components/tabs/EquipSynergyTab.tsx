"use client";

import { useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import { equipSynergy, formatWinRate } from "@/lib/stats";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";

interface Props {
  log: BattleRecord[];
  onSelectWarlord: (name: string) => void;
  /** 武器・品物名をクリックしたとき個別ページを開く。 */
  onSelectEquip: (name: string, slot: "weapon" | "item") => void;
}

type SortKey = "battles" | "winRate";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "winRate", label: "勝率（高い順）" },
  { key: "battles", label: "使用回数（多い順）" },
];

/** 勝率の信頼度を確保するための最低使用回数の選択肢。 */
const MIN_USE_OPTIONS = [5, 10, 30, 50, 100];

/**
 * 装備シナジー。武器（装備2）と品物（装備1）の組み合わせごとに勝率を集計し、
 * どの組み合わせが強いかを数値化する。両装備が揃っている側のみが母数。
 */
export function EquipSynergyTab({ log, onSelectWarlord, onSelectEquip }: Props) {
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [minUses, setMinUses] = useState(10);
  const [showFilter, setShowFilter] = useState(false);

  const stats = useMemo(() => equipSynergy(log), [log]);

  const view = useMemo(() => {
    const k = keyword.trim();
    const filtered = stats.filter(
      (e) =>
        e.battles >= minUses &&
        (k ? e.weapon.includes(k) || e.item.includes(k) : true)
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "winRate") {
        return b.winRate - a.winRate || b.battles - a.battles;
      }
      return b.battles - a.battles || b.winRate - a.winRate;
    });
  }, [stats, keyword, sortKey, minUses]);

  const hasDropdownFilter = sortKey !== "winRate" || minUses !== 10;
  const hasFilter = !!keyword || hasDropdownFilter;
  const clearFilters = () => {
    setKeyword("");
    setSortKey("winRate");
    setMinUses(10);
  };

  return (
    <section className="panel">
      <h2>装備シナジー</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        武器と品物の組み合わせごとに勝率を集計します。
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">組み合わせ数</div>
          <div className="value">{stats.length}</div>
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
          placeholder="武器名・品物名で絞り込み"
        />
        <button
          type="button"
          className={
            "btn filter-toggle" + (showFilter || hasDropdownFilter ? " active" : "")
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
          <p className="empty-title">該当する組み合わせがありません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を登録すると、武器と品物の組み合わせから勝率を算出します。
            すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-card">
            <thead>
              <tr>
                <th>組み合わせ（武器 × 品物）</th>
                <th>使用回数</th>
                <th>勝率</th>
                <th>主な使用武将</th>
              </tr>
            </thead>
            <tbody>
              {view.map((e) => (
                <tr key={`${e.weapon}\u0000${e.item}`}>
                  <td className="cell-title">
                    <span className="synergy-combo">
                      <button
                        type="button"
                        className="tag unit tag-btn"
                        onClick={() => onSelectEquip(e.weapon, "weapon")}
                        title={`${e.weapon} の詳細を見る`}
                      >
                        {e.weapon}
                      </button>
                      <span className="synergy-plus" aria-hidden>
                        ×
                      </span>
                      <button
                        type="button"
                        className="tag unit tag-btn"
                        onClick={() => onSelectEquip(e.item, "item")}
                        title={`${e.item} の詳細を見る`}
                      >
                        {e.item}
                      </button>
                    </span>
                  </td>
                  <td data-label="使用回数">
                    {e.battles.toLocaleString("ja-JP")}
                  </td>
                  <td data-label="勝率">
                    {e.decided > 0 ? (
                      <>
                        {formatWinRate(e.winRate, e.decided)}
                        <span className="muted equip-decided">
                          （{e.wins.toLocaleString("ja-JP")}/
                          {e.decided.toLocaleString("ja-JP")}）
                        </span>
                      </>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td className="cell-block" data-label="主な使用武将">
                    <span className="equip-users">
                      {e.topUsers.map((u) => (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
