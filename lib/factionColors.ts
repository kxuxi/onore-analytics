/** 国（勢力）ごとの表示色設定。 */
import type { CSSProperties } from "react";

export type FactionColorMap = Record<string, string>;

/** 左チーム（出兵側）勝利時の既定色 */
export const DEFAULT_WIN_LEFT = "#1D9E75";
/** 右チーム（防衛側）勝利時の既定色 */
export const DEFAULT_WIN_RIGHT = "#D85A30";

/** 国に割り当てられる色見本（名前付き固定パレット） */
export interface PaletteColor {
  name: string;
  value: string;
}

export const FACTION_PALETTE: PaletteColor[] = [
  { name: "白", value: "#FFFFFF" },
  { name: "赤", value: "#CC3333" },
  { name: "濃赤", value: "#881111" },
  { name: "朱", value: "#DD5500" },
  { name: "橙", value: "#EE8811" },
  { name: "山吹", value: "#DDAA00" },
  { name: "黄", value: "#DDCC00" },
  { name: "黄緑", value: "#88BB00" },
  { name: "緑", value: "#338833" },
  { name: "濃緑", value: "#116611" },
  { name: "深緑", value: "#004422" },
  { name: "黒", value: "#111111" },
  { name: "水色", value: "#44AACC" },
  { name: "浅葱", value: "#008899" },
  { name: "青緑", value: "#007766" },
  { name: "水浅葱", value: "#66BBCC" },
  { name: "青", value: "#3366BB" },
  { name: "濃青", value: "#113388" },
  { name: "藍", value: "#223399" },
  { name: "紫", value: "#7733AA" },
  { name: "濃紫", value: "#551188" },
  { name: "赤紫", value: "#AA3377" },
  { name: "桃", value: "#EE88AA" },
  { name: "薄桃", value: "#FFBBCC" },
  { name: "灰", value: "#888888" },
  { name: "薄灰", value: "#AAAAAA" },
  { name: "茶", value: "#886633" },
  { name: "濃茶", value: "#664422" },
  { name: "肌", value: "#DDBB99" },
  { name: "薄黄", value: "#EEDD88" },
];

/** 色値（#RRGGBB）からパレット名を引く。無ければ undefined。 */
export function paletteName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  return FACTION_PALETTE.find((c) => c.value.toUpperCase() === v)?.name;
}

/**
 * 勢力（国）の表示色を返す。色が未設定なら、左右どちらの側かに応じた
 * 既定色（左=緑 / 右=橙）へフォールバックする。
 * 戦闘カードで左右それぞれの側の色を塗るために使う。
 */
export function resolveFactionColor(
  faction: string | undefined,
  fallback: string,
  colors: FactionColorMap
): string {
  return (faction && colors[faction]) || fallback;
}

/** `#RGB` / `#RRGGBB` を 0-255 の RGB に分解する（不正な値は null）。 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * 国名をテキストとして表示する箇所用の色スタイル。
 * その国に色が設定されているときだけテーマの本文色を返し、
 * 未設定なら undefined（既定色のまま）。
 */
export function factionNameStyle(
  faction: string | undefined,
  colors: FactionColorMap
): CSSProperties | undefined {
  const hex = faction ? colors[faction] : undefined;
  if (!hex) return undefined;
  // 任意の国色では文字コントラストを保証できないため、文字はテーマ色へ固定する。
  return { color: "var(--text)" };
}

/**
 * 国名をバッジ（`.tag.faction` などのピル）で表示する箇所用の色スタイル。
 * 文字はテーマの本文色、枠線・背景はその国色の半透明でチントする。
 * 未設定なら undefined（既定のピンクピルのまま）。
 */
export function factionBadgeStyle(
  faction: string | undefined,
  colors: FactionColorMap
): CSSProperties | undefined {
  const hex = faction ? colors[faction] : undefined;
  if (!hex) return undefined;
  if (!hexToRgb(hex)) return undefined;
  // 任意の国色は枠線・背景だけに使い、文字はテーマ色でコントラストを保つ。
  return {
    color: "var(--text)",
    borderColor: `color-mix(in srgb, ${hex} 50%, transparent)`,
    background: `color-mix(in srgb, ${hex} 18%, transparent)`,
  };
}
