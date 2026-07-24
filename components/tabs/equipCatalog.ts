import type { EquipStat } from "@/lib/stats";

export type EquipCatalogSortKey = "battles" | "winRate" | "name";

export const EQUIP_CATALOG_SORT_OPTIONS: {
  key: EquipCatalogSortKey;
  label: string;
}[] = [
  { key: "battles", label: "使用回数（多い順）" },
  { key: "winRate", label: "勝率（高い順）" },
  { key: "name", label: "名前（あいうえお順）" },
];

/** 勝率の信頼度を確保するための最低使用回数の選択肢。 */
export const EQUIP_CATALOG_MIN_USE_OPTIONS = [1, 10, 50, 100];

/**
 * 武器・品物図鑑に共通する既存の検索、最低使用回数、並び替えを適用する。
 * 元の集計配列は変更しない。
 */
export function filterAndSortEquipCatalog(
  stats: EquipStat[],
  keyword: string,
  sortKey: EquipCatalogSortKey,
  minUses: number
): EquipStat[] {
  const trimmedKeyword = keyword.trim();
  const filteredStats = stats.filter(
    (entry) =>
      entry.battles >= minUses &&
      (trimmedKeyword ? entry.name.includes(trimmedKeyword) : true)
  );

  return [...filteredStats].sort((left, right) => {
    if (sortKey === "winRate") {
      return (
        right.winRate - left.winRate || right.battles - left.battles
      );
    }
    if (sortKey === "name") {
      return left.name.localeCompare(right.name, "ja");
    }
    return (
      right.battles - left.battles || right.winRate - left.winRate
    );
  });
}
