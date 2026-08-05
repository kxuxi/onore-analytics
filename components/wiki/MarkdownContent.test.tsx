import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MarkdownContent,
  safeMarkdownUrl,
} from "./MarkdownContent";

describe("safeMarkdownUrl", () => {
  it.each([
    ["/wiki/guide", "/wiki/guide"],
    ["#section", "#section"],
    ["https://example.com/guide", "https://example.com/guide"],
    ["http://example.com", "http://example.com"],
    ["mailto:admin@example.com", "mailto:admin@example.com"],
  ])("%s を許可する", (input, expected) => {
    expect(safeMarkdownUrl(input)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "//tracking.example.com/pixel",
    "vbscript:msgbox(1)",
    "\u0000javascript:alert(1)",
  ])("危険または追跡可能なURL %s を拒否する", (input) => {
    expect(safeMarkdownUrl(input)).toBe("");
  });
});

describe("MarkdownContent", () => {
  it("GFMの表・タスクリストを表示し、見出し階層をh3以降へ補正する", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        content={
          "# 運用手順\n\n- [x] 確認済み\n\n|項目|値|\n|---|---|\n|期|147|"
        }
      />
    );

    expect(html).toContain("<h3>運用手順</h3>");
    expect(html).not.toContain("<h1>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain("<th>項目</th>");
  });

  it("生HTML・危険なリンク・外部画像を実行可能な要素として出力しない", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        content={
          '![追跡画像](https://example.com/pixel.gif)\n\n[危険](javascript:alert(1))\n\n<script>alert("xss")</script>\n\n<img src=x onerror=alert(1)>'
        }
      />
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).toContain("画像「追跡画像」は表示されません");
  });

  it("外部リンクを別タブで安全に開き、相対リンクは同じ画面で開く", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        content={
          "[外部](https://example.com/guide)\n\n[内部](/wiki/guide)"
        }
      />
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('<a href="/wiki/guide">内部</a>');
  });
});
