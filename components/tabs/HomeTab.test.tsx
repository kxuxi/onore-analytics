import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeTab } from "./HomeTab";

const callbacks = {
  onSelectWarlord: vi.fn(),
  onSelectUnit: vi.fn(),
  onSelectFaction: vi.fn(),
  onSelectRanking: vi.fn(),
  onSelectHistory: vi.fn(),
};

function renderHome() {
  return renderToStaticMarkup(
    <HomeTab log={[]} db={{}} colors={{}} {...callbacks} />
  );
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

    expect(html).toContain("自分の武将から、戦いの傾向をつかむ");
    expect(html).toContain("自分の武将を検索");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("通算成績");
    expect(html).toContain("年別の推移");
    expect(html).toContain("最近の戦闘");
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
    expect(html).not.toContain("自分の武将から、戦いの傾向をつかむ");
    expect(html).not.toContain('role="combobox"');
  });
});
