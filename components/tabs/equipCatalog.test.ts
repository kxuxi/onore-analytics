import { describe, expect, it } from "vitest";
import type { EquipStat } from "@/lib/stats";
import {
  filterAndSortEquipCatalog,
  type EquipCatalogSortKey,
} from "./equipCatalog";

function equip(overrides: Partial<EquipStat>): EquipStat {
  return {
    name: "",
    battles: 0,
    wins: 0,
    losses: 0,
    others: 0,
    decided: 0,
    winRate: 0,
    attackUses: 0,
    defenseUses: 0,
    topUsers: [],
    ...overrides,
  };
}

const STATS = [
  equip({ name: "刀", battles: 10, winRate: 0.6 }),
  equip({ name: "槍", battles: 20, winRate: 0.5 }),
  equip({ name: "弓", battles: 10, winRate: 0.8 }),
];

function names(
  sortKey: EquipCatalogSortKey = "battles",
  keyword = "",
  minUses = 1
) {
  return filterAndSortEquipCatalog(
    STATS,
    keyword,
    sortKey,
    minUses
  ).map((entry) => entry.name);
}

describe("filterAndSortEquipCatalog", () => {
  it("使用回数の降順、同数では勝率の降順に並べる", () => {
    expect(names()).toEqual(["槍", "弓", "刀"]);
  });

  it("勝率の降順、同率では使用回数の降順に並べる", () => {
    const tied = [
      equip({ name: "短刀", battles: 4, winRate: 0.5 }),
      equip({ name: "太刀", battles: 9, winRate: 0.5 }),
    ];

    expect(
      filterAndSortEquipCatalog(tied, "", "winRate", 1).map(
        (entry) => entry.name
      )
    ).toEqual(["太刀", "短刀"]);
  });

  it("名前を日本語の昇順に並べる", () => {
    const result = names("name");
    const expected = STATS.map((entry) => entry.name).sort((left, right) =>
      left.localeCompare(right, "ja")
    );

    expect(result).toEqual(expected);
  });

  it("検索語をtrimし、大小文字を区別する部分一致を維持する", () => {
    const mixedCaseStats = [
      equip({ name: "Sword", battles: 2 }),
      equip({ name: "sword", battles: 2 }),
    ];

    expect(
      filterAndSortEquipCatalog(
        mixedCaseStats,
        "  Sword  ",
        "battles",
        1
      ).map((entry) => entry.name)
    ).toEqual(["Sword"]);
  });

  it("最低使用回数を以上条件で適用し、入力配列を変更しない", () => {
    const originalOrder = STATS.map((entry) => entry.name);

    expect(names("battles", "", 10)).toEqual(["槍", "弓", "刀"]);
    expect(names("battles", "", 11)).toEqual(["槍"]);
    expect(STATS.map((entry) => entry.name)).toEqual(originalOrder);
  });
});
