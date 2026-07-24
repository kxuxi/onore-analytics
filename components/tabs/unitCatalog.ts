import type { UnitType } from "@/lib/types";
import { splitGoodAgainst } from "@/lib/unitTypeForm";

export type UnitCatalogSortKey =
  | "name"
  | "category"
  | "goodAgainst"
  | "attack"
  | "defense"
  | "cost"
  | "reqStats"
  | "bonus";

export type UnitCatalogSortDirection = "asc" | "desc";

export type UnitCatalogFilters = Partial<
  Record<UnitCatalogSortKey, string>
>;

export interface UnitCatalogColumn {
  key: UnitCatalogSortKey;
  label: string;
  numeric?: boolean;
  filter: "text" | "select" | "tokens";
}

export const UNIT_CATALOG_COLUMNS: UnitCatalogColumn[] = [
  { key: "name", label: "兵種", filter: "text" },
  { key: "category", label: "種類", filter: "select" },
  { key: "goodAgainst", label: "得意", filter: "tokens" },
  { key: "attack", label: "攻", numeric: true, filter: "text" },
  { key: "defense", label: "防", numeric: true, filter: "text" },
  { key: "cost", label: "雇用", filter: "text" },
  { key: "reqStats", label: "必要", filter: "text" },
  { key: "bonus", label: "ボーナス", filter: "text" },
];

/**
 * 兵種図鑑の既存の絞り込み・並び順を一か所で適用する。
 * 表示方法が変わっても、DesktopとMobileで同じ配列を共有できるようにする。
 */
export function filterAndSortUnitCatalog(
  units: UnitType[],
  filters: UnitCatalogFilters,
  sortKey: UnitCatalogSortKey,
  sortDirection: UnitCatalogSortDirection
): UnitType[] {
  const filteredUnits = units.filter((unit) =>
    UNIT_CATALOG_COLUMNS.every((column) => {
      const filterValue = filters[column.key]?.trim();
      if (!filterValue) return true;

      if (column.filter === "tokens") {
        return splitGoodAgainst(String(unit[column.key] ?? "")).includes(
          filterValue
        );
      }

      const cellValue = String(unit[column.key] ?? "");
      if (column.filter === "select") return cellValue === filterValue;
      return cellValue.toLowerCase().includes(filterValue.toLowerCase());
    })
  );

  const column = UNIT_CATALOG_COLUMNS.find(
    (candidate) => candidate.key === sortKey
  );
  const direction = sortDirection === "asc" ? 1 : -1;

  return [...filteredUnits].sort((left, right) => {
    if (column?.numeric) {
      return (
        ((left[sortKey] as number) - (right[sortKey] as number)) * direction
      );
    }
    return (
      String(left[sortKey] ?? "").localeCompare(
        String(right[sortKey] ?? ""),
        "ja"
      ) * direction
    );
  });
}
