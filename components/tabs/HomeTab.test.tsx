import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BattleRecord } from "@/lib/types";
import { describeWinLossTrend, HomeTab } from "./HomeTab";

const callbacks = {
  onSelectWarlord: vi.fn(),
  onSelectUnit: vi.fn(),
  onSelectFaction: vi.fn(),
  onSelectRanking: vi.fn(),
  onSelectHistory: vi.fn(),
};

function renderHome(log: BattleRecord[] = []) {
  return renderToStaticMarkup(
    <HomeTab log={log} db={{}} colors={{}} {...callbacks} />
  );
}

function battleRecord(
  year: number,
  savedAt: number,
  opponent: string,
  result: string
): BattleRecord {
  const time = `04/${String(savedAt).padStart(2, "0")} 10:00`;
  return {
    line: `【1戦目】 ${year}年4月 ${time} 京都 織田 信長 織田家 武特 鉄砲隊 騎兵 槍 鎧 V.S. 武田 ${opponent} 某家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`,
    time: `${year}年4月 ${time}`,
    term: 1,
    savedAt,
  };
}

describe("HomeTab", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("未選択時は価値説明、検索、2つの補助導線を表示する", () => {
    const html = renderHome();

    expect(html).toContain("自分の武将を選ぶ");
    expect(html).toContain("自分の武将を検索");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("武将ランキングを見る");
    expect(html).toContain("戦闘履歴を見る");
    expect(html).not.toContain("キャンセル");
  });

  it("Cookieに武将があれば従来の選択済みダッシュボードを表示する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderHome();

    expect(html).toContain("信長");
    expect(html).toContain("武将を変更");
    expect(html).toContain("この期の戦闘履歴");
    expect(html).not.toContain("自分の武将を選ぶ");
    expect(html).not.toContain('role="combobox"');
  });

  it("勝敗グラフを色と線種で識別し、数値要約と表captionを提供する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });
    const html = renderHome([
      battleRecord(1600, 1, "勝頼", "信長の勝利"),
      battleRecord(1601, 2, "謙信", "謙信の勝利"),
    ]);

    expect(html).toContain("var(--chart-win)");
    expect(html).toContain("var(--chart-loss)");
    expect(html).toContain("home-line-path--wins");
    expect(html).toContain("home-line-path--losses");
    expect(html).toContain("勝利数（実線）・敗北数（破線）");
    expect(html).toContain("home-series-line--wins");
    expect(html).toContain("home-series-line--losses");
    expect(html).toContain("1600年から1601年までの勝敗数推移");
    expect(html).toContain(
      '<caption class="sr-only">最近の戦闘結果（直近5戦）</caption>'
    );

    const singleYearHtml = renderHome([
      battleRecord(1600, 1, "勝頼", "信長の勝利"),
    ]);
    expect(singleYearHtml).toContain(
      '<circle class="home-line-dot home-line-dot--wins"'
    );
    expect(singleYearHtml).toContain(
      '<rect class="home-line-dot home-line-dot--losses"'
    );
  });

  it("管理者かつonUpdateStats指定時、自分のステータス編集フォームを既存値付きで表示する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
            power: 91,
            intelligence: 84,
            leadership: 88,
            politics: 72,
            strategy: 102.5,
            maxTroops: 50000,
          },
        }}
        colors={{}}
        isAdmin
        onUpdateStats={vi.fn()}
        {...callbacks}
      />
    );

    expect(html).toContain("自分のステータス");
    expect(html).toContain("最大徴兵兵数");
    expect(html).toContain('value="91"');
    expect(html).toContain('value="102.5"');
    expect(html).toContain('value="50000"');
  });

  it("管理者でない、またはonUpdateStats未指定なら編集フォームを表示しない", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderHome();

    expect(html).not.toContain("自分のステータス");
  });
});

describe("describeWinLossTrend", () => {
  it("対象期間、合計勝敗、最多勝利・敗北を数値で説明する", () => {
    expect(
      describeWinLossTrend([
        {
          year: 1600,
          battles: 2,
          wins: 2,
          losses: 0,
          decided: 2,
          winRate: 1,
        },
        {
          year: 1601,
          battles: 0,
          wins: 0,
          losses: 0,
          decided: 0,
          winRate: 0,
        },
        {
          year: 1602,
          battles: 3,
          wins: 1,
          losses: 2,
          decided: 3,
          winRate: 1 / 3,
        },
      ])
    ).toBe(
      "1600年から1602年までの勝敗数推移。期間合計3勝2敗。最多勝利は1600年の2勝、最多敗北は1602年の2敗"
    );
  });

  it("戦闘がない場合を明示する", () => {
    expect(describeWinLossTrend([])).toBe(
      "勝敗数の年別推移。戦闘データなし"
    );
  });

  it("表示中の系列だけを説明する", () => {
    const data = [
      {
        year: 1600,
        battles: 3,
        wins: 2,
        losses: 1,
        decided: 3,
        winRate: 2 / 3,
      },
    ];

    expect(describeWinLossTrend(data, ["wins"])).toBe(
      "1600年の勝利数推移。期間合計2勝。最多勝利は1600年の2勝"
    );
    expect(describeWinLossTrend(data, ["losses"])).toBe(
      "1600年の敗北数推移。期間合計1敗。最多敗北は1600年の1敗"
    );
  });
});
