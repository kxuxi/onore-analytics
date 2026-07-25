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
  record: BattleRecord = RECORD,
  highlight = "武将"
) {
  return renderToStaticMarkup(
    <BattleHistoryCard
      record={record}
      card={card}
      factionColors={{ 東軍: "#116611", 西軍: "#881111" }}
      highlight={highlight}
      antiIndex={new Map([["ライフル銃兵", new Set(["騎兵"])]])}
      onSelectWarlord={vi.fn()}
      onSelectUnit={vi.fn()}
      onSelectEquip={vi.fn()}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      canDelete
    />
  );
}

describe("BattleHistoryCard", () => {
  it("結果・日時・共通情報の後に、役割・国・勝敗を明示した両陣営を表示する", () => {
    const html = renderCard();
    const primaryIndex = html.indexOf('<header class="bh-primary">');
    const matchupIndex = html.indexOf('class="bh-matchup"');
    const primaryHtml = html.slice(primaryIndex, matchupIndex);

    expect(primaryHtml.indexOf("出兵側の勝利")).toBeLessThan(
      primaryHtml.indexOf("1600年4月")
    );
    expect(primaryHtml).toContain("ゲーム内");
    expect(primaryHtml).toContain("実日時");
    expect(primaryHtml).toContain("12戦目");
    expect(primaryHtml).toContain("都市");
    expect(primaryHtml).toContain("関ヶ原");
    expect(primaryHtml).toContain("8ターン");
    expect(html).toContain(
      'class="bh-side bh-side--attacker bh-side--winner"'
    );
    expect(html).toContain(
      'class="bh-side bh-side--defender bh-side--loser"'
    );
    expect(html).toContain('aria-label="出兵側：武将甲、勝者"');
    expect(html).toContain('aria-label="守備側：武将乙、敗者"');
    expect(html).toContain(
      "color:color-mix(in srgb, #116611 32%, var(--text))"
    );
    expect(html).toContain('class="bh-winner-icon"');
    expect(html).toContain(">勝者</span>");
    expect(html).toContain(">敗者</span>");
    expect(html).toContain('class="bh-side-role">出兵側</span>');
    expect(html).toContain('class="bh-side-role">守備側</span>');
    expect(html).toContain(
      '<span class="bh-faction" style="color:color-mix(in srgb, #116611 32%, var(--text))">東軍</span>'
    );
    expect(html).toContain(
      '<span class="bh-faction" style="color:color-mix(in srgb, #881111 32%, var(--text))">西軍</span>'
    );

    const unitIndex = html.indexOf("ライフル銃兵");
    const branchIndex = html.indexOf("歩兵");
    const itemIndex = html.indexOf("銀時計");
    const weaponIndex = html.indexOf("火縄銃");
    expect(unitIndex).toBeGreaterThan(-1);
    expect(unitIndex).toBeLessThan(branchIndex);
    expect(branchIndex).toBeLessThan(itemIndex);
    expect(itemIndex).toBeLessThan(weaponIndex);
    expect(html).toContain("アンチを取っている");
    expect(html).toContain(
      'class="anti-arrow anti-arrow--up" role="img"'
    );
  });

  it("兵種・装備だけを開閉領域にし、カード全体の導線を実リンクで提供する", () => {
    const html = renderCard();
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1];

    expect(controls).toBeTruthy();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`id="${controls}"`);
    expect(html).toContain('data-expanded="false"');
    expect(html).toContain("兵種・装備を表示");
    expect(html).toContain("出兵側の兵種・装備");
    expect(html).toContain("守備側の兵種・装備");
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain("tabindex=");
    expect(html).toContain(
      'class="bh-card-overlay" href="https://example.com/battles/42?from=history"'
    );
    expect(html).toContain(
      'aria-label="戦闘ログを開く：出兵側の勝利、1600年4月 04/01 12:34、武将甲 対 武将乙"'
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
    expect(html).toContain("<span>詳細</span>");
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
    expect(rightWin).toContain(">守備側の勝利</span>");
    expect(rightWin).toMatch(
      /bh-participant bh-participant--winner[^>]+title="武将乙 の戦績を見る"/
    );
    expect(rightWin).toContain('aria-label="守備側：武将乙、勝者"');
    expect(rightWin).toContain('aria-label="出兵側：武将甲、敗者"');

    for (const [winner, resultRaw, label] of [
      ["draw", "引き分け", "引分"],
      ["retreat", "撤退しました", "撤退"],
      ["unknown", "判定不能", "判定不能"],
    ] as const) {
      const html = renderCard({ ...CARD, winner, resultRaw });
      expect(html).toContain(`bh-result bh-result--${winner}`);
      expect(html).toContain(`>${label}</span>`);
      expect(html).not.toContain("bh-participant--winner");
      expect(html).not.toContain("bh-side-status--winner");
      expect(html).not.toContain("bh-side-status--loser");
    }
  });

  it("品物と武器を正しい図鑑詳細へ移動できるボタンとして表示する", () => {
    const html = renderCard();

    expect(html).toMatch(
      /<button[^>]+class="bh-tag bh-tag--equip bh-tag--highlight bh-tag--interactive"[^>]+title="銀時計 の品物図鑑を見る"/
    );
    expect(html).toMatch(
      /<button[^>]+class="bh-tag bh-tag--equip bh-tag--interactive"[^>]+title="火縄銃 の武器図鑑を見る"/
    );
    expect(html).toMatch(
      /<button[^>]+class="bh-tag bh-tag--equip bh-tag--interactive"[^>]+title="軍配 の品物図鑑を見る"/
    );
    expect(html).toMatch(
      /<button[^>]+class="bh-tag bh-tag--equip bh-tag--interactive"[^>]+title="太刀 の武器図鑑を見る"/
    );
  });

  it("装備枠を判別できない旧形式は誤った図鑑へ案内せず表示を維持する", () => {
    const html = renderCard({
      ...CARD,
      left: {
        ...CARD.left,
        equips: ["旧形式の装備"],
        equip1: undefined,
        equip2: undefined,
      },
    });

    expect(html).toContain(
      '<span class="bh-tag bh-tag--equip">旧形式の装備</span>'
    );
    expect(html).not.toContain("旧形式の装備 の武器図鑑を見る");
    expect(html).not.toContain("旧形式の装備 の品物図鑑を見る");
  });

  it("折りたたみ内の兵種・装備が検索に一致したことを示す", () => {
    const html = renderCard(CARD, RECORD, "銀時計");

    expect(html).toContain('class="bh-disclosure-match">検索一致</span>');
    expect(html).toContain(
      'class="bh-tag bh-tag--equip bh-tag--highlight bh-tag--interactive"'
    );
    expect(html).toContain('<mark class="bh-highlight">銀時計</mark>');
  });

  it("生データの記号付き検索語を表示名へ正規化して一致箇所を示す", () => {
    const html = renderCard(CARD, RECORD, "*名品(銀時計)");

    expect(html).toContain('class="bh-disclosure-match">検索一致</span>');
    expect(html).toContain(
      '<mark class="bh-highlight">銀時計</mark>'
    );
  });

  it("兵種・装備がない場合は空の開閉操作を表示しない", () => {
    const withoutDetails: BattleCard = {
      ...CARD,
      left: {
        ...CARD.left,
        unit: undefined,
        branch: "",
        equips: [],
        equip1: undefined,
        equip2: undefined,
      },
      right: {
        ...CARD.right,
        unit: undefined,
        branch: "",
        equips: [],
        equip1: undefined,
        equip2: undefined,
      },
    };
    const html = renderCard(withoutDetails);

    expect(html).not.toContain("bh-disclosure");
    expect(html).not.toContain("bh-secondary");
  });

  it("未知形式の日時は加工せず表示する", () => {
    const html = renderCard({ ...CARD, battleAt: "日時形式不明" });

    expect(html).toContain('<time class="bh-time">日時形式不明</time>');
    expect(html).not.toContain("bh-time-label");
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
        onSelectEquip={vi.fn()}
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
    expect(html).not.toContain("兵種・装備を表示");
    expect(html).not.toContain("戦闘履歴を削除");
  });
});
