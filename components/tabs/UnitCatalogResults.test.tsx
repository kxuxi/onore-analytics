import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UnitType } from "@/lib/types";
import { UnitCatalogResults } from "./UnitCatalogResults";

const UNIT: UnitType = {
  name: "テスト騎兵",
  category: "騎兵",
  goodAgainst: "歩兵:弓兵",
  attack: 80,
  defense: 40,
  cost: "金:500",
  tech: "技術:20",
  years: "3年",
  reqStats: "統率:70",
  facility: "厩舎",
  special: "突撃",
  bonus: "兵種アタック+5%",
};

const render = (units: UnitType[] = [UNIT]) =>
  renderToStaticMarkup(
    <UnitCatalogResults units={units} onSelectUnit={vi.fn()} />
  );

describe("UnitCatalogResults", () => {
  it("名前・攻撃・防御・得意・雇用/必要/ボーナスを1つの表に出す", () => {
    const html = render();

    for (const heading of ["兵種", "攻撃", "防御", "得意", "雇用・必要能力・ボーナス"]) {
      expect(html).toContain(`>${heading}</th>`);
    }
    for (const value of [
      "テスト騎兵",
      '<span class="catalog-sub">騎兵</span>',
      "80",
      "40",
      "歩兵・弓兵",
      "金:500・統率:70",
      "兵種アタック+5%",
    ]) {
      expect(html).toContain(value);
    }
    expect(html.match(/title="テスト騎兵 の詳細を見る"/g)).toHaveLength(1);
    // カード表示・アコーディオンは持たない。
    expect(html).not.toContain("catalog-card");
    expect(html).not.toContain("一覧の詳細を表示");
  });

  it("一覧にない詳細専用項目は出さない", () => {
    const html = render();
    for (const hidden of ["技術:20", "3年", "厩舎", "突撃"]) {
      expect(html).not.toContain(hidden);
    }
  });

  it("得意・補足が無い兵種は - を表示する", () => {
    const html = render([
      { ...UNIT, goodAgainst: "", cost: "", reqStats: "", bonus: "" },
    ]);
    expect(html.match(/class="catalog-dash">-</g)).toHaveLength(2);
  });
});
