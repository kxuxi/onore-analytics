import { describe, expect, it } from "vitest";
import type { MetaUnitStat } from "@/lib/stats";
import { sortMetaUnitsByBattleCount } from "./MetaTab";

function unit(
  name: string,
  decided: number,
  appearances: number
): MetaUnitStat {
  return {
    unit: name,
    appearances,
    pickRate: appearances / 100,
    wins: decided,
    losses: 0,
    decided,
    winRate: 1,
    tier: null,
    trend: null,
  };
}

describe("sortMetaUnitsByBattleCount", () => {
  it("採用回数より戦闘数を優先して並べる", () => {
    const sorted = sortMetaUnitsByBattleCount([
      unit("採用数が多い兵種", 2, 10),
      unit("戦闘数が多い兵種", 8, 8),
    ]);

    expect(sorted.map((entry) => entry.unit)).toEqual([
      "戦闘数が多い兵種",
      "採用数が多い兵種",
    ]);
  });
});