import type { UnitType } from "@/lib/types";

export type UnitCatalogSortKey = "name" | "attack" | "defense";

export const UNIT_CATALOG_SORT_OPTIONS: {
  key: UnitCatalogSortKey;
  label: string;
}[] = [
  { key: "name", label: "名前" },
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
];

export interface UnitCatalogFilters {
  /** 兵種名・得意兵種・必要能力値・ボーナスを対象にした部分一致検索。 */
  query?: string;
  /** 種類（完全一致）。 */
  category?: string;
}

/**
 * 兵種図鑑の絞り込みと並び順を適用する。
 * 名前はあいうえお順、攻撃・防御は高い順（同値は名前順）。入力配列は変更しない。
 */
export function filterAndSortUnitCatalog(
  units: UnitType[],
  filters: UnitCatalogFilters,
  sortKey: UnitCatalogSortKey
): UnitType[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const category = filters.category?.trim() ?? "";

  const filtered = units.filter((unit) => {
    if (category && unit.category.trim() !== category) return false;
    if (!query) return true;
    return [unit.name, unit.goodAgainst, unit.reqStats, unit.bonus].some(
      (field) => (field ?? "").toLowerCase().includes(query)
    );
  });

  const byName = (a: UnitType, b: UnitType) =>
    a.name.localeCompare(b.name, "ja");

  return [...filtered].sort((a, b) => {
    if (sortKey === "attack") return b.attack - a.attack || byName(a, b);
    if (sortKey === "defense") return b.defense - a.defense || byName(a, b);
    return byName(a, b);
  });
}
