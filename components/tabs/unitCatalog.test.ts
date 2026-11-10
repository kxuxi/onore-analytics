import { describe, expect, it } from "vitest";
import type { UnitType } from "@/lib/types";
import {
  filterAndSortUnitCatalog,
  type UnitCatalogFilters,
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
  sortKey: UnitCatalogSortKey = "name"
) {
  return filterAndSortUnitCatalog(UNITS, filters, sortKey).map(
    (entry) => entry.name
  );
}

describe("filterAndSortUnitCatalog", () => {
  it("名前は日本語の昇順に並べる", () => {
    const expected = UNITS.map((u) => u.name).sort((a, b) =>
      a.localeCompare(b, "ja")
    );
    expect(names()).toEqual(expected);
  });

  it("攻撃・防御は数値の高い順に並べる", () => {
    expect(names({}, "attack")).toEqual(["弓兵乙", "歩兵甲", "万能丙"]);
    expect(names({}, "defense")).toEqual(["歩兵甲", "万能丙", "弓兵乙"]);
  });

  it("種類は完全一致で絞る", () => {
    expect(names({ category: "弓兵" })).toEqual(["弓兵乙"]);
    expect(names({ category: "弓" })).toEqual([]);
  });

  it("検索は名前・得意・必要能力値・ボーナスを大小文字を無視して部分一致する", () => {
    expect(names({ query: "歩兵甲" })).toEqual(["歩兵甲"]);
    expect(names({ query: "騎兵" }, "attack")).toEqual(["弓兵乙", "万能丙"]);
    expect(names({ query: "知力" })).toEqual(["万能丙"]);
    expect(names({ query: " 計略 " }, "attack")).toEqual(["弓兵乙", "万能丙"]);
    const mixed = [unit({ name: "Alpha", bonus: "Critical UP" }), unit({ name: "Beta" })];
    expect(
      filterAndSortUnitCatalog(mixed, { query: "up" }, "name").map((u) => u.name)
    ).toEqual(["Alpha"]);
  });

  it("種類と検索をANDで適用し、入力配列を変更しない", () => {
    const original = UNITS.map((u) => u.name);
    expect(names({ category: "弓兵", query: "計略" })).toEqual(["弓兵乙"]);
    expect(names({ category: "歩兵", query: "計略" })).toEqual([]);
    expect(UNITS.map((u) => u.name)).toEqual(original);
  });
});
