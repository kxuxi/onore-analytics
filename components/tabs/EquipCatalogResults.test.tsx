import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EquipStat } from "@/lib/stats";
import { EquipCatalogResults } from "./EquipCatalogResults";

const ENTRY: EquipStat = {
  name: "名刀",
  battles: 12,
  wins: 7,
  losses: 3,
  others: 2,
  decided: 10,
  winRate: 0.7,
  attackUses: 8,
  defenseUses: 4,
  topUsers: [
    { name: "武将甲", count: 7 },
    { name: "武将乙", count: 5 },
  ],
};

function renderResults(noun: string, slotLabel: string) {
  return renderToStaticMarkup(
    <EquipCatalogResults
      entries={[ENTRY]}
      noun={noun}
      slotLabel={slotLabel}
      onSelectWarlord={vi.fn()}
      onSelectEquip={vi.fn()}
    />
  );
}

describe("EquipCatalogResults", () => {
  it("武器のDesktop5列とカードで同じ集計値・導線名を表示する", () => {
    const html = renderResults("武器", "武将の持つ武器");

    for (const heading of [
      "武将の持つ武器",
      "使用回数",
      "勝率",
      "攻 / 守",
      "主な使用武将",
    ]) {
      expect(html).toContain(heading);
    }
    for (const value of ["名刀", "12", "70.0%", "7/10", "8 / 4", "武将甲"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('class="table-wrap catalog-full-table"');
    expect(html).toContain('aria-label="武器一覧"');
    expect(html).toContain("一覧の詳細を表示");
    expect(html).toContain('class="sr-only">：名刀</span>');
  });

  it("品物の公開表記をそのまま切り替える", () => {
    const html = renderResults("品物", "武将の持つ品物");

    expect(html).toContain("武将の持つ品物");
    expect(html).toContain("品物図鑑");
    expect(html).toContain('aria-label="品物一覧"');
  });
});
