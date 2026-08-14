/**
 * 徴兵時に政治力を上げる持ち物。政治力の計算に使う加算値のみ表現する
 * （実際の効果は「政治統率+20」等だが、ここでは徴兵時の治安減少量の
 * 計算に関係する政治力の増分だけを見る）。
 */
export interface ConscriptionPoliticsItem {
  /** 持ち物名（"なし" は加算なし）。 */
  name: string;
  /** 徴兵時に加算される政治力。 */
  politicsBonus: number;
  /** 効果の説明（表示用）。 */
  note: string;
}

export const CONSCRIPTION_POLITICS_ITEMS: ConscriptionPoliticsItem[] = [
  { name: "なし", politicsBonus: 0, note: "" },
  { name: "三河物語", politicsBonus: 20, note: "常時 政治統率+20" },
  { name: "浄土三部経", politicsBonus: 20, note: "常時 政治統率+20" },
  { name: "土佐物語", politicsBonus: 20, note: "徴兵、戦闘時 政治統率+20" },
  { name: "馬蝗絆", politicsBonus: 20, note: "常時 政治統率+20" },
  { name: "諸葛亮の白羽扇", politicsBonus: 30, note: "常時 知力政治力+30" },
  { name: "東雲ドーナツ", politicsBonus: 300, note: "徴兵時 全ステータス+300" },
];

/**
 * 徴兵時の治安減少量 = 徴兵数 ÷ (政治力 × 2) + 1。
 * 政治力が0以下（計算不能）の場合は null を返す。
 */
export function computeConscriptionSecurityDecrease(
  troops: number,
  politics: number
): number | null {
  if (politics <= 0) return null;
  return troops / (politics * 2) + 1;
}
