import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeWarlordSearch } from "./HomeActivation";

function renderSearch(query: string, suggestions: string[]) {
  return renderToStaticMarkup(
    <HomeWarlordSearch
      query={query}
      suggestions={suggestions}
      inputRef={createRef<HTMLInputElement>()}
      onQueryChange={vi.fn()}
      onChoose={vi.fn()}
    />
  );
}

describe("HomeWarlordSearch", () => {
  it("候補と入力を一意なARIA参照で関連付ける", () => {
    const html = renderSearch("織田", ["織田信長", "織田信忠"]);

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="home-warlord-suggestions"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="listbox"');
    expect(html.match(/role="option"/g)).toHaveLength(2);
    expect(html).toContain('id="home-warlord-suggestions-0"');
    expect(html).toContain('id="home-warlord-suggestions-1"');
    expect(html).toContain("2件の候補を表示");
  });

  it("該当なしを単一のlive statusで案内する", () => {
    const html = renderSearch("該当なし", []);

    expect(html).toContain('role="status"');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain("一致する武将が見つかりません");
    expect(html).toContain("対象の期を確認してください");
    expect(html).not.toContain('role="listbox"');
    expect(html).toContain('aria-expanded="false"');
  });
});
