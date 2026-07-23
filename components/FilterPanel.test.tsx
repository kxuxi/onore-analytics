import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FilterPanel,
  type ActiveFilter,
  type FilterPanelProps,
} from "./FilterPanel";

function renderFilterPanel(overrides: Partial<FilterPanelProps> = {}) {
  return renderToStaticMarkup(
    <FilterPanel
      id="ranking-filter"
      search={<input aria-label="武将名で検索" />}
      expanded
      onToggle={vi.fn()}
      toggleActive
      hasActiveFilters
      onClear={vi.fn()}
      resultText="絞り込み結果 12件"
      {...overrides}
    >
      <label>
        武将タイプ
        <select defaultValue="すべて">
          <option>すべて</option>
        </select>
      </label>
    </FilterPanel>
  );
}

describe("FilterPanel", () => {
  it("開閉状態をfieldsとトグルのaria属性へ反映する", () => {
    const openMarkup = renderFilterPanel();
    const closedMarkup = renderFilterPanel({ expanded: false });

    expect(openMarkup).toContain('aria-expanded="true"');
    expect(openMarkup).toContain('aria-controls="ranking-filter-fields"');
    expect(openMarkup).toContain('aria-label="フィルターを閉じる"');
    expect(openMarkup).toContain('id="ranking-filter-fields"');
    expect(openMarkup).not.toMatch(
      /id="ranking-filter-fields"[^>]*\shidden(?:=""|="true")?/
    );

    expect(closedMarkup).toContain('aria-expanded="false"');
    expect(closedMarkup).toContain('aria-label="フィルターを開く"');
    expect(closedMarkup).toMatch(
      /id="ranking-filter-fields"[^>]*\shidden(?:=""|="true")?/
    );
  });

  it("見出しとfieldsを一意なidで関連付ける", () => {
    const markup = renderFilterPanel();

    expect(markup).toContain('aria-labelledby="ranking-filter-heading"');
    expect(markup).toContain('id="ranking-filter-heading"');
    expect(markup).toContain(">絞り込み</h3>");
    expect(markup).toContain(
      'class="filter-grid filter-panel-fields"'
    );
  });

  it("適用中の条件がある場合だけ一括解除を表示する", () => {
    const activeMarkup = renderFilterPanel({ hasActiveFilters: true });
    const inactiveMarkup = renderFilterPanel({ hasActiveFilters: false });

    expect(activeMarkup).toContain("表示条件をすべて解除");
    expect(activeMarkup).toContain(
      'aria-label="表示条件をすべて解除"'
    );
    expect(inactiveMarkup).not.toContain("表示条件をすべて解除");
  });

  it("条件チップを全文の解除ラベル付きボタンとして表示する", () => {
    const activeFilters: ActiveFilter[] = [
      {
        key: "type-strategist",
        label: "武将タイプ",
        value: "軍師",
        onRemove: vi.fn(),
      },
    ];
    const markup = renderFilterPanel({ activeFilters });

    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="武将タイプ: 軍師を解除"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="適用中の表示条件"');
    expect(markup).toContain(">武将タイプ</span>");
    expect(markup).toContain(">軍師</span>");
    expect(markup).toContain('class="active-filter-chip"');
  });

  it("結果を単一のpoliteなstatusとして通知する", () => {
    const markup = renderFilterPanel();

    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain(">絞り込み結果 12件</p>");
  });

  it("条件チップが未指定または空配列の場合はチップ領域を表示しない", () => {
    const undefinedMarkup = renderFilterPanel({ activeFilters: undefined });
    const emptyMarkup = renderFilterPanel({ activeFilters: [] });

    for (const markup of [undefinedMarkup, emptyMarkup]) {
      expect(markup).not.toContain("active-filter-chips");
      expect(markup).not.toContain("active-filter-chip");
    }
  });
});
