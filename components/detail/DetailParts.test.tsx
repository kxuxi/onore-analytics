import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleSide } from "@/lib/parser";
import type { BattleOutcome, StatSummary } from "@/lib/stats";
import type { YearRangeFilter } from "@/components/detail/YearRangeFilter";
import {
  DetailBattleLogSection,
  DetailEmptyState,
  DetailPage,
  DetailSummary,
  DetailHeader,
  StatCards,
  WinRateBar,
} from "./DetailParts";

const SUMMARY: StatSummary = {
  battles: 10,
  wins: 7,
  losses: 2,
  others: 1,
  decided: 9,
  winRate: 7 / 9,
};

function makeOutcome(
  year: number,
  selfName: string,
  opponentName: string
): BattleOutcome {
  const self: BattleSide = {
    faction: "東軍",
    name: selfName,
    type: "武特",
    unit: "重騎兵",
    branch: "騎兵",
    equips: [],
  };
  const opponent: BattleSide = {
    faction: "西軍",
    name: opponentName,
    type: "統特",
    unit: "長槍兵",
    branch: "歩兵",
    equips: [],
  };
  const record = {
    line: `${year}年の戦闘`,
    time: `${year}年4月 04/01 12:00`,
    term: 1,
    savedAt: year,
  };
  const card = {
    battleAt: `${year}年4月 04/01 12:00`,
    left: self,
    right: opponent,
    winner: "left" as const,
    resultRaw: `${selfName}の勝利`,
    url: `https://example.com/battle/${year}`,
  };

  return {
    record,
    card,
    side: "left",
    self,
    opponent,
    result: "win",
  };
}

describe("DetailPage", () => {
  it("共通外枠と見出しを関連付け、childrenの順序を維持する", () => {
    const html = renderToStaticMarkup(
      <DetailPage
        kind="武将"
        title="武将甲"
        tags={<span>騎兵</span>}
        actions={<button type="button">固有操作</button>}
        onBack={vi.fn()}
      >
        <p>最初の内容</p>
        <p>次の内容</p>
      </DetailPage>
    );
    const labelledBy = html.match(
      /<section class="panel detail-panel" aria-labelledby="([^"]+)"/
    )?.[1];

    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`<h2 id="${labelledBy}" tabindex="-1">武将甲</h2>`);
    expect(html).toContain("武将");
    expect(html).toContain("騎兵");
    expect(html).toContain("固有操作");
    expect(html).toContain("このページのリンクをコピー");
    expect(html.indexOf("最初の内容")).toBeLessThan(
      html.indexOf("次の内容")
    );
    expect(html.indexOf("detail-head")).toBeLessThan(
      html.indexOf("最初の内容")
    );
  });
});

describe("DetailSummary", () => {
  it("見出し・既存StatCards・既存WinRateBarを同じ順序で表示する", () => {
    const html = renderToStaticMarkup(<DetailSummary summary={SUMMARY} />);
    const labelledBy = html.match(
      /<section class="detail-summary" aria-labelledby="([^"]+)"/
    )?.[1];

    expect(labelledBy).toBeTruthy();
    expect(html).toContain(
      `<h3 id="${labelledBy}" class="detail-summary-title">戦績サマリー</h3>`
    );
    expect(html).toContain("戦闘数");
    expect(html).toContain("勝利");
    expect(html).toContain("敗北");
    expect(html).toContain("77.8%");
    expect(html).toContain("撤退・引分");
    expect(html.indexOf("戦績サマリー")).toBeLessThan(
      html.indexOf("stat-grid detail-stats")
    );
    expect(html.indexOf("stat-grid detail-stats")).toBeLessThan(
      html.indexOf("wr-bar")
    );
  });

  it("既存の公開部品を単独でも利用できる", () => {
    const html = renderToStaticMarkup(
      <>
        <DetailHeader kind="兵種" title="重騎兵" onBack={vi.fn()} />
        <StatCards summary={SUMMARY} />
        <WinRateBar summary={SUMMARY} />
      </>
    );

    expect(html).toContain(">兵種</span>");
    expect(html).toContain(">重騎兵</h2>");
    expect(html).toContain('class="stat-grid detail-stats"');
    expect(html).toContain('class="wr-bar"');
  });
});

describe("DetailEmptyState", () => {
  it("現行クラスとtitle・hint・任意childrenの順序を維持する", () => {
    const html = renderToStaticMarkup(
      <DetailEmptyState title="データがありません" hint="条件を確認してください">
        <button type="button">一覧へ戻る</button>
      </DetailEmptyState>
    );

    expect(html).toContain('class="empty"');
    expect(html).toContain(
      '<p class="empty-title">データがありません</p>'
    );
    expect(html).toContain(
      '<p class="empty-hint">条件を確認してください</p>'
    );
    expect(html.indexOf("データがありません")).toBeLessThan(
      html.indexOf("条件を確認してください")
    );
    expect(html.indexOf("条件を確認してください")).toBeLessThan(
      html.indexOf("一覧へ戻る")
    );
  });

  it("titleとhintがない既存の簡易空状態も表現できる", () => {
    const html = renderToStaticMarkup(
      <DetailEmptyState>該当する履歴がありません。</DetailEmptyState>
    );

    expect(html).toBe(
      '<div class="empty">該当する履歴がありません。</div>'
    );
  });
});

describe("DetailBattleLogSection", () => {
  it("件数・強調対象・外部年フィルターをBattleLogListへ透過する", () => {
    const shown = makeOutcome(1600, "武将甲", "武将乙");
    const excluded = makeOutcome(1700, "表示しない武将", "別の武将");
    const yearFilter: YearRangeFilter = {
      years: [1700, 1600],
      fromYear: 1600,
      toYear: 1600,
      setFromYear: vi.fn(),
      setToYear: vi.fn(),
      isFiltered: true,
      reset: vi.fn(),
      filtered: [shown],
    };
    const html = renderToStaticMarkup(
      <DetailBattleLogSection
        count="2件"
        outcomes={[shown, excluded]}
        currentName="武将甲"
        currentUnit="重騎兵"
        onSelectWarlord={vi.fn()}
        onSelectUnit={vi.fn()}
        yearFilter={yearFilter}
      />
    );

    expect(html).toContain('class="detail-section"');
    expect(html).toContain("戦闘ログ");
    expect(html).toContain("2件");
    expect(html).toContain('class="dl-name active"');
    expect(html).toContain('class="dl-unit active"');
    expect(html).toContain("武将甲");
    expect(html).not.toContain("表示しない武将");
    expect(html).not.toContain("表示する年");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(
      'aria-label="戦闘ログのリンクをコピー：武将甲 対 武将乙、1600年4月 04/01 12:00"'
    );
    expect(html).toContain(
      'aria-label="戦闘ログの詳細を開く：武将甲 対 武将乙、1600年4月 04/01 12:00"'
    );
  });
});
