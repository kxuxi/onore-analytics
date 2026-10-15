import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { DbTab } from "./DbTab";
import { EquipSynergyTab } from "./EquipSynergyTab";
import { MetaTab } from "./MetaTab";
import { TraitMatrixTab } from "./TraitMatrixTab";

const DB: WarlordMap = {
  信長: {
    name: "信長",
    faction: "織田家",
    type: "武特",
    branch: "騎兵",
    unit: "騎馬隊",
    lastActionAt: "04/10 10:00",
    updatedAt: 1,
  },
};

const SYNERGY_LOG: BattleRecord[] = Array.from(
  { length: 10 },
  (_, index) => {
    const day = String(index + 10).padStart(2, "0");
    const time = `04/${day} 10:00`;
    return {
      line: `【1戦目】 1600年4月 ${time} 京都 織田 信長 織田家 武特 騎馬隊 騎兵 金の腕輪 鬼丸 V.S. 武田 勝頼 武田家 統特 足軽隊 歩兵 なし なし 信長の勝利 12`,
      time: `1600年4月 ${time}`,
      term: 145,
      savedAt: index,
    };
  }
);

describe("データ表のcaption", () => {
  it("DB確認表の内容を読み上げ専用captionで説明する", () => {
    const markup = renderToStaticMarkup(
      <DbTab
        db={DB}
        log={[]}
        colors={{}}
        onSelectWarlord={vi.fn()}
        onSelectFaction={vi.fn()}
        onImportStats={vi.fn()}
      />
    );

    expect(markup).toContain(
      '<caption class="sr-only">登録済み武将の所属国、タイプ、兵種、行動時間、更新日時の一覧</caption>'
    );
  });

  it("装備シナジー表の内容を読み上げ専用captionで説明する", () => {
    const markup = renderToStaticMarkup(
      <EquipSynergyTab
        log={SYNERGY_LOG}
        onSelectWarlord={vi.fn()}
        onSelectEquip={vi.fn()}
      />
    );

    expect(markup).toContain(
      '<caption class="sr-only">武器と品物の組み合わせ別の使用回数、勝率、主な使用武将の一覧</caption>'
    );
    expect(markup).toContain('aria-label="集計期間"');
    expect(markup).toContain('aria-pressed="true" class="tmx-period active">過去10年間</button>');
    expect(markup).toContain('aria-pressed="false" class="tmx-period">全期間</button>');
    expect(markup).not.toContain('class="stat-grid"');
    expect(markup).not.toContain("組み合わせ数");
    expect(markup).toContain('<span>武将タイプ</span>');
    expect(markup).toContain('<option value="武特">武特</option>');
    expect(markup).toContain('<option value="統特">統特</option>');
  });

  it("環境ダッシュボードは戦闘数順で、採用率も併記する", () => {
    const markup = renderToStaticMarkup(
      <MetaTab log={SYNERGY_LOG} onSelectUnit={vi.fn()} />
    );

    expect(markup).toContain("戦闘数 TOP 10");
    expect(markup).toContain("戦闘 <strong>10</strong>戦・採用");
  });

  it("相性表の軸を読み上げ専用captionで説明する", () => {
    const markup = renderToStaticMarkup(
      <TraitMatrixTab
        log={SYNERGY_LOG}
        factionColors={{}}
        onSelectWarlord={vi.fn()}
        onSelectUnit={vi.fn()}
        onSelectEquip={vi.fn()}
      />
    );

    expect(markup).toContain(
      '<caption class="sr-only">出兵側と守備側の武将タイプ別勝率相性表</caption>'
    );
    expect(markup.indexOf('aria-pressed="true" class="tmx-period active">全期間</button>')).toBeLessThan(
      markup.indexOf('aria-pressed="false" class="tmx-period">過去10年間</button>')
    );
    expect(markup.indexOf('aria-pressed="false" class="tmx-period">過去10年間</button>')).toBeLessThan(
      markup.indexOf('aria-pressed="false" class="tmx-period">06年-11年</button>')
    );
  });
});
