import { describe, expect, it } from "vitest";
import {
  copyText as copyTextFromLegacyModule,
  htmlToMarkdown,
} from "./clipboard";
import { copyText } from "./copyText";

describe("htmlToMarkdown", () => {
  it("リンクを保持し、ログ文字をエスケープせず、前後の空白を除去する", () => {
    const html = `
      <p>*特殊兵種* ([注]) <a href="https://example.com/battles/1">戦闘ログ</a></p>
    `;

    expect(htmlToMarkdown(html)).toBe(
      "*特殊兵種* ([注]) [戦闘ログ](https://example.com/battles/1)",
    );
  });
});

describe("clipboard module compatibility", () => {
  it("copyText を従来のモジュールから同じ関数として再公開する", () => {
    expect(copyTextFromLegacyModule).toBe(copyText);
  });
});
