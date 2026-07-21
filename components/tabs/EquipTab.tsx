"use client";

import { useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import { weaponStats, itemStats, formatWinRate } from "@/lib/stats";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";

/** 集計する装備枠。weapon=装備1 / item=装備2。 */
export type EquipVariant = "weapon" | "item";

interface Props {
  log: BattleRecord[];
  onSelectWarlord: (name: string) => void;
  /** 装備名をクリックしたときに個別ページを開く。 */
  onSelectEquip: (name: string) => void;
  /** 武器図鑑 / 品物図鑑のどちらを表示するか。 */
  variant: EquipVariant;
}

/** 図鑑の表記まわりを variant ごとに切り替えるための文言設定。 */
const VARIANT_COPY: Record<
  EquipVariant,
  {
    title: string;
    noun: string;
    slotLabel: string;
    kindLabel: string;
    description: string;
    searchPlaceholder: string;
    emptyHint: string;
    stats: (log: BattleRecord[]) => ReturnType<typeof weaponStats>;
  }
> = {
  weapon: {
    title: "武器図鑑",
    noun: "武器",
    slotLabel: "武器（装備2）",
    kindLabel: "武器の種類",
    description:
      "戦闘履歴の装備2（武器）を集計し、使用回数・勝率・主な使用武将を表示します。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "武器名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、装備2（武器）のデータから図鑑を作成します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
    stats: weaponStats,
  },
  item: {
    title: "品物図鑑",
    noun: "品物",
    slotLabel: "品物（装備1）",
    kindLabel: "品物の種類",
    description:
      "戦闘履歴の装備1（品物）を集計し、使用回数・勝率・主な使用武将を表示します。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "品物名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、装備1（品物）のデータから図鑑を作成します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
    stats: itemStats,
  },
};

type SortKey = "battles" | "winRate" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "battles", label: "使用回数（多い順）" },
  { key: "winRate", label: "勝率（高い順）" },
  { key: "name", label: "名前（あいうえお順）" },
];

/** 勝率の信頼度を確保するための最低使用回数の選択肢。 */
const MIN_USE_OPTIONS = [1, 10, 50, 100];

export function EquipTab({ log, onSelectWarlord, onSelectEquip, variant }: Props) {
  const copy = VARIANT_COPY[variant];
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("battles");
  const [minUses, setMinUses] = useState(1);
  const [showFilter, setShowFilter] = useState(false);

  const stats = useMemo(() => copy.stats(log), [copy, log]);

  const view = useMemo(() => {
    const k = keyword.trim();
    const filtered = stats.filter(
      (e) => e.battles >= minUses && (k ? e.name.includes(k) : true)
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "winRate") {
        return b.winRate - a.winRate || b.battles - a.battles;
      }
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, "ja");
      }
      return b.battles - a.battles || b.winRate - a.winRate;
    });
  }, [stats, keyword, sortKey, minUses]);

  // 検索ボックスとは別にトグルする並べ替え・絞り込み（既定値と異なると「適用中」扱い）。
  const hasDropdownFilter = sortKey !== "battles" || minUses !== 1;
  const hasFilter = !!keyword || hasDropdownFilter;
  const clearFilters = () => {
    setKeyword("");
    setSortKey("battles");
    setMinUses(1);
  };

  return (
    <section className="panel">
      <h2>{copy.title}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {copy.description}
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">{copy.kindLabel}</div>
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
        <div className="table-wrap">
          <table className="table-card">
            <thead>
              <tr>
                <th>{copy.slotLabel}</th>
                <th>使用回数</th>
                <th>勝率</th>
                <th>攻 / 守</th>
                <th>主な使用武将</th>
              </tr>
            </thead>
            <tbody>
              {view.map((e) => (
                <tr key={e.name}>
                  <td className="cell-title">
                    <button
                      type="button"
                      className="tag unit tag-btn"
                      onClick={() => onSelectEquip(e.name)}
                      title={`${e.name} の詳細を見る`}
                    >
                      {e.name}
                    </button>
                  </td>
                  <td data-label="使用回数">
                    {e.battles.toLocaleString("ja-JP")}
                  </td>
                  <td data-label="勝率">
                    <span>
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
                    </span>
                  </td>
                  <td className="equip-split" data-label="攻 / 守">
                    <span>
                      {e.attackUses.toLocaleString("ja-JP")} /{" "}
                      {e.defenseUses.toLocaleString("ja-JP")}
                    </span>
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
