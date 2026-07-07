import type { Warlord } from "./types";

/** タイプ文字列で使われる略称とステータス項目の対応（計略は含まない）。 */
const TYPE_STAT_LABELS: {
  key: "power" | "intelligence" | "leadership" | "politics";
  label: string;
}[] = [
  { key: "power", label: "武" },
  { key: "intelligence", label: "知" },
  { key: "leadership", label: "統" },
  { key: "politics", label: "政" },
];

/** この差以内なら僅差とみなし、大なり(>)の代わりにイコール(=)で結ぶ。 */
const NEAR_EQUAL_THRESHOLD = 30;

/**
 * タイプが「謎」の武将について、現在のステータス上位2項目を
 * "謎(武>統)" のように付記した表示用文字列を返す。
 * 差が僅差（NEAR_EQUAL_THRESHOLD 以内）の場合は "謎(武=統)" のようにイコールで結ぶ。
 * ステータスが2項目未満しか無ければそのまま返す。
 */
export function displayWarlordType(
  w: Pick<Warlord, "type" | "power" | "intelligence" | "leadership" | "politics">
): string {
  if (w.type !== "謎") return w.type;
  const stats = TYPE_STAT_LABELS.map((s) => ({ label: s.label, value: w[s.key] })).filter(
    (s): s is { label: string; value: number } => typeof s.value === "number"
  );
  if (stats.length < 2) return w.type;
  stats.sort((a, b) => b.value - a.value);
  const [first, second] = stats;
  const symbol = first.value - second.value <= NEAR_EQUAL_THRESHOLD ? "=" : ">";
  return `${w.type}(${first.label}${symbol}${second.label})`;
}
