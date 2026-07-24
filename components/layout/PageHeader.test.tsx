import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("一覧へ戻ったときに見出しをプログラム的にフォーカスできる", () => {
    const html = renderToStaticMarkup(<PageHeader title="武将ランキング" />);

    expect(html).toContain("data-page-heading");
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(">武将ランキング</h2>");
  });
});
