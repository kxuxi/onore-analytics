import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleRecord } from "@/lib/types";
import { MetaTab } from "./MetaTab";
import { MetricsTab } from "./MetricsTab";
import { RankingTab } from "./RankingTab";
import { TraitMatrixTab } from "./TraitMatrixTab";

const EMPTY_LOG: BattleRecord[] = [];

const cases: { name: string; element: ReactElement }[] = [
  {
    name: "武将ランキング",
    element: (
      <MetricsTab log={EMPTY_LOG} onSelectWarlord={vi.fn()} />
    ),
  },
  {
    name: "兵種ランキング",
    element: (
      <RankingTab
        log={EMPTY_LOG}
        variant="unit"
        onSelectUnit={vi.fn()}
        onSelectEquip={vi.fn()}
        onSelectWarlord={vi.fn()}
      />
    ),
  },
  {
    name: "相性マトリックス",
    element: (
      <TraitMatrixTab
        log={EMPTY_LOG}
        onSelectWarlord={vi.fn()}
        onSelectUnit={vi.fn()}
      />
    ),
  },
  {
    name: "環境ダッシュボード",
    element: <MetaTab log={EMPTY_LOG} onSelectUnit={vi.fn()} />,
  },
];

describe.each(cases)("$name の集計期間", ({ element }) => {
  it("即時切替ボタンのグループとして現在値を伝える", () => {
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('role="group" aria-label="集計期間"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain('role="tab"');
    expect(markup).not.toContain("aria-selected");
  });
});
