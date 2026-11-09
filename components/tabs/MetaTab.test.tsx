import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetaUnitStat } from "@/lib/stats";
import type { BattleRecord } from "@/lib/types";
import { MetaTab, sortMetaRows, sortMetaUnitsByBattleCount } from "./MetaTab";

function unit(
  name: string,
  decided: number,
  appearances: number,
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
describe("sortMetaRows", () => {
  const row = (
    name: string,
    decided: number,
    winRate: number,
    lift: number,
  ) => ({
    stat: { ...unit(name, decided, decided), winRate },
    usage: {
      unit: name,
      users: [],
      userCount: 1,
      expectedRate: winRate - lift,
      lift,
    },
  });
  const rows = [
    row("多い", 50, 0.5, 0),
    row("勝率高い", 20, 0.7, -0.1),
    row("差が大きい", 15, 0.6, 0.12),
  ];

  it("勝率順・普段との差の順に並べる", () => {
    expect(sortMetaRows(rows, "winRate").map((r) => r.stat.unit)).toEqual([
      "勝率高い",
      "差が大きい",
      "多い",
    ]);
    expect(sortMetaRows(rows, "lift").map((r) => r.stat.unit)).toEqual([
      "差が大きい",
      "多い",
      "勝率高い",
    ]);
  });
});

describe("MetaTab", () => {
  it("勝敗・使い手の普段の勝率・使い手の人数を表示し、既定は10戦以上", () => {
    const line = (left: string, unitName: string, win: boolean, i: number) =>
      `【1戦目】 1600年4月 04/10 10:${String(i).padStart(2, "0")} 京都 ` +
      `東軍 ${left} ${left}家 武特 ${unitName} 騎兵 槍 鎧 V.S. ` +
      `西軍 相手${i} 相手家 統特 相手兵 弓兵 弓 旗 ${win ? left : `相手${i}`}の勝利 12`;
    const log: BattleRecord[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: i,
        line: line("名人", "騎馬隊", i < 9, i),
        term: 1,
        savedAt: i,
      })),
      { id: 99, line: line("名人", "少数兵", true, 30), term: 1, savedAt: 99 },
    ];
    const html = renderToStaticMarkup(
      <MetaTab log={log} onSelectUnit={() => {}} onSelectWarlord={() => {}} />,
    );
    expect(html).toContain("騎馬隊");
    expect(html).toContain("9勝3敗");
    expect(html).toContain("普段 ");
    expect(html).toContain('<option value="10" selected="">10戦以上</option>');
    expect(html).not.toContain("少数兵");
  });
});
