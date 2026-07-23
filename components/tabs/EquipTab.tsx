"use client";

import { useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import { weaponStats, itemStats } from "@/lib/stats";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { EquipCatalogResults } from "./EquipCatalogResults";
import {
  EQUIP_CATALOG_MIN_USE_OPTIONS,
  EQUIP_CATALOG_SORT_OPTIONS,
  filterAndSortEquipCatalog,
  type EquipCatalogSortKey,
} from "./equipCatalog";

/** 集計する装備枠。weapon=武将の持つ武器 / item=武将の持つ品物。 */
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
    description: string;
    searchPlaceholder: string;
    emptyHint: string;
    stats: (log: BattleRecord[]) => ReturnType<typeof weaponStats>;
  }
> = {
  weapon: {
    title: "武器図鑑",
    noun: "武器",
    slotLabel: "武将の持つ武器",
    description:
      "戦闘履歴の武将の持つ武器を集計し、使用回数・勝率・主な使用武将を表示します。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "武器名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、武将の持つ武器のデータから図鑑を作成します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
    stats: weaponStats,
  },
  item: {
    title: "品物図鑑",
    noun: "品物",
    slotLabel: "武将の持つ品物",
    description:
      "戦闘履歴の武将の持つ品物を集計し、使用回数・勝率・主な使用武将を表示します。勝率は勝敗が確定した戦闘のみで算出します。",
    searchPlaceholder: "品物名で絞り込み",
    emptyHint:
      "「戦闘履歴」タブで戦績を登録すると、武将の持つ品物のデータから図鑑を作成します。すでに登録済みの場合は、検索語や最低使用回数の条件を見直してください。",
    stats: itemStats,
  },
};

export function EquipTab({ log, onSelectWarlord, onSelectEquip, variant }: Props) {
  const copy = VARIANT_COPY[variant];
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] =
    useState<EquipCatalogSortKey>("battles");
  const [minUses, setMinUses] = useState(1);
  const [showFilter, setShowFilter] = useState(true);

  const stats = useMemo(() => copy.stats(log), [copy, log]);

  const view = useMemo(
    () => filterAndSortEquipCatalog(stats, keyword, sortKey, minUses),
    [stats, keyword, sortKey, minUses]
  );

  // 検索ボックスとは別にトグルする並べ替え・絞り込み（既定値と異なると「適用中」扱い）。
  const hasDropdownFilter = sortKey !== "battles" || minUses !== 1;
  const hasFilter = !!keyword || hasDropdownFilter;
  const clearFilters = () => {
    setKeyword("");
    setSortKey("battles");
    setMinUses(1);
  };
  const activeFilters: ActiveFilter[] = [];
  if (sortKey !== "battles") {
    activeFilters.push({
      key: "sort",
      label: "並べ替え",
      value:
        EQUIP_CATALOG_SORT_OPTIONS.find(
          (option) => option.key === sortKey
        )?.label ?? sortKey,
      onRemove: () => setSortKey("battles"),
    });
  }
  if (minUses !== 1) {
    activeFilters.push({
      key: "min-uses",
      label: "最低使用回数",
      value: `${minUses}回以上`,
      onRemove: () => setMinUses(1),
    });
  }

  return (
    <section className="panel catalog-panel">
      <PageHeader title={copy.title} description={copy.description} />

      <FilterPanel
        id={`${variant}-catalog-filters`}
        search={
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder={copy.searchPlaceholder}
          />
        }
        expanded={showFilter}
        onToggle={() => setShowFilter((v) => !v)}
        toggleActive={showFilter || hasDropdownFilter}
        hasActiveFilters={hasFilter}
        onClear={clearFilters}
        activeFilters={activeFilters}
        resultText={
          hasFilter
            ? `全${stats.length.toLocaleString("ja-JP")}件中 ${view.length.toLocaleString("ja-JP")}件`
            : `全${stats.length.toLocaleString("ja-JP")}件`
        }
      >
        <label className="filter">
          <span>並べ替え</span>
          <select
            className="select"
            value={sortKey}
            onChange={(e) =>
              setSortKey(e.target.value as EquipCatalogSortKey)
            }
          >
            {EQUIP_CATALOG_SORT_OPTIONS.map((o) => (
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
            {EQUIP_CATALOG_MIN_USE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}回以上
              </option>
            ))}
          </select>
        </label>
      </FilterPanel>

      {view.length === 0 ? (
        <div className="empty">
          <p className="empty-title">該当する{copy.noun}がありません</p>
          <p className="empty-hint">{copy.emptyHint}</p>
        </div>
      ) : (
        <EquipCatalogResults
          entries={view}
          noun={copy.noun}
          slotLabel={copy.slotLabel}
          onSelectWarlord={onSelectWarlord}
          onSelectEquip={onSelectEquip}
        />
      )}
    </section>
  );
}
