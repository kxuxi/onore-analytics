import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchBox } from "./SearchBox";

describe("SearchBox", () => {
  it("通常利用ではコンボボックス用のARIA属性を追加しない", () => {
    const html = renderToStaticMarkup(
      <SearchBox
        value=""
        onChange={vi.fn()}
        placeholder="名前で検索"
      />
    );

    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="名前で検索"');
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("aria-controls");
  });

  it("指定したコンボボックス用のARIA属性を入力へ渡す", () => {
    const html = renderToStaticMarkup(
      <SearchBox
        id="warlord-search"
        value="信"
        onChange={vi.fn()}
        ariaLabel="自分の武将を検索"
        role="combobox"
        ariaControls="warlord-options"
        ariaExpanded
        ariaAutocomplete="list"
        ariaActiveDescendant="warlord-option-0"
        ariaDescribedBy="warlord-search-status"
      />
    );

    expect(html).toContain('id="warlord-search"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="warlord-options"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-activedescendant="warlord-option-0"');
    expect(html).toContain('aria-describedby="warlord-search-status"');
  });
});
