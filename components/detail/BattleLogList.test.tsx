import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleSide } from "@/lib/parser";
import type { BattleOutcome } from "@/lib/stats";
import { BattleLogList } from "./BattleLogList";

function makeOutcome(index: number): BattleOutcome {
  const suffix = String(index).padStart(3, "0");
  const left: BattleSide = {
    faction: "東軍",
    name: `武将-${suffix}`,
    type: "武特",
    unit: "重騎兵",
    branch: "騎兵",
    equips: ["銀時計", "火縄銃"],
    equip1: "銀時計",
    equip2: "火縄銃",
  };
  const right: BattleSide = {
    faction: "西軍",
    name: `対戦相手-${suffix}`,
    type: "統特",
    unit: "長槍兵",
    branch: "歩兵",
    equips: ["軍配", "太刀"],
    equip1: "軍配",
    equip2: "太刀",
  };
  const record = {
    id: index,
    line: `1600年の戦闘-${suffix}`,
    time: `1600年4月 04/${String(index).padStart(2, "0")} 12:00`,
    term: 1,
    savedAt: index,
  };
  const card = {
    battleAt: record.time,
    left,
    right,
    winner: "left" as const,
    resultRaw: `${left.name}の勝利`,
    url: `https://example.com/battle/${index}`,
  };

  return {
    record,
    card,
    side: "left",
    self: left,
    opponent: right,
    result: "win",
  };
}

describe("BattleLogList", () => {
  it("21件では初期ページに20枚だけ表示し、全件数とページ位置を示す", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        outcomes={Array.from({ length: 21 }, (_, index) =>
          makeOutcome(index + 1)
        )}
        factionColors={{}}
        onSelectWarlord={vi.fn()}
        onSelectUnit={vi.fn()}
        onSelectEquip={vi.fn()}
      />
    );

    expect(html.match(/<li class="bh-card\b/g)).toHaveLength(20);
    expect(html.match(/bh-card--subdued/g)).toHaveLength(20);
    expect(html).toContain("武将-001");
    expect(html).toContain("武将-020");
    expect(html).not.toContain("武将-021");
    expect(html).toMatch(/1–20\s*\/\s*21件（1\s*\/\s*2\s*）/);
    expect(html).not.toContain("表示する年");
  });
});
