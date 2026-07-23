import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UnitType } from "@/lib/types";
import { UnitEditModal } from "./UnitEditModal";

const UNIT: UnitType = {
  name: "剛弓僧兵",
  category: "弓兵",
  goodAgainst: "歩兵:壁:",
  attack: 120,
  defense: 80,
  cost: "米:600",
  tech: "弓術",
  years: "36年",
  reqStats: "武力:40",
  facility: "鉄工所,南蛮町",
  special: "先制攻撃",
  bonus: "兵種アタック+12%",
};

function renderModal(isNew = false, initial = UNIT) {
  return renderToStaticMarkup(
    <UnitEditModal
      initial={initial}
      isNew={isNew}
      statOptions={["魅力"]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onDeleted={vi.fn()}
    />
  );
}

describe("UnitEditModalの初期DOM", () => {
  it("Enterで送信できるformと3つの入力グループを提供する", () => {
    const markup = renderModal();

    expect(markup).toContain('<form class="unit-edit-form"');
    expect(markup).toContain('novalidate=""');
    expect(markup).toContain('aria-busy="false"');
    expect(markup.match(/<fieldset class="unit-form-section">/g)).toHaveLength(
      3
    );
    expect(markup).toContain("<legend>基本情報</legend>");
    expect(markup).toContain("<legend>雇用・条件</legend>");
    expect(markup).toContain("<legend>特性・効果</legend>");
    expect(markup).toContain('type="submit"');
    expect(markup).toContain(">保存する</button>");
  });

  it("兵種名の必須条件とエラーの関連先を初期状態から公開する", () => {
    const markup = renderModal(true, { ...UNIT, name: "" });
    const nameInput = markup.match(/<input[^>]*id="unit-name"[^>]*>/)?.[0];

    expect(markup).toContain("<span>兵種名（必須）</span>");
    expect(nameInput).toBeDefined();
    expect(nameInput).toContain('required=""');
    expect(nameInput).toContain('aria-invalid="false"');
    expect(nameInput).toContain(
      'aria-describedby="unit-name-requirement"'
    );
    expect(markup).toContain('id="unit-name-requirement"');
    expect(markup).toContain("兵種名は必須です");
  });

  it("複合入力をlabelで包まず、入力値と個別の名前を維持する", () => {
    const markup = renderModal();

    expect(markup.match(/role="group"/g)).toHaveLength(3);
    expect(markup).toContain('aria-labelledby="unit-cost-label"');
    expect(markup).toContain('aria-labelledby="unit-years-label"');
    expect(markup).toContain(
      'aria-labelledby="unit-required-stats-label"'
    );
    expect(markup).not.toContain(
      '<label class="filter"><span id="unit-cost-label">'
    );
    expect(markup).not.toContain(
      '<label class="filter"><span id="unit-years-label">'
    );
    expect(markup).not.toContain(
      '<label class="filter"><span id="unit-required-stats-label">'
    );

    for (const value of [
      "剛弓僧兵",
      "弓兵",
      "120",
      "80",
      "600",
      "36",
      "40",
      "弓術",
      "歩兵:壁:",
      "鉄工所,南蛮町",
      "先制攻撃",
      "兵種アタック+12%",
    ]) {
      expect(markup).toContain(value);
    }
    expect(markup).toContain('aria-label="雇用コストの種類（金・米）"');
    expect(markup).toContain('aria-label="雇用コストの金額"');
    expect(markup).toContain('aria-label="必要年数"');
    expect(markup).toContain('aria-label="必要能力値の種類"');
    expect(markup).toContain('aria-label="必要能力値の数値"');
  });
});
