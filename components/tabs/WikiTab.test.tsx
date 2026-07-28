import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WikiTab } from "./WikiTab";

describe("WikiTab initial state", () => {
  it("初期取得が終わるまで編集フォームを出さず、入力の上書きを防ぐ", () => {
    const html = renderToStaticMarkup(<WikiTab />);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("ページを読み込んでいます…");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('name="title"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>新しいページ<\/button>/);
  });
});
