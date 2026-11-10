"use client";

import { PeriodSelector, useRankingPeriod } from "@/components/PeriodSelector";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilterSelect } from "@/components/FilterSelect";
import { PageHeader } from "@/components/layout/PageHeader";
import type { BattleRecord } from "@/lib/types";
import {
  equipSynergy,
  formatWinRate,
  metaOverview,
  RANKING_LAST10_KEY,
} from "@/lib/stats";
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
 * 装備シナジー。武将の持つ武器と武将の持つ品物の組み合わせごとに勝率を集計し、
 * どの組み合わせが強いかを数値化する。両装備が揃っている側のみが母数。
 */
/** 装備シナジーで選べる集計期間（並びは rankingPeriods のまま）。 */
const SYNERGY_PERIOD_KEYS = ["all", RANKING_LAST10_KEY];

export function EquipSynergyTab({ log, onSelectWarlord, onSelectEquip }: Props) {
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [minUses, setMinUses] = useState(10);
  const [showFilter, setShowFilter] = useState(true);
  const [warlordType, setWarlordType] = useState("");

  const {
    periods: periodOptions,
    periodKey,
    setPeriodKey,
    period,
  } = useRankingPeriod(log, RANKING_LAST10_KEY, SYNERGY_PERIOD_KEYS);
  const warlordTypeOptions = useMemo(
    () => metaOverview(log).traits.map((trait) => trait.trait),
    [log]
  );
  const stats = useMemo(
    () => equipSynergy(log, period, warlordType || undefined),
    [log, period, warlordType]
  );

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

  const hasDropdownFilter =
    sortKey !== "winRate" || minUses !== 10 || warlordType !== "";
  const hasFilter = !!keyword || hasDropdownFilter;
  const clearFilters = () => {
    setKeyword("");
    setSortKey("winRate");
    setMinUses(10);
    setWarlordType("");
  };

  return (
    <section className="panel">
      <PageHeader
        title="装備シナジー"
        description="武器と品物の組み合わせごとに勝率を集計します。"
      />

      <PeriodSelector
        periods={periodOptions}
        value={periodKey}
        onChange={setPeriodKey}
      />

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
          <FilterSelect
            label="並べ替え"
            value={sortKey}
            options={SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            onChange={(value) => setSortKey(value as SortKey)}
          />
          <FilterSelect
            label="最低使用回数"
            value={String(minUses)}
            options={MIN_USE_OPTIONS.map((n) => ({ value: String(n), label: `${n}回以上` }))}
            onChange={(value) => setMinUses(Number(value))}
          />
          <FilterSelect
            label="武将タイプ"
            value={warlordType}
            options={warlordTypeOptions}
            onChange={setWarlordType}
            emptyLabel="すべて"
          />
        </div>
      )}

      {view.length === 0 ? (
        <EmptyState
          title="該当する組み合わせがありません"
          hint="「戦闘履歴」タブで戦績を登録すると、武器と品物の組み合わせから勝率を算出します。 すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。"
        />
      ) : (
        <div className="table-wrap">
          <table className="table-card">
            <caption className="sr-only">
              武器と品物の組み合わせ別の使用回数、勝率、主な使用武将の一覧
            </caption>
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
