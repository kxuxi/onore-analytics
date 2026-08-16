/**
 * 計略の出現判定（解放条件）。
 * 判定値 = 知力 × 2/3 + 計略P として、判定値が閾値以上になると解放される。
 */
export interface StratagemUnlockThreshold {
  /** 計略・封印効果の名前 */
  label: string;
  /** 出現判定の閾値（知力 2/3 + 計略P ≧ threshold） */
  threshold: number;
}

/** 出現判定の閾値一覧（閾値の低い順）。 */
export const STRATAGEM_UNLOCK_THRESHOLDS: StratagemUnlockThreshold[] = [
  { label: "計略発動条件：先制", threshold: 120 },
  { label: "武将アタック+10%", threshold: 120 },
  { label: "兵種アタック+10%", threshold: 120 },
  { label: "敵〇〇アタック（計略）半減", threshold: 120 },
  { label: "敵計略封印", threshold: 150 },
  { label: "計略発動タイミング：２枠", threshold: 150 },
  { label: "計略効果：２枠", threshold: 150 },
  { label: "両者武将アタック封印", threshold: 160 },
  { label: "両者兵種アタック封印", threshold: 160 },
  { label: "敵武将アタック封印", threshold: 180 },
  { label: "敵兵種アタック封印", threshold: 180 },
  { label: "激励（士気回復系）", threshold: 230 },
  { label: "乱戦（封印系）", threshold: 230 },
  { label: "神算鬼謀", threshold: 230 },
  { label: "発動率ボーナス：11%", threshold: 240 },
  { label: "発動率ボーナス：-2%", threshold: 250 },
  { label: "同士討（威力系）", threshold: 280 },
  { label: "発動率ボーナス：12%", threshold: 300 },
];

/** 知力が判定値に効く割合（2/3）。 */
const INTELLIGENCE_WEIGHT = 2 / 3;

export interface StratagemUnlockStatus extends StratagemUnlockThreshold {
  /** 現在の判定値（知力 × 2/3 + 計略P）で解放済みか。 */
  unlocked: boolean;
  /** 現在の判定値。 */
  currentValue: number;
  /** 知力を変えず計略Pだけを増やす場合、解放に必要な追加計略P（解放済みなら0）。 */
  neededStrategy: number;
  /** 計略Pを変えず知力だけを増やす場合、解放に必要な追加知力（解放済みなら0）。 */
  neededIntelligence: number;
}

/**
 * 知力・計略Pから、各計略の出現判定の到達状況を計算する。
 * 未解放のものは「計略Pをあと何増やせば解放できるか」「知力をあと何増やせば解放できるか」
 * をそれぞれ独立に（もう片方は変えない前提で）切り上げで返す。
 */
export function computeStratagemUnlockStatus(
  intelligence: number,
  strategy: number
): StratagemUnlockStatus[] {
  const currentValue = intelligence * INTELLIGENCE_WEIGHT + strategy;
  return STRATAGEM_UNLOCK_THRESHOLDS.map((t) => {
    const gap = t.threshold - currentValue;
    const unlocked = gap <= 0;
    return {
      ...t,
      unlocked,
      currentValue,
      neededStrategy: unlocked ? 0 : Math.ceil(gap),
      neededIntelligence: unlocked ? 0 : Math.ceil(gap / INTELLIGENCE_WEIGHT),
    };
  });
}
