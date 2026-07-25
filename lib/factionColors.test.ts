import { describe, expect, it } from "vitest";
import {
  resolveFactionColor,
  paletteName,
  factionNameStyle,
  factionBadgeStyle,
} from "./factionColors";

describe("resolveFactionColor", () => {
  it("国に色が設定されていればその色を返す", () => {
    expect(resolveFactionColor("織田家", "#000000", { 織田家: "#CC3333" })).toBe(
      "#CC3333"
    );
  });

  it("色が未設定ならフォールバックを返す", () => {
    expect(resolveFactionColor("徳川家", "#1D9E75", {})).toBe("#1D9E75");
  });

  it("国名が undefined ならフォールバックを返す", () => {
    expect(resolveFactionColor(undefined, "#1D9E75", { 織田家: "#CC3333" })).toBe(
      "#1D9E75"
    );
  });
});

describe("paletteName", () => {
  it("パレットの色値から名前を引ける", () => {
    expect(paletteName("#FFFFFF")).toBe("白");
    expect(paletteName("#CC3333")).toBe("赤");
  });

  it("大文字小文字を区別しない", () => {
    expect(paletteName("#ffffff")).toBe("白");
  });

  it("パレットに無い色や undefined は undefined を返す", () => {
    expect(paletteName("#123456")).toBeUndefined();
    expect(paletteName(undefined)).toBeUndefined();
  });
});

describe("factionNameStyle / factionBadgeStyle", () => {
  it("色未設定なら undefined（既定色のまま）", () => {
    expect(factionNameStyle("徳川家", {})).toBeUndefined();
    expect(factionNameStyle(undefined, { 織田家: "#CC3333" })).toBeUndefined();
    expect(factionBadgeStyle("徳川家", {})).toBeUndefined();
  });

  it("色設定済みなら文字・枠線・背景を国色に依存させる", () => {
    const style = factionNameStyle("織田家", { 織田家: "#CC3333" });
    expect(style?.color).toBe(
      "color-mix(in srgb, #CC3333 32%, var(--text))"
    );

    const badge = factionBadgeStyle("織田家", { 織田家: "#CC3333" });
    expect(badge?.color).toBe(
      "color-mix(in srgb, #CC3333 32%, var(--text))"
    );
    expect(badge?.borderColor).toContain("#CC3333");
    expect(badge?.background).toContain("#CC3333");
  });

  it.each(["#FFFFFF", "#111111"])(
    "明暗の極端な国色 %s もテーマ文字色と混ぜる",
    (hex) => {
      const style = factionNameStyle("対象国", { 対象国: hex });
      expect(style?.color).toBe(
        `color-mix(in srgb, ${hex} 32%, var(--text))`
      );
    }
  );

  it.each(["not-a-color", "123456", "#12ZZ34"])(
    "不正な色値 %s ではスタイルを返さない",
    (invalidColor) => {
      const colors = { 謎家: invalidColor };
      expect(factionNameStyle("謎家", colors)).toBeUndefined();
      expect(factionBadgeStyle("謎家", colors)).toBeUndefined();
    }
  );

  it("短縮HEXも有効な国色として扱う", () => {
    expect(factionNameStyle("織田家", { 織田家: "#c33" })?.color).toContain(
      "#c33 32%"
    );
  });
});
