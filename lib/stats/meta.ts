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
