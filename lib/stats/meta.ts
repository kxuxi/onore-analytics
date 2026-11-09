export const MATCHUP_TRAITS = [
  "武特",
  "知特",
  "統特",
  "武統",
  "知武",
  "統知",
  "戦闘狂",
];

export interface TraitMatchupCell {
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

export interface TraitMatchupMatrix {
  traits: string[];
  matrix: TraitMatchupCell[][];
}

export interface YearRange {
  from: number | null;
  to: number | null;
}

export interface MetaPeriod extends YearRange {
  key: string;
  label: string;
}

export const META_PERIODS: MetaPeriod[] = [
  { key: "y06", label: "06年-11年", from: 1606, to: 1611 },
  { key: "y12", label: "12年-17年", from: 1612, to: 1617 },
  { key: "y18", label: "18年-23年", from: 1618, to: 1623 },
  { key: "y24", label: "24年-35年", from: 1624, to: 1635 },
  { key: "y36", label: "36年-47年", from: 1636, to: 1647 },
  { key: "y48", label: "48年-59年", from: 1648, to: 1659 },
  { key: "y60", label: "60年以降", from: 1660, to: null },
  { key: "all", label: "全期間", from: null, to: null },
];

export const RANKING_LAST10_KEY = "last10";

export type MetaTier = "S+" | "S" | "A+" | "A" | "B" | "C";

export const META_MIN_TIER_DECIDED = 10;

export interface MetaUnitStat {
  unit: string;
  branch?: string;
  appearances: number;
  pickRate: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
  tier: MetaTier | null;
  trend: number | null;
}

export interface MetaTraitStat {
  trait: string;
  appearances: number;
  pickRate: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

export interface MetaOverview {
  totalBattles: number;
  units: MetaUnitStat[];
  traits: MetaTraitStat[];
}

export function metaTier(
  pickRate: number,
  winRate: number,
  decided: number
): MetaTier | null {
  if (decided < META_MIN_TIER_DECIDED) return null;
  if (pickRate > 0.15 && winRate > 0.65) return "S+";
  if (pickRate > 0.1 && winRate > 0.6) return "S";
  if (pickRate > 0.05 && winRate > 0.55) return "A+";
  if (winRate >= 0.52) return "A";
  if (winRate >= 0.45) return "B";
  return "C";
}

/**
 * 使い手の「普段の勝率」を出すときの事前分布（50% を k 戦ぶん足して縮める）。
 * 対戦数の少ない武将の勝率が極端な値（1戦1勝＝100%）になるのを防ぐ。
 */
export const META_BASELINE_PRIOR_BATTLES = 6;
/** 兵種の使い手1人ぶんの集計。 */
export interface MetaUnitUser {
  /** 代表名（名寄せ済み） */
  name: string;
  /** その兵種での登場数 */
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  /** その兵種での勝率 */
  winRate: number;
  /** その兵種以外での確定戦数（普段の勝率の母数） */
  baselineDecided: number;
  /** 普段の勝率（その兵種以外の戦績を 50% に向けて縮めた値） */
  baselineRate: number;
}

/** 兵種ごとの使い手の内訳。 */
export interface MetaUnitUsage {
  unit: string;
  users: MetaUnitUser[];
  /** 使い手の人数 */
  userCount: number;
  /** 使い手の普段の勝率を確定戦数で加重平均したもの（確定戦が無ければ null） */
  expectedRate: number | null;
  /** 兵種の勝率 − 使い手の普段の勝率（確定戦が無ければ null） */
  lift: number | null;
}

