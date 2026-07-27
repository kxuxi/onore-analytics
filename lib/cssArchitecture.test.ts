import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const STYLE_FILES = [
  "01-tokens-theme.css",
  "02-foundations.css",
  "03-shell.css",
  "04-controls.css",
  "05-data-display.css",
  "06-battle-history.css",
  "07-admin-feedback.css",
  "08-responsive-tables.css",
  "09-login.css",
  "10-details.css",
  "11-rankings-insights.css",
  "12-catalog.css",
  "13-analytics.css",
  "14-system.css",
  "15-home.css",
] as const;

const appDirectory = join(process.cwd(), "app");
const stylesDirectory = join(appDirectory, "styles");
const requireFromTest = createRequire(import.meta.url);

type PostCssConfig = {
  plugins: [
    [string, { skipDuplicates: boolean }],
    string,
    [
      string,
      {
        browsers: string[];
        autoprefixer: { flexbox: string };
        stage: number;
        features: { "custom-properties": boolean };
      },
    ],
  ];
};

describe("global CSS architecture", () => {
  it("責務ファイルをcascade順に1つのentrypointから読み込む", () => {
    const entrypoint = readFileSync(join(appDirectory, "globals.css"), "utf8");
    const expected = `${STYLE_FILES.map(
      (filename) => `@import "./styles/${filename}";`
    ).join("\n")}\n`;

    expect(entrypoint).toBe(expected);
  });

  it("各責務ファイルを空にせず、入れ子のimportを持たない", () => {
    for (const filename of STYLE_FILES) {
      const content = readFileSync(join(stylesDirectory, filename), "utf8");

      expect(content.trim().length, filename).toBeGreaterThan(0);
      expect(content, filename).not.toMatch(/^\s*@import\b/m);
    }
  });

  it("日本語UIのタイポグラフィを意味のあるサイズとウェイトに限定する", () => {
    const tokens = readFileSync(
      join(stylesDirectory, "01-tokens-theme.css"),
      "utf8"
    );
    expect(tokens).toMatch(/--font-size-2xs:\s*11px;/);
    expect(tokens).toMatch(/--font-size-compact:\s*15px;/);
    expect(tokens).toMatch(/--font-size-heading:\s*18px;/);
    expect(tokens).toMatch(/--font-weight-regular:\s*400;/);
    expect(tokens).toMatch(/--font-weight-medium:\s*500;/);
    expect(tokens).toMatch(/--font-weight-semibold:\s*600;/);
    expect(tokens).toMatch(/--font-weight-bold:\s*700;/);
    expect(tokens).toMatch(/--line-height-caption:\s*1\.5;/);
    expect(tokens).toMatch(/--line-height-control:\s*1\.4;/);
    expect(tokens).toMatch(/--line-height-heading:\s*1\.3;/);
    for (const filename of STYLE_FILES) {
      const content = readFileSync(join(stylesDirectory, filename), "utf8");

      expect(content, filename).not.toMatch(
        /font-weight:\s*(?:650|750|800|850|900)\b/
      );
      if (filename !== "01-tokens-theme.css") {
        expect(content, filename).not.toMatch(/font-weight:\s*\d+\b/);
      }
    }
  });

  it("named containerの定義とqueryを同じ責務に保つ", () => {
    const battleHistory = readFileSync(
      join(stylesDirectory, "06-battle-history.css"),
      "utf8"
    );
    const catalog = readFileSync(
      join(stylesDirectory, "12-catalog.css"),
      "utf8"
    );

    expect(battleHistory).toContain("container-name: battle-history");
    expect(battleHistory).toContain("@container battle-history");
    expect(catalog).toContain("container: catalog-results / inline-size");
    expect(catalog).toContain("@container catalog-results");
  });

  it("スマホではサブタブ上だけ余白をなくし、タブなし画面の余白は保つ", () => {
    const responsive = readFileSync(
      join(stylesDirectory, "08-responsive-tables.css"),
      "utf8"
    );

    expect(responsive).toMatch(
      /@media \(max-width: 480px\)\s*\{[\s\S]*?\.main\s*\{\s*padding:\s*12px 10px 80px;\s*\}[\s\S]*?\.main:has\(> #main-panel > \.subtabs\)\s*\{\s*padding-top:\s*0;\s*\}/
    );
  });

  it("スマホのメニューは画面上端から表示し、ノッチの安全領域を保つ", () => {
    const responsive = readFileSync(
      join(stylesDirectory, "08-responsive-tables.css"),
      "utf8"
    );

    expect(responsive).toMatch(
      /@media \(max-width: 767px\)\s*\{[\s\S]*?\.sidebar\s*\{[^}]*top:\s*0;[^}]*padding-top:\s*calc\(var\(--space-2\) \+ env\(safe-area-inset-top, 0px\)\);[^}]*\}/
    );
  });

  it("データタグを角丸長方形にし、兵種タイプだけを中立色で表示する", () => {
    const battleHistory = readFileSync(
      join(stylesDirectory, "06-battle-history.css"),
      "utf8"
    );
    const adminFeedback = readFileSync(
      join(stylesDirectory, "07-admin-feedback.css"),
      "utf8"
    );
    const rankingInsights = readFileSync(
      join(stylesDirectory, "11-rankings-insights.css"),
      "utf8"
    );

    expect(adminFeedback).toMatch(
      /\.tag\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
    expect(adminFeedback).toMatch(
      /\.tag\.branch\s*\{[^}]*color:\s*var\(--color-text-secondary\)[^}]*border-color:\s*var\(--color-border-default\)[^}]*background:\s*var\(--surface-subtle\)[^}]*cursor:\s*default/s
    );
    expect(battleHistory).toMatch(
      /\.bh-tag\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
    expect(battleHistory).toMatch(
      /\.bh-tag--branch\s*\{[^}]*color:\s*var\(--color-text-secondary\)[^}]*background:\s*var\(--surface-subtle\)[^}]*border-color:\s*var\(--color-border-default\)[^}]*cursor:\s*default/s
    );
    expect(rankingInsights).toMatch(
      /\.latest-units-branch\s*\{[^}]*border-radius:\s*var\(--radius-sm\)[^}]*color:\s*var\(--color-text-secondary\)[^}]*border:\s*1px solid var\(--color-border-default\)[^}]*background:\s*var\(--surface-subtle\)/s
    );
    expect(rankingInsights).toMatch(
      /\.latest-unit-chip\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s
    );
  });

  it("CSSを結合してからNext.js既定のPostCSS変換を適用する", () => {
    const config = requireFromTest("../postcss.config.js") as PostCssConfig;
    const supportedBrowsers = requireFromTest(
      "next/dist/shared/lib/modern-browserslist-target"
    ) as string[];

    expect(config.plugins[0]).toEqual([
      "postcss-import",
      { skipDuplicates: false },
    ]);
    expect(config.plugins[1]).toBe(
      "next/dist/compiled/postcss-flexbugs-fixes"
    );
    expect(config.plugins[2][0]).toBe(
      "next/dist/compiled/postcss-preset-env"
    );
    expect(config.plugins[2][1]).toEqual({
      browsers: supportedBrowsers,
      autoprefixer: { flexbox: "no-2009" },
      stage: 3,
      features: { "custom-properties": false },
    });
  });
});
