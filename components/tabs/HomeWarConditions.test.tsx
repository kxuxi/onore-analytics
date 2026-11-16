import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BattleRecord, Warlord } from "@/lib/types";
import { HomeWarConditions } from "./HomeWarConditions";

const me: Warlord = {
  name: "自分", faction: "自国", household: "自分家", type: "知特", branch: "歩兵",
  term: 151, updatedAt: 0, intelligence: 80,
};
const enemy: Warlord = {
  name: "相手", faction: "敵国", household: "相手家", type: "知特", branch: "歩兵",
  term: 151, updatedAt: 0, intelligence: 75,
};
const record = (item = "金の宝珠"): BattleRecord => ({
  line: `【1戦目】 1650年1月 10/30 12:00 京都 自国 自分 自分家 知特 乱破 歩兵 銀の宝珠 なし V.S. 敵国 相手 相手家 知特 乱破 歩兵 ${item} なし 自分の勝利 10`,
  term: 151, savedAt: 0,
});

describe("HomeWarConditionsの装備補正", () => {
  it("初期表示から双方の最新装備を含め、個別と全体の解除操作を表示する", () => {
    const html = renderToStaticMarkup(
      <HomeWarConditions me={me} db={{ 自分: me, 相手: enemy }} log={[record()]} onSelectWarlord={() => {}} />
    );
    expect(html).toContain("自分の知力 100");
    expect(html).toContain("❌ 非該当 1人");
    expect(html).toContain("⭕ 該当 0人");
    expect(html).toContain('class="home-war-val">105');
    expect(html).toContain("自分−5");
    expect(html).toContain("銀の宝珠");
    expect(html).toContain("知力+20");
    expect(html).toContain("金の宝珠");
    expect(html).toContain("知力+30");
    expect(html).toContain("1650年1月 10/30 12:00");
    expect(html).toContain("装備品を計算に含める");
    expect(html).toContain('aria-label="自分の装備補正を反映" checked=""');
    expect(html).toContain('aria-label="相手の装備補正を反映" checked=""');
  });

  it("効果が不明な品物は補正ゼロで断定せず、判定保留にも解除操作を表示する", () => {
    const html = renderToStaticMarkup(
      <HomeWarConditions me={me} db={{ 自分: me, 相手: enemy }} log={[record("まだ知らない品物")]} onSelectWarlord={() => {}} />
    );
    expect(html).toContain("能力値・装備が未確認で判定できない 1人");
    expect(html).toContain("まだ知らない品物");
    expect(html).toContain("補正値未確認");
    expect(html).toContain('aria-label="相手の装備補正を反映"');
    expect(html).toContain("⭕ 該当 0人");
    expect(html).toContain("❌ 非該当 0人");
  });
});
