import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageLoading } from "./PageLoading";

describe("PageLoading", () => {
  it("読み込み状態と装飾用プレースホルダーを支援技術へ正しく伝える", () => {
    const html = renderToStaticMarkup(<PageLoading />);

    expect(html).toContain('class="panel page-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only">読み込み中…</span>');
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/class="skeleton(?: |")/g)).toHaveLength(8);
  });

  it("遅延読込用では読み込み通知を重複させない", () => {
    const html = renderToStaticMarkup(<PageLoading announce={false} />);

    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("aria-live");
  });
});

describe("ページ読込フォールバックの構造契約", () => {
  const pageSource = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");

  it("18個すべてのdynamic importで共通フォールバックを使う", () => {
    const declarations = [
      ...pageSource.matchAll(/const\s+(\w+)\s*=\s*dynamic\(/g),
    ];

    expect(declarations).toHaveLength(18);

    declarations.forEach((declaration, index) => {
      const start = declaration.index ?? 0;
      const end = declarations[index + 1]?.index ?? pageSource.length;
      const dynamicBlock = pageSource.slice(start, end);

      expect(dynamicBlock, `${declaration[1]} のloading設定`).toContain(
        "loading: renderPageLoading"
      );
    });
  });

  it("データ読込は通知あり、dynamic importは通知なしで表示する", () => {
    expect(pageSource).toContain("return <PageLoading announce={false} />;");
    expect(pageSource).toContain("<PageLoading />");
  });
});

describe("PageLoadingの表示安定性", () => {
  const systemCss = readFileSync(
    join(process.cwd(), "app/styles/14-system.css"),
    "utf8"
  );

  it("viewport単位のfallbackとモーション低減設定を維持する", () => {
    expect(systemCss).toMatch(
      /\.page-loading\s*\{[\s\S]*calc\(100vh - var\(--sticky-header-offset\) - 80px\)[\s\S]*calc\(100svh - var\(--sticky-header-offset\) - 80px\)[\s\S]*\}/
    );
    expect(systemCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(systemCss).toContain("animation-duration: 0.001ms !important");
  });
});
