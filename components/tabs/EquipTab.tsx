"use client";

import { useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import { weaponStats, itemStats } from "@/lib/stats";
import { EmptyState } from "@/components/EmptyState";
import { FilterSelect } from "@/components/FilterSelect";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { EquipCatalogResults } from "./EquipCatalogResults";
import { CatalogListHead, CatalogToolbar } from "./CatalogParts";
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

const VARIANT_COPY: Record<
  EquipVariant,
  {
    title: string;
    noun: string;
    stats: (log: BattleRecord[]) => ReturnType<typeof weaponStats>;
  }
> = {
  weapon: { title: "武器図鑑", noun: "武器", stats: weaponStats },
  item: { title: "品物図鑑", noun: "品物", stats: itemStats },
};

const MIN_USE_OPTIONS = EQUIP_CATALOG_MIN_USE_OPTIONS.map((n) => ({
  value: String(n),
  label: n === 1 ? "すべて" : `${n}回以上`,
}));

export function EquipTab({ log, onSelectWarlord, onSelectEquip, variant }: Props) {
  const copy = VARIANT_COPY[variant];
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<EquipCatalogSortKey>("battles");
  const [minUses, setMinUses] = useState(1);

  const stats = useMemo(() => copy.stats(log), [copy, log]);
  const view = useMemo(
    () => filterAndSortEquipCatalog(stats, keyword, sortKey, minUses),
    [stats, keyword, sortKey, minUses]
  );

  return (
    <section className="panel catalog-panel">
      <PageHeader title={copy.title} />

      <CatalogToolbar>
        <SearchBox
          value={keyword}
          onChange={setKeyword}
          placeholder={`${copy.noun}名で検索`}
          ariaLabel={`${copy.noun}名で検索`}
        />
        <FilterSelect
          label="使用回数"
          value={String(minUses)}
          options={MIN_USE_OPTIONS}
          onChange={(value) => setMinUses(Number(value))}
        />
      </CatalogToolbar>

      {stats.length === 0 ? (
        <EmptyState
          title={`${copy.noun}のデータがありません`}
          hint={`戦闘履歴を取り込むと、武将が持っていた${copy.noun}が並びます。`}
        />
      ) : (
        <>
          <CatalogListHead
            total={stats.length}
            shown={view.length}
            sort={sortKey}
            options={EQUIP_CATALOG_SORT_OPTIONS}
            onSort={setSortKey}
          />
          {view.length === 0 ? (
            <p className="muted catalog-none">該当する{copy.noun}がありません。</p>
          ) : (
            <EquipCatalogResults
              entries={view}
              noun={copy.noun}
              onSelectWarlord={onSelectWarlord}
              onSelectEquip={onSelectEquip}
            />
          )}
        </>
      )}
    </section>
  );
}
