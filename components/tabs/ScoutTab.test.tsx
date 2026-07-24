import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildScoutReport,
  buildScoutTsv,
  ScoutTab,
  type ScoutRow,
} from "./ScoutTab";

const ROWS: ScoutRow[] = [
  {
    name: "因幡月夜",
    faction: "天下五剣",
    type: "武特",
    branch: "弓兵",
    unit: "剛弓僧兵",
    found: true,
  },
  {
    name: "未登録武将",
    found: false,
  },
];

describe("偵察コピーの外部文字列契約", () => {
  it("TSVの列順と未登録行の表現を維持する", () => {
    expect(buildScoutTsv(ROWS)).toBe(
      [
        "国\t武将名\tタイプ\t兵種タイプ\t兵種名",
        "天下五剣\t因幡月夜\t武特\t弓兵\t剛弓僧兵",
        "-\t未登録武将\t未登録\t-\t-",
      ].join("\n")
    );
  });

  it("報告文の短縮形式と150文字上限を維持する", () => {
    expect(buildScoutReport(ROWS, true)).toEqual({
      parts: ["因幡月夜［武｜剛弓］", "未登録武将［？］"],
      text: "因幡月夜［武｜剛弓］, 未登録武将［？］",
    });
    expect(buildScoutReport(ROWS, false).text).toBe(
      "因幡月夜［武］, 未登録武将［？］"
    );

    const manyRows = Array.from({ length: 30 }, (_, index): ScoutRow => ({
      name: `長い武将名${index}`,
      found: false,
    }));
    const limited = buildScoutReport(manyRows, true);
    expect(limited.text.length).toBeLessThanOrEqual(150);
    expect(limited.parts.length).toBeLessThan(manyRows.length);
  });
});

describe("ScoutTab", () => {
  it("入力に可視ラベルと区切り方の説明を関連付ける", () => {
    const markup = renderToStaticMarkup(
      <ScoutTab db={{}} colors={{}} onSelectWarlord={vi.fn()} />
    );
    const inputId = markup.match(
      /<label class="scout-input-label" for="([^"]+)"/
    )?.[1];

    expect(inputId).toBeTruthy();
    expect(markup).toContain(`id="${inputId}"`);
    expect(markup).toContain("偵察リスト");
    expect(markup).toContain(
      "武将名をスペース、改行、読点、カンマのいずれかで区切って入力します"
    );
  });
});
