import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyImageBlob,
  downloadBlob,
  renderWarlordCardBlob,
} from "@/lib/warlordCard";

const CARD_DATA = {
  name: "武将甲",
  faction: "東軍",
  type: "武特",
  branch: "騎兵",
  battles: 10,
  wins: 6,
  losses: 4,
  winRate: 0.6,
  decided: 10,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warlordCard の非ブラウザ環境", () => {
  it("document がない環境では描画とダウンロードを安全にスキップする", async () => {
    expect(await renderWarlordCardBlob(CARD_DATA)).toBeNull();
    expect(() =>
      downloadBlob(new Blob(["card"], { type: "image/png" }), "card.png")
    ).not.toThrow();
  });

  it("ClipboardItem 非対応環境ではコピー失敗を返す", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", {});

    const result = await copyImageBlob(
      new Blob(["card"], { type: "image/png" })
    );

    expect(result).toBe(false);
  });
});

describe("WarlordDetail のカード生成境界", () => {
  it("カード描画モジュールは保存操作時にだけ読み込む", () => {
    const source = readFileSync(
      join(process.cwd(), "components/detail/WarlordDetail.tsx"),
      "utf8"
    );

    expect(source).not.toMatch(
      /(?:^|\n)\s*import[\s\S]*?\sfrom\s+["']@\/lib\/warlordCard["']/
    );
    expect(source).toContain('await import("@/lib/warlordCard")');
  });

  it("遅延読込後も生成・保存・コピー・状態復帰の順序を維持する", () => {
    const source = readFileSync(
      join(process.cwd(), "components/detail/WarlordDetail.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("const handleSaveCard"),
      source.indexOf("const pieData")
    );

    expect(handler).toMatch(
      /setCardState\("saving"\)[\s\S]*await import\("@\/lib\/warlordCard"\)[\s\S]*await renderWarlordCardBlob\([\s\S]*downloadBlob\(blob, `\$\{name\}_戦績カード\.png`\)[\s\S]*await copyImageBlob\(blob\)[\s\S]*setCardState\("done"\)[\s\S]*setCardState\("idle"\), 2000/
    );
  });
});
