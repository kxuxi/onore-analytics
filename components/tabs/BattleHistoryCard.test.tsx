import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleRecord } from "@/lib/types";
import type { BattleCard } from "@/lib/parser";
import { BattleHistoryCard } from "./BattleHistoryCard";

const RECORD: BattleRecord = {
  id: 42,
  line: "戦闘履歴の生テキスト",
  time: "1600年4月 04/01 12:34",
  term: 1,
  savedAt: 123,
};

const CARD: BattleCard = {
  battleNo: "12戦目",
  place: "関ヶ原",
  battleAt: "1600年4月 04/01 12:34",
  turns: "8",
  left: {
    faction: "東軍",
    name: "武将甲",
    family: "甲家",
    type: "武特",
    unit: "*精鋭隊(ライフル銃兵)",
    branch: "歩兵",
    equips: ["*名品(銀時計)", "火縄銃"],
    equip1: "*名品(銀時計)",
    equip2: "火縄銃",
  },
  right: {
    faction: "西軍",
    name: "武将乙",
    family: "乙家",
    type: "統特",
    unit: "重騎兵",
    branch: "騎兵",
    equips: ["軍配", "太刀"],
    equip1: "軍配",
    equip2: "太刀",
  },
  winner: "left",
  resultRaw: "武将甲の勝利",
  url: "https://example.com/battles/42?from=history",
};

function renderCard(
  card: BattleCard | null = CARD,
  record: BattleRecord = RECORD
) {
  return renderToStaticMarkup(
    <BattleHistoryCard
      record={record}
      card={card}
      factionColors={{ 東軍: "#116611", 西軍: "#881111" }}
      highlight="武将"
      antiIndex={new Map([["ライフル銃兵", new Set(["騎兵"])]])}
      onSelectWarlord={vi.fn()}
      onSelectUnit={vi.fn()}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      canDelete
    />
  );
}

describe("BattleHistoryCard", () => {
  it("結果・日時・勝者を示した対戦者を先に、補足情報を同一DOMの第二階層に表示する", () => {
    const html = renderCard();
    const primaryIndex = html.indexOf('<header class="bh-primary">');
    const matchupIndex = html.indexOf('class="bh-matchup"');
    const primaryHtml = html.slice(primaryIndex, matchupIndex);

    expect(primaryHtml.indexOf("勝利")).toBeLessThan(
      primaryHtml.indexOf("1600年4月")
    );
    expect(primaryHtml).not.toContain('class="bh-winner"');
    expect(html).toContain(
      'class="bh-participant bh-participant--winner"'
    );
    expect(html).toContain(
      "color:color-mix(in srgb, #116611 32%, var(--text))"
    );
    expect(html).toContain('class="bh-winner-icon"');
    expect(html).toContain('class="sr-only">勝者：</span><mark');
    expect(html).toContain("12戦目");
    expect(html).toContain("関ヶ原");
    expect(html).toContain("8ターン");
    expect(html).toContain("東軍");
    expect(html).toContain("西軍");

    const unitIndex = html.indexOf("ライフル銃兵");
    const branchIndex = html.indexOf("歩兵");
    const itemIndex = html.indexOf("銀時計");
    const weaponIndex = html.indexOf("火縄銃");
    expect(unitIndex).toBeGreaterThan(-1);
    expect(unitIndex).toBeLessThan(branchIndex);
    expect(branchIndex).toBeLessThan(itemIndex);
    expect(itemIndex).toBeLessThan(weaponIndex);
    expect(html).toContain("アンチを取っている");
  });

  it("開閉UIを第二階層と関連付け、カード全体の導線を実リンクで提供する", () => {
    const html = renderCard();
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1];

    expect(controls).toBeTruthy();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`id="${controls}"`);
    expect(html).toContain('data-expanded="false"');
    expect(html).toContain("戦闘情報を表示");
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain("tabindex=");
    expect(html).toContain(
      'class="bh-card-overlay" href="https://example.com/battles/42?from=history"'
    );
    expect(html).toContain(
      'aria-label="戦闘ログを開く：勝利、1600年4月 04/01 12:34、武将甲 対 武将乙"'
    );
  });

  it("URLのコピー・外部遷移・削除を明示操作として維持する", () => {
    const html = renderCard();

    expect(html).toContain(
      'aria-label="戦闘ログのリンクをコピー：武将甲 対 武将乙"'
    );
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain(
      'aria-label="戦闘ログの詳細を開く：武将甲 対 武将乙"'
    );
    expect(html).toContain(
      'href="https://example.com/battles/42?from=history"'
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(
      'aria-label="戦闘履歴を削除：武将甲 対 武将乙"'
    );
  });

  it("右側勝利、引分、撤退、不明をテキストと形で識別できる", () => {
    const rightWin = renderCard({ ...CARD, winner: "right" });
    expect(rightWin).toContain("bh-result bh-result--right");
    expect(rightWin).toMatch(
      /bh-participant bh-participant--winner[^>]+title="武将乙 の戦績を見る"/
    );

    for (const [winner, resultRaw, label] of [
      ["draw", "引き分け", "引分"],
      ["retreat", "撤退しました", "撤退"],
      ["unknown", "判定不能", "判定不能"],
    ] as const) {
      const html = renderCard({ ...CARD, winner, resultRaw });
      expect(html).toContain(`bh-result bh-result--${winner}`);
      expect(html).toContain(`>${label}</span>`);
      expect(html).not.toContain("bh-participant--winner");
    }
  });

  it("URLや補足値がない場合は、存在しない操作や値を追加しない", () => {
    const html = renderToStaticMarkup(
      <BattleHistoryCard
        record={{ ...RECORD, id: undefined, time: undefined }}
        card={{
          ...CARD,
          battleNo: undefined,
          place: undefined,
          battleAt: undefined,
          turns: undefined,
          url: undefined,
        }}
        factionColors={{}}
        highlight=""
        antiIndex={new Map()}
        onSelectWarlord={vi.fn()}
        onSelectUnit={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(html).not.toContain('class="bh-time"');
    expect(html).not.toContain('class="bh-context"');
    expect(html).not.toContain("bh-action--copy");
    expect(html).not.toContain("bh-action--open");
    expect(html).not.toContain("bh-action--delete");
    expect(html).not.toContain("bh-card-overlay");
  });

  it("解析できない履歴は生テキスト・日時・URLを失わず表示する", () => {
    const rawRecord: BattleRecord = {
      ...RECORD,
      line: "武将を解析不能な [履歴](https://example.com/raw/42)",
    };
    const html = renderCard(null, rawRecord);

    expect(html).toContain("1600年4月 04/01 12:34");
    expect(html).toContain("解析不能な");
    expect(html).toContain("<mark");
    expect(html).toContain(
      'href="https://example.com/raw/42"'
    );
    expect(html).toContain("詳細を見る");
    expect(html).not.toContain("戦闘情報を表示");
    expect(html).not.toContain("戦闘履歴を削除");
  });
});
