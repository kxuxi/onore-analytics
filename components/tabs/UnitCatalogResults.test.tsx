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

function renderResults(
  sortKey: "name" | "attack" = "name",
  sortDirection: "asc" | "desc" = "asc"
) {
  return renderToStaticMarkup(
    <UnitCatalogResults
      units={[UNIT]}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={vi.fn()}
      onSelectUnit={vi.fn()}
    />
  );
}

describe("UnitCatalogResults", () => {
  it("Desktop表の既存8列と全値を維持し、カードも同じ兵種を表示する", () => {
    const html = renderResults();

    for (const heading of [
      "兵種",
      "種類",
      "得意",
      "攻",
      "防",
      "雇用",
      "必要",
      "ボーナス",
    ]) {
      expect(html).toContain(`>${heading}<`);
    }
    for (const value of [
      "テスト騎兵",
      "騎兵",
      "歩兵",
      "弓兵",
      "80",
      "40",
      "金:500",
      "統率:70",
      "兵種アタック+5%",
    ]) {
      expect(html).toContain(value);
    }
    expect(
      html.match(/title="テスト騎兵 の詳細を見る"/g)
    ).toHaveLength(2);
    expect(html).toContain('class="table-wrap catalog-full-table"');
    expect(html).toContain('class="catalog-card-list"');
    expect(html).toContain("一覧の詳細を表示");
    expect(html).toContain('class="sr-only">：テスト騎兵</span>');
  });

  it("現在の並び順をDesktop見出しと狭幅用コントロールのARIAへ反映する", () => {
    const html = renderResults("attack", "desc");

    expect(html).toContain('aria-sort="descending"');
    expect(html.match(/aria-sort="none"/g)).toHaveLength(7);
    expect(html).toContain("攻は現在降順。昇順へ切り替える");
    expect(html).toContain("攻を昇順へ切り替える");
    expect(html).toContain('value="attack" selected=""');
  });

  it("一覧にない詳細専用項目は追加しない", () => {
    const html = renderResults();

    expect(html).not.toContain("技術:20");
    expect(html).not.toContain("3年");
    expect(html).not.toContain("厩舎");
    expect(html).not.toContain("突撃");
  });
});
