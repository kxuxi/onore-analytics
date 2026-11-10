import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilterSelect } from "./FilterSelect";
import { PeriodSelector } from "./PeriodSelector";

describe("FilterSelect", () => {
  it("label.filter > span + select.select の構造で、空値の選択肢を先頭に置く", () => {
    const html = renderToStaticMarkup(
      <FilterSelect
        label="国"
        value="織田"
        options={["上杉", { value: "織田", label: "織田家" }]}
        onChange={vi.fn()}
        emptyLabel="すべて"
      />
    );
    expect(html).toBe(
      '<label class="filter"><span>国</span><select class="select">' +
        '<option value="">すべて</option>' +
        '<option value="上杉">上杉</option>' +
        '<option value="織田" selected="">織田家</option>' +
        "</select></label>"
    );
    const noEmpty = renderToStaticMarkup(
      <FilterSelect label="並び順" value="a" options={["a"]} onChange={vi.fn()} />
    );
    expect(noEmpty).not.toContain('<option value="">');
  });
});
import { SegmentedControl } from "./SegmentedControl";
import { ShowMoreButton } from "./ShowMoreButton";
import { SideWinRate } from "./SideWinRate";

describe("ShowMoreButton", () => {
  it("閉じているときは残り件数、開いているときは一部だけ表示を出す", () => {
    const closed = renderToStaticMarkup(
      <ShowMoreButton hiddenCount={1234} unit="人" expanded={false} onToggle={vi.fn()} />
    );
    expect(closed).toContain('<div class="show-more-row">');
    expect(closed).toContain('class="btn show-more-btn" aria-expanded="false">残り1,234人を表示</button>');
    const open = renderToStaticMarkup(
      <ShowMoreButton hiddenCount={3} unit="件" expanded onToggle={vi.fn()} />
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain(">一部だけ表示</button>");
  });
});

describe("SegmentedControl", () => {
  it("押下状態で現在値を伝え、各ボタンに tmx-period を付ける", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        className="meta-sort"
        ariaLabel="並び順"
        options={[
          { key: "a", label: "甲" },
          { key: "b", label: "乙" },
        ]}
        value="b"
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('<div class="meta-sort" role="group" aria-label="並び順">');
    expect(html).toContain('aria-pressed="false" class="tmx-period">甲</button>');
    expect(html).toContain('aria-pressed="true" class="tmx-period active">乙</button>');
  });

  it("PeriodSelector は集計期間のグループとして描く", () => {
    const html = renderToStaticMarkup(
      <PeriodSelector
        periods={[{ key: "all", label: "全期間", from: null, to: null }]}
        value="all"
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('class="tmx-periods" role="group" aria-label="集計期間"');
    expect(html).toContain('aria-pressed="true" class="tmx-period active">全期間</button>');
  });
});

describe("SideWinRate", () => {
  it("勝率・勝敗・戦闘数とバーを出し、戦闘が無ければ空表示にする", () => {
    const html = renderToStaticMarkup(
      <SideWinRate
        title="出兵"
        summary={{ battles: 5, wins: 3, losses: 1, others: 1, decided: 4, winRate: 0.75 }}
      />
    );
    expect(html).toContain('<h4 class="side-wr-title">出兵</h4>');
    expect(html).toContain("75.0%");
    expect(html).toContain('class="wr-bar"');
    const empty = renderToStaticMarkup(
      <SideWinRate
        title="守備"
        headingLevel="h3"
        emptyText="この期の戦闘はありません。"
        className="home-split"
        summary={{ battles: 0, wins: 0, losses: 0, others: 0, decided: 0, winRate: 0 }}
      />
    );
    expect(empty).toContain('class="side-wr home-split"');
    expect(empty).toContain("<h3");
    expect(empty).toContain("この期の戦闘はありません。");
    expect(empty).not.toContain("wr-bar");
  });
});
