import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  UsageTrendPoint,
  WinHeatmap,
  YearlyWinRate,
} from "@/lib/stats";
import {
  describeUsageTrend,
  UsageTrend,
} from "@/components/detail/UnitInsights";
import {
  describeWinHeatmap,
  WinHeatmapSection,
  WinRateTrend,
} from "@/components/detail/WarlordInsights";

const USAGE_POINTS: UsageTrendPoint[] = [
  {
    year: 1600,
    totalBattles: 20,
    unitBattles: 2,
    rate: 0.1,
    wins: 1,
    losses: 1,
    decided: 2,
  },
  {
    year: 1601,
    totalBattles: 10,
    unitBattles: 4,
    rate: 0.4,
    wins: 3,
    losses: 1,
    decided: 4,
  },
  {
    year: 1602,
    totalBattles: 20,
    unitBattles: 5,
    rate: 0.25,
    wins: 2,
    losses: 3,
    decided: 5,
  },
];

describe("詳細画面の推移グラフ要約", () => {
  it("兵種の使用率について始点・終点・最大値を説明する", () => {
    expect(describeUsageTrend(USAGE_POINTS, "rate")).toBe(
      "使用率の年別推移。1600年は10%、1602年は25%。最大は1601年の40%"
    );

    const markup = renderToStaticMarkup(<UsageTrend points={USAGE_POINTS} />);
    expect(markup).toContain(
      'aria-label="使用率の年別推移。1600年は10%、1602年は25%。最大は1601年の40%"'
    );
  });

  it("選択可能な勝利数にも同じデータ契約を適用する", () => {
    expect(describeUsageTrend(USAGE_POINTS, "wins")).toBe(
      "勝利数の年別推移。1600年は1戦、1602年は2戦。最大は1601年の3戦"
    );
  });

  it("武将の通算勝率について開始年と最新年の通算成績を説明する", () => {
    const data: YearlyWinRate[] = [
      {
        year: 1600,
        battles: 1,
        wins: 1,
        losses: 0,
        decided: 1,
        winRate: 1,
      },
      {
        year: 1601,
        battles: 2,
        wins: 1,
        losses: 1,
        decided: 2,
        winRate: 0.5,
      },
    ];

    const markup = renderToStaticMarkup(<WinRateTrend data={data} />);
    expect(markup).toContain(
      'aria-label="通算勝率の推移。1600年時点は100%、1601年時点は67%（通算2勝1敗）"'
    );
  });

  it("ヒートマップを色やtitleに依存せず最高・最低の時間帯で説明する", () => {
    const emptyCell = () => ({
      battles: 0,
      wins: 0,
      losses: 0,
      decided: 0,
      winRate: 0,
    });
    const heatmap: WinHeatmap = {
      bucketLabels: ["0", "3"],
      dated: 7,
      cells: Array.from({ length: 7 }, () => [emptyCell(), emptyCell()]),
    };
    heatmap.cells[0][0] = {
      battles: 3,
      wins: 2,
      losses: 0,
      decided: 2,
      winRate: 1,
    };
    heatmap.cells[1][1] = {
      battles: 2,
      wins: 0,
      losses: 2,
      decided: 2,
      winRate: 0,
    };

    const description =
      "時間帯・曜日別の勝率。日時を確認できた7戦。最高は日曜日 0時台 100.0%（2勝0敗）、最低は月曜日 3時台 0.0%（0勝2敗）";
    expect(describeWinHeatmap(heatmap)).toBe(description);

    const markup = renderToStaticMarkup(
      <WinHeatmapSection heatmap={heatmap} />
    );
    expect(markup).toContain(`role="img" aria-label="${description}"`);
    expect(markup).not.toContain('role="row"');
  });
});
