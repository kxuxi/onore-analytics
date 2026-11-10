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

const render = (noun: string, entries: EquipStat[] = [ENTRY]) =>
  renderToStaticMarkup(
    <EquipCatalogResults
      entries={entries}
      noun={noun}
      onSelectWarlord={vi.fn()}
      onSelectEquip={vi.fn()}
    />
  );

describe("EquipCatalogResults", () => {
  it("名前・使用・勝率（勝敗）・主な使い手を1つの表に出す", () => {
    const html = render("武器");

    for (const heading of ["武器", "使用", "勝率", "主な使い手"]) {
      expect(html).toContain(`>${heading}</th>`);
    }
    for (const value of ["名刀", "12回", "70.0%", "7勝3敗", "武将甲", "×7"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("<caption class=\"sr-only\">武器図鑑</caption>");
    // 攻守の内訳とカード表示は持たない。
    expect(html).not.toContain("攻 / 守");
    expect(html).not.toContain("catalog-card");
  });

  it("品物の表記に切り替える", () => {
    const html = render("品物");
    expect(html).toContain(">品物</th>");
    expect(html).toContain("品物図鑑");
  });

  it("勝敗が決まっていない装備の勝率は - にする", () => {
    const html = render("武器", [{ ...ENTRY, decided: 0, wins: 0, losses: 0 }]);
    expect(html).not.toContain("勝率</span>");
    expect(html).toContain('class="catalog-dash">-<');
  });
});
