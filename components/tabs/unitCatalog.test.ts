import { describe, expect, it } from "vitest";
import type { UnitType } from "@/lib/types";
import {
  filterAndSortUnitCatalog,
  type UnitCatalogFilters,
  type UnitCatalogSortDirection,
  type UnitCatalogSortKey,
} from "./unitCatalog";

function unit(overrides: Partial<UnitType>): UnitType {
  return {
    name: "",
    category: "",
    goodAgainst: "",
    attack: 0,
    defense: 0,
    cost: "",
    tech: "",
    years: "",
    reqStats: "",
    facility: "",
    special: "",
    bonus: "",
    ...overrides,
  };
}

const UNITS = [
  unit({
    name: "弓兵乙",
    category: "弓兵",
    goodAgainst: "歩兵:騎兵",
    attack: 100,
    defense: 20,
    cost: "金:600",
    reqStats: "統率:80",
    bonus: "計略+5%",
  }),
  unit({
    name: "歩兵甲",
    category: "歩兵",
    goodAgainst: "弓兵",
    attack: 20,
    defense: 100,
    cost: "金:400",
    reqStats: "武力:60",
    bonus: "防御+10",
  }),
  unit({
    name: "万能丙",
    category: "万能",
    goodAgainst: "騎兵",
    attack: 3,
    defense: 30,
    cost: "金:500",
    reqStats: "知力:70",
    bonus: "計略+3%",
  }),
];

function names(
  filters: UnitCatalogFilters = {},
  sortKey: UnitCatalogSortKey = "name",
  sortDirection: UnitCatalogSortDirection = "asc"
) {
  return filterAndSortUnitCatalog(
    UNITS,
    filters,
    sortKey,
    sortDirection
  ).map((entry) => entry.name);
}

describe("filterAndSortUnitCatalog", () => {
  it("既定の兵種名を日本語の昇順・降順に並べる", () => {
    const ascending = names();
    const descending = names({}, "name", "desc");

    expect(descending).toEqual([...ascending].reverse());
  });

  it("攻撃と防御は文字列ではなく数値として並べる", () => {
    expect(names({}, "attack", "asc")).toEqual([
      "万能丙",
      "歩兵甲",
      "弓兵乙",
    ]);
    expect(names({}, "defense", "desc")).toEqual([
      "歩兵甲",
      "万能丙",
      "弓兵乙",
    ]);
  });

  it("種類は完全一致、得意兵種は分割後の完全一致で絞る", () => {
    expect(names({ category: "弓兵" })).toEqual(["弓兵乙"]);
    expect(names({ category: "弓" })).toEqual([]);
    expect(names({ goodAgainst: "騎兵" })).toEqual(["弓兵乙", "万能丙"]);
    expect(names({ goodAgainst: "騎" })).toEqual([]);
  });

  it("テキスト項目は前後空白と大文字小文字を無視した部分一致で絞る", () => {
    const mixedCaseUnits = [
      unit({ name: "Alpha", bonus: "Critical UP" }),
      unit({ name: "Beta", bonus: "Defense" }),
    ];

    expect(
      filterAndSortUnitCatalog(
        mixedCaseUnits,
        { name: "  ALP  ", bonus: "up" },
        "name",
        "asc"
      ).map((entry) => entry.name)
    ).toEqual(["Alpha"]);
  });

  it("複数条件をANDで適用し、入力配列を変更しない", () => {
    const originalOrder = UNITS.map((entry) => entry.name);

    expect(
      names({ category: "弓兵", reqStats: "統率", bonus: "計略" })
    ).toEqual(["弓兵乙"]);
    expect(UNITS.map((entry) => entry.name)).toEqual(originalOrder);
  });
});
