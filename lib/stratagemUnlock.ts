/**
 * 計略の出現判定（解放条件）。
 * 出現判定値 = 計略P + 知力 × 2/3（端数切捨て）として、
 * 出現判定値が各項目の「出現判定」以上になると選べるようになる。
 */

/** 計略項目の分類（計略一覧の見出しに対応）。 */
export type StratagemCategory =
  | "発動設定"
  | "威力系"
  | "士気ダウン系"
  | "攻撃防御UP系"
  | "回復系"
  | "ブースト系"
  | "嫌がらせ系"
  | "封印系";

/** 表示順に並べた分類一覧。 */
export const STRATAGEM_CATEGORIES: StratagemCategory[] = [
  "発動設定",
  "威力系",
  "士気ダウン系",
  "攻撃防御UP系",
  "回復系",
  "ブースト系",
  "嫌がらせ系",
  "封印系",
];

export interface StratagemUnlockThreshold {
  /** 計略・効果・発動設定の名前 */
  label: string;
  /** 出現判定の閾値（計略P + floor(知力×2/3) ≧ threshold） */
  threshold: number;
  /** 分類 */
  category: StratagemCategory;
  /** 効果の必要P（発動設定など、必要Pの無い項目は省略） */
  requiredP?: number;
}

const t = (
  category: StratagemCategory,
  label: string,
  requiredP: number | undefined,
  threshold: number
): StratagemUnlockThreshold =>
  requiredP == null
    ? { label, threshold, category }
    : { label, threshold, category, requiredP };

/**
 * 出現判定の閾値一覧（計略一覧の掲載順）。
 * 効果は計略一覧（効果）の「必要P」「出現判定」をそのまま写している。
 */
export const STRATAGEM_UNLOCK_THRESHOLDS: StratagemUnlockThreshold[] = [
  // ◆ 発動設定（効果以外で出現判定のあるもの）
  t("発動設定", "計略発動条件：先制", undefined, 120),
  t("発動設定", "計略発動タイミング：2つ目", undefined, 150),
  t("発動設定", "計略効果：3つ目", undefined, 150),
  t("発動設定", "発動率ボーナス：11%", undefined, 240),
  t("発動設定", "発動率ボーナス：-2%", undefined, 250),
  t("発動設定", "発動率ボーナス：12%", undefined, 300),

  // ◆ 直接ダメージ系（威力系）
  t("威力系", "威力 50+知力", 10, 50),
  t("威力系", "威力 70+知力", 20, 100),
  t("威力系", "威力 100+知力", 30, 150),
  t("威力系", "威力 130+知力", 40, 180),
  t("威力系", "威力 160+知力", 50, 210),
  t("威力系", "大宴会", 60, 230),
  t("威力系", "神算鬼謀（威力系）", 70, 250),
  t("威力系", "機知縦横（威力系）", 80, 300),
  t("威力系", "同士討（威力系）", 90, 300),
  t("威力系", "神威赫赫（威力系）", 80, 300),

  // ◆ 士気ダウン系
  t("士気ダウン系", "士気ダウン威力10", 10, 0),
  t("士気ダウン系", "士気ダウン威力15", 15, 30),
  t("士気ダウン系", "士気ダウン威力20", 20, 90),
  t("士気ダウン系", "罵声（士気ダウン系）", 40, 130),

  // ◆ 攻撃防御UP系
  t("攻撃防御UP系", "攻撃力+10%", 5, 0),
  t("攻撃防御UP系", "攻撃力+20%", 10, 20),
  t("攻撃防御UP系", "攻撃力+25%", 15, 40),
  t("攻撃防御UP系", "攻撃力+30%", 20, 80),
  t("攻撃防御UP系", "攻撃力+40%", 30, 120),
  t("攻撃防御UP系", "攻撃力+50%", 40, 150),
  t("攻撃防御UP系", "攻守向上+10%", 20, 60),
  t("攻撃防御UP系", "攻守向上+20%", 30, 90),
  t("攻撃防御UP系", "攻守向上+30%", 45, 160),
  t("攻撃防御UP系", "防御力+10%", 5, 0),
  t("攻撃防御UP系", "防御力+20%", 10, 30),
  t("攻撃防御UP系", "防御力+25%", 15, 60),
  t("攻撃防御UP系", "防御力+30%", 20, 90),
  t("攻撃防御UP系", "防御力+40%", 25, 120),
  t("攻撃防御UP系", "鉄壁（防御力系）", 45, 180),

  // ◆ 回復系
  t("回復系", "士気回復 威力10", 5, 0),
  t("回復系", "士気回復 威力20", 10, 60),
  t("回復系", "士気回復 威力30", 20, 90),
  t("回復系", "士気回復 威力40", 25, 140),
  t("回復系", "激励（士気回復系）", 45, 230),
  t("回復系", "兵回復 小", 15, 100),
  t("回復系", "兵回復 中", 25, 160),
  t("回復系", "治療（兵回復系）", 40, 200),
  t("回復系", "寝返り（兵回復系）", 60, 230),

  // ◆ ブースト系
  t("ブースト系", "武将アタック+3%", 10, 20),
  t("ブースト系", "武将アタック+5%", 15, 40),
  t("ブースト系", "武将アタック+8%", 25, 80),
  t("ブースト系", "武将アタック+10%", 35, 120),
  t("ブースト系", "万能将軍+3%", 30, 120),
  t("ブースト系", "万能将軍+5%", 60, 160),
  t("ブースト系", "万能将軍+8%", 80, 200),
  t("ブースト系", "兵種アタック+3%", 10, 20),
  t("ブースト系", "兵種アタック+5%", 15, 40),
  t("ブースト系", "兵種アタック+8%", 25, 80),
  t("ブースト系", "兵種アタック+10%", 35, 120),

  // ◆ 嫌がらせ系（妨害・略奪）
  t("嫌がらせ系", "敵計略-3%", 10, 40),
  t("嫌がらせ系", "敵計略-5%", 15, 60),
  t("嫌がらせ系", "敵計略-8%", 25, 80),
  t("嫌がらせ系", "敵計略-10%", 30, 120),
  t("嫌がらせ系", "敵計略半減", 35, 120),
  t("嫌がらせ系", "敵武将アタック-3%", 10, 40),
  t("嫌がらせ系", "敵武将アタック-5%", 15, 60),
  t("嫌がらせ系", "敵武将アタック-8%", 20, 90),
  t("嫌がらせ系", "敵武将アタック-10%", 25, 120),
  t("嫌がらせ系", "敵武将アタック半減", 30, 120),
  t("嫌がらせ系", "敵兵種アタック-3%", 10, 40),
  t("嫌がらせ系", "敵兵種アタック-5%", 15, 60),
  t("嫌がらせ系", "敵兵種アタック-8%", 20, 90),
  t("嫌がらせ系", "敵兵種アタック-10%", 25, 120),
  t("嫌がらせ系", "敵兵種アタック半減", 30, 120),
  t("嫌がらせ系", "略奪 威力10", 10, 80),
  t("嫌がらせ系", "略奪 威力20", 20, 140),
  t("嫌がらせ系", "略奪 威力30", 35, 180),
  t("嫌がらせ系", "後方襲撃（略奪系）", 50, 220),

  // ◆ 封印系
  t("封印系", "敵計略封印", 60, 150),
  t("封印系", "両者武将アタック封印", 50, 160),
  t("封印系", "敵武将アタック封印", 60, 180),
  t("封印系", "両者兵種アタック封印", 50, 160),
  t("封印系", "敵兵種アタック封印", 60, 180),
  t("封印系", "乱戦（封印系）", 80, 230),
];

/** 知力が判定値に効く割合（2/3）。 */
const INTELLIGENCE_WEIGHT = 2 / 3;

/** 出現判定値 = 計略P + floor(知力 × 2/3)。 */
export function stratagemJudgeValue(
  intelligence: number,
  strategy: number
): number {
  return strategy + Math.floor(intelligence * INTELLIGENCE_WEIGHT);
}

export interface StratagemUnlockStatus extends StratagemUnlockThreshold {
  /** 現在の出現判定値で解放済みか。 */
  unlocked: boolean;
  /** 現在の出現判定値。 */
  currentValue: number;
  /** 知力を変えず計略Pだけを増やす場合、解放に必要な追加計略P（解放済みなら0）。 */
  neededStrategy: number;
  /** 計略Pを変えず知力だけを増やす場合、解放に必要な追加知力（解放済みなら0）。 */
  neededIntelligence: number;
}

/**
 * 知力・計略Pから、各計略の出現判定の到達状況を計算する。
 * 未解放のものは「計略Pをあと何増やせば解放できるか」「知力をあと何増やせば解放できるか」
 * をそれぞれ独立に（もう片方は変えない前提で）返す。
 */
export function computeStratagemUnlockStatus(
  intelligence: number,
  strategy: number
): StratagemUnlockStatus[] {
  const currentValue = stratagemJudgeValue(intelligence, strategy);
  return STRATAGEM_UNLOCK_THRESHOLDS.map((item) => {
    const unlocked = currentValue >= item.threshold;
    if (unlocked) {
      return {
        ...item,
        unlocked,
        currentValue,
        neededStrategy: 0,
        neededIntelligence: 0,
      };
    }
    // 計略P側：不足分をそのまま切り上げ（計略Pは小数もあり得る）。
    const neededStrategy = Math.ceil(item.threshold - currentValue);
    // 知力側：floor(知力×2/3) ≧ n ⇔ 知力 ≧ n × 3/2 （n は整数）。
    const n = Math.ceil(item.threshold - strategy);
    const neededIntelligence = Math.max(
      0,
      Math.ceil(n / INTELLIGENCE_WEIGHT) - intelligence
    );
    return {
      ...item,
      unlocked,
      currentValue,
      neededStrategy,
      neededIntelligence,
    };
  });
}

/** 同じ閾値でまとめた未解放項目のグループ。 */
export interface StratagemUnlockTier {
  threshold: number;
  neededStrategy: number;
  neededIntelligence: number;
  items: StratagemUnlockStatus[];
}

/** 未解放の項目を閾値ごとにまとめ、閾値の低い順に返す。 */
export function groupPendingByThreshold(
  statuses: StratagemUnlockStatus[]
): StratagemUnlockTier[] {
  const map = new Map<number, StratagemUnlockStatus[]>();
  for (const s of statuses) {
    if (s.unlocked) continue;
    const list = map.get(s.threshold) ?? [];
    list.push(s);
    map.set(s.threshold, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([threshold, items]) => ({
      threshold,
      neededStrategy: items[0].neededStrategy,
      neededIntelligence: items[0].neededIntelligence,
      items,
    }));
}
