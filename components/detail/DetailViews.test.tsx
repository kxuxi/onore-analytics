import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { EquipDetail } from "@/components/detail/EquipDetail";
import { FactionDetail } from "@/components/detail/FactionDetail";
import { UnitDetail } from "@/components/detail/UnitDetail";
import { WarlordDetail } from "@/components/detail/WarlordDetail";

const BATTLE_LINE = `【2戦目】

1609年1月

06/28 08:06

長束

[東軍 武将甲 甲家 武特 重騎兵 騎兵 金の宝珠 リーチ棒 V.S. 西軍 武将乙 乙家 統特 長槍兵 歩兵 金の腕輪 太刀](https://example.com/battle)

武将甲の勝利

11ターンで終了`;

const LOG: BattleRecord[] = [
  {
    id: 1,
    line: BATTLE_LINE,
    time: "1609年1月 06/28 08:06",
    term: 146,
    savedAt: 1,
  },
];

const DB: WarlordMap = {
  武将甲: {
    name: "武将甲",
    household: "甲家",
    faction: "東軍",
    type: "武特",
    branch: "騎兵",
    unit: "重騎兵",
    term: 146,
    updatedAt: 1,
  },
};

const callbacks = {
  onSelectWarlord: vi.fn(),
  onSelectUnit: vi.fn(),
  onSelectEquip: vi.fn(),
  onBack: vi.fn(),
};

function expectCommonTemplate(
  markup: string,
  kind: string,
  title: string
) {
  const labelledBy = markup.match(
    /<section class="panel detail-panel" aria-labelledby="([^"]+)"/
  )?.[1];

  expect(labelledBy).toBeTruthy();
  expect(markup).toContain(`<h2 id="${labelledBy}" tabindex="-1"`);
  expect(markup).toContain(`>${title}</h2>`);
  expect(markup).toContain(`class="detail-kind">${kind}</span>`);
  expect(markup).toContain("戦績サマリー");
  expect(markup).toContain("戦闘数");
  expect(markup).toContain("戦闘ログ");
  expect(markup).toContain('<ul class="battle-list">');
  expect(markup).toContain('<li class="bh-card');
  expect(markup.indexOf("戦績サマリー")).toBeLessThan(
    markup.indexOf("戦闘ログ")
  );
}

describe("5種の詳細画面", () => {
  it("武将は共通テンプレート内に既存の値とSection順を保つ", () => {
    const markup = renderToStaticMarkup(
      <WarlordDetail
        name="武将甲"
        db={DB}
        log={LOG}
        colors={{}}
        canComment={false}
        isAdmin
        onToggleWatch={vi.fn()}
        onSelectFaction={vi.fn()}
        {...callbacks}
      />
    );

    expectCommonTemplate(markup, "武将", "武将甲");
    expect(markup).toContain("所属国の遍歴");
    expect(markup).toContain('class="detail-rank-row"');
    expect(markup).not.toContain('class="rank-row"');
    expect(markup).toContain('aria-label="戦績カードを画像として保存"');
    expect(markup).toContain('aria-label="ウォッチリストに追加"');
    expect(markup.indexOf("所属国の遍歴")).toBeLessThan(
      markup.indexOf("戦闘ログ")
    );
  });

  it("兵種は共通テンプレート内に既存の戦績と戦闘ログを保つ", () => {
    const markup = renderToStaticMarkup(
      <UnitDetail name="重騎兵" log={LOG} colors={{}} {...callbacks} />
    );

    expectCommonTemplate(markup, "兵種", "重騎兵");
    expect(markup).toContain("武将甲");
  });

  it.each([
    { kind: "武器", slot: "weapon" as const, name: "リーチ棒" },
    { kind: "品物", slot: "item" as const, name: "金の宝珠" },
  ])("$kind は同じテンプレートでも集計対象を維持する", ({ kind, slot, name }) => {
    const markup = renderToStaticMarkup(
      <EquipDetail
        name={name}
        slot={slot}
        log={LOG}
        colors={{}}
        {...callbacks}
      />
    );

    expectCommonTemplate(markup, kind, name);
    expect(markup).toContain("武将甲");
  });

  it("国は国色・所属武将・既存のSection順を維持する", () => {
    const markup = renderToStaticMarkup(
      <FactionDetail
        name="東軍"
        db={DB}
        log={LOG}
        colors={{ 東軍: "#336699" }}
        canViewLatestUnits={false}
        {...callbacks}
      />
    );

    expectCommonTemplate(markup, "国", "東軍");
    expect(markup).toContain("color:#336699");
    expect(markup).toContain("所属武将");
    expect(markup.indexOf("所属武将")).toBeLessThan(
      markup.indexOf("戦闘ログ")
    );
  });

  it("5種の空状態は文言を変えず共通構造を使う", () => {
    const emptyViews = [
      renderToStaticMarkup(
        <WarlordDetail
          name="不明武将"
          db={{}}
          log={[]}
          colors={{}}
          canComment={false}
          onSelectFaction={vi.fn()}
          {...callbacks}
        />
      ),
      renderToStaticMarkup(
        <UnitDetail name="不明兵種" log={[]} colors={{}} {...callbacks} />
      ),
      renderToStaticMarkup(
        <EquipDetail
          name="不明武器"
          slot="weapon"
          log={[]}
          colors={{}}
          {...callbacks}
        />
      ),
      renderToStaticMarkup(
        <EquipDetail
          name="不明品物"
          slot="item"
          log={[]}
          colors={{}}
          {...callbacks}
        />
      ),
      renderToStaticMarkup(
        <FactionDetail
          name="不明国"
          db={{}}
          log={[]}
          colors={{}}
          canViewLatestUnits={false}
          {...callbacks}
        />
      ),
    ];

    for (const markup of emptyViews) {
      expect(markup).toContain('class="empty"');
      expect(markup).toContain('class="empty-title"');
      expect(markup).toContain('class="empty-hint"');
    }
    expect(emptyViews[0]).toContain("武将が見つかりません");
    expect(emptyViews[1]).toContain("この兵種の戦闘データがありません");
    expect(emptyViews[2]).toContain("この武器の戦闘履歴がまだありません");
    expect(emptyViews[3]).toContain("この品物の戦闘履歴がまだありません");
    expect(emptyViews[4]).toContain("この国のデータがありません");
  });
});
