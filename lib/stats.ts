import {
  parseBattleCard,
  normalizeDisplayToken,
  battleKey,
  type BattleCard,
  type BattleSide,
  type BattleWinner,
} from "./parser";
import { parseActionDate } from "./action";
import { splitGoodAgainst } from "./unitTypeForm";
import type { BattleRecord, UnitType, WarlordMap } from "./types";
import {
  MATCHUP_TRAITS,
  META_MIN_TIER_DECIDED,
  META_PERIODS,
  RANKING_LAST10_KEY,
  metaTier,
  type MetaOverview,
  type MetaPeriod,
  type MetaTraitStat,
  type MetaUnitStat,
  type MetaWarning,
  type TraitMatchupMatrix,
  type YearRange,
} from "./stats/meta";

export {
  MATCHUP_TRAITS,
  META_MIN_TIER_DECIDED,
  META_PERIODS,
  RANKING_LAST10_KEY,
  metaTier,
};
export type {
  MetaOverview,
  MetaPeriod,
  MetaTier,
  MetaTraitStat,
  MetaUnitStat,
  MetaWarning,
  TraitMatchupCell,
  TraitMatchupMatrix,
  YearRange,
} from "./stats/meta";

export type SideKey = "left" | "right";
export type OutcomeResult = "win" | "loss" | "other";

/** 戦闘ログ一覧の 1 ページあたり表示件数（戦闘履歴・武将/兵種詳細で共通）。 */
export const BATTLE_LOG_PAGE_SIZE = 20;

/** 1 戦闘を「ある側（武将 / 兵種）の視点」で見た結果 */
export interface BattleOutcome {
  record: BattleRecord;
  card: BattleCard;
  /** 注目している側 */
  side: SideKey;
  /** 注目側の情報 */
  self: BattleSide;
  /** 相手側の情報 */
  opponent: BattleSide;
  /** 注目側から見た勝敗 */
  result: OutcomeResult;
}

export interface StatSummary {
  /** 関与した戦闘総数 */
  battles: number;
  wins: number;
  losses: number;
  /** 撤退・引分・不明など勝敗が確定しなかった数 */
  others: number;
  /** 勝敗が確定した数 (wins + losses) */
  decided: number;
  /** 勝率 0..1（decided が 0 のときは 0） */
  winRate: number;
}

/** 指定した側から見た勝敗。draw / retreat / unknown は "other"。 */
export function outcomeForSide(
  winner: BattleWinner,
  side: SideKey
): OutcomeResult {
  if (winner === "left" || winner === "right") {
    return winner === side ? "win" : "loss";
  }
  return "other";
}

function normalizeFactionFilter(
  faction: string | undefined
): string | undefined {
  return faction?.trim() || undefined;
}

function sideMatchesFaction(
  side: Pick<BattleSide, "faction">,
  faction: string | undefined
): boolean {
  return !faction || side.faction?.trim() === faction;
}

/**
 * ログ配列（参照）ごとの dedupedCards 結果メモ。多くの集計関数が同じ log
 * （filteredBattleLog 等の安定した useMemo 参照）に対して呼ぶため、参照が同じなら
 * 1 回の重複排除・カード化を共有する。log 配列は不変（毎回新しい配列）前提。
 * 返す配列は読み取り専用として共有する（呼び出し側で破壊的変更をしないこと）。
 */
const dedupedCache = new WeakMap<
  BattleRecord[],
  { record: BattleRecord; card: BattleCard }[]
>();

/** ログをカード化し、内容が重複する行を除外する（log 参照でメモ化）。 */
function dedupedCards(
  log: BattleRecord[]
): { record: BattleRecord; card: BattleCard }[] {
  const cached = dedupedCache.get(log);
  if (cached) return cached;
  const seen = new Set<string>();
  const out: { record: BattleRecord; card: BattleCard }[] = [];
  for (const record of log) {
    const key = battleKey(record.line);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const card = parseBattleCard(record.line);
    if (card) out.push({ record, card });
  }
  dedupedCache.set(log, out);
  return out;
}

function makeOutcome(
  record: BattleRecord,
  card: BattleCard,
  side: SideKey
): BattleOutcome {
  const self = side === "left" ? card.left : card.right;
  const opponent = side === "left" ? card.right : card.left;
  return {
    record,
    card,
    side,
    self,
    opponent,
    result: outcomeForSide(card.winner, side),
  };
}

/** 戦闘時刻の新しい順に並べ替える。 */
function sortByTimeDesc(list: BattleOutcome[]): BattleOutcome[] {
  const now = new Date();
  const timeOf = (o: BattleOutcome) =>
    parseActionDate(o.record.time, now)?.getTime() ?? null;
  return [...list].sort((a, b) => {
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (ta != null && tb != null) {
      if (tb !== ta) return tb - ta;
      return b.record.savedAt - a.record.savedAt;
    }
    if (ta != null) return -1;
    if (tb != null) return 1;
    return b.record.savedAt - a.record.savedAt;
  });
}

function unitMatches(side: BattleSide, target: string): boolean {
  if (!side.unit) return false;
  return normalizeDisplayToken(side.unit) === target;
}

/** 指定武将が登場した戦闘を新しい順で集める。aliases に同一人物の別名を渡すと統合集計。 */
export function collectWarlordBattles(
  log: BattleRecord[],
  name: string
): BattleOutcome[] {
  const nameMap = logNameMap(log);
  const target = name.trim();
  const out: BattleOutcome[] = [];
  for (const { record, card } of dedupedCards(log)) {
    // (term, 家名) で名寄せした代表名が対象と一致する側を集める。
    // 通常は左右どちらか一方のみ一致する。両方一致した場合は左を優先。
    if (
      resolveLogName(nameMap, record.term, card.left.family, card.left.name) ===
      target
    )
      out.push(makeOutcome(record, card, "left"));
    else if (
      resolveLogName(nameMap, record.term, card.right.family, card.right.name) ===
      target
    )
      out.push(makeOutcome(record, card, "right"));
  }
  return sortByTimeDesc(out);
}

/** 指定兵種が使われた戦闘を集める（同戦闘で両側が使えば 2 件）。 */
export function collectUnitBattles(
  log: BattleRecord[],
  unitName: string
): BattleOutcome[] {
  const target = unitName.trim();
  const out: BattleOutcome[] = [];
  for (const { record, card } of dedupedCards(log)) {
    if (unitMatches(card.left, target))
      out.push(makeOutcome(record, card, "left"));
    if (unitMatches(card.right, target))
      out.push(makeOutcome(record, card, "right"));
  }
  return sortByTimeDesc(out);
}

/**
 * ログ中の戦闘に登場した兵種名（表示名に正規化・攻守両側）の集合を返す。
 * 兵種図鑑を「選択中の期に登場した兵種のみ」に絞り込む用途などに使う。
 */
export function unitNamesInLog(log: BattleRecord[]): Set<string> {
  const names = new Set<string>();
  for (const record of log) {
    const card = parseBattleCard(record.line);
    if (!card) continue;
    if (card.left.unit) names.add(normalizeDisplayToken(card.left.unit));
    if (card.right.unit) names.add(normalizeDisplayToken(card.right.unit));
  }
  return names;
}

/**
 * ログ中の戦闘に登場した武将名（攻守両側）の集合を返す。
 * db を渡すと household 統合で最新の代表名へ寄せる。
 * ホームの武将選択を「対象の期に登場した武将」に絞る用途などに使う。
 */
export function warlordNamesInLog(
  log: BattleRecord[],
  db?: WarlordMap
): Set<string> {
  const nameMap = db ? logNameMap(log) : null;
  const names = new Set<string>();
  for (const record of log) {
    const card = parseBattleCard(record.line);
    if (!card) continue;
    for (const side of [card.left, card.right]) {
      const raw = side.name?.trim();
      if (!raw) continue;
      names.add(resolveLogName(nameMap, record.term, side.family, raw));
    }
  }
  return names;
}

/** 勝利数・敗北数・勝率などを集計する。 */
export function summarize(outcomes: BattleOutcome[]): StatSummary {
  let wins = 0;
  let losses = 0;
  let others = 0;
  for (const o of outcomes) {
    if (o.result === "win") wins++;
    else if (o.result === "loss") losses++;
    else others++;
  }
  const decided = wins + losses;
  return {
    battles: outcomes.length,
    wins,
    losses,
    others,
    decided,
    winRate: decided > 0 ? wins / decided : 0,
  };
}

/**
 * 勝率 (0..1) を表示用の文字列に整形する。
 * 勝敗が確定していない (decided === 0) ときは "—" を返す。
 * アプリ全体で表示桁を統一するため、各コンポーネントはこのヘルパーを利用する。
 */
export function formatWinRate(rate: number, decided: number): string {
  if (decided <= 0) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/** 注目側が使った兵種の使用回数（多い順）。 */
export function unitUsage(
  outcomes: BattleOutcome[]
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const o of outcomes) {
    const u = o.self.unit ? normalizeDisplayToken(o.self.unit) : "不明";
    map.set(u, (map.get(u) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** outcomes の最新エントリから注目側のプロフィール（国・タイプ等）を得る。 */
export function latestSelfProfile(
  outcomes: BattleOutcome[]
): BattleSide | undefined {
  return outcomes[0]?.self;
}

/* ---------- 相性ランキング・因縁の相手 ---------- */

/** 対戦相手ごとの戦績。 */
export interface OpponentStat {
  name: string;
  /** 直近の対戦時点での相手の所属国 */
  faction?: string;
  battles: number;
  wins: number;
  losses: number;
  others: number;
  decided: number;
  winRate: number;
}

/**
 * 対戦相手ごとに戦績を集計する。
 * outcomes は新しい順に並んでいるため、各相手の faction は最初に出現した
 * （＝最新の）対戦時のものを採用する。
 */
export function opponentStats(outcomes: BattleOutcome[]): OpponentStat[] {
  const map = new Map<string, OpponentStat>();
  for (const o of outcomes) {
    const name = o.opponent.name?.trim();
    if (!name) continue;
    let s = map.get(name);
    if (!s) {
      s = {
        name,
        faction: o.opponent.faction,
        battles: 0,
        wins: 0,
        losses: 0,
        others: 0,
        decided: 0,
        winRate: 0,
      };
      map.set(name, s);
    }
    s.battles++;
    if (o.result === "win") s.wins++;
    else if (o.result === "loss") s.losses++;
    else s.others++;
  }
  const arr = Array.from(map.values());
  for (const s of arr) {
    s.decided = s.wins + s.losses;
    s.winRate = s.decided > 0 ? s.wins / s.decided : 0;
  }
  return arr;
}

/** 相性ランキング（勝敗が確定した相手のみ。良い順／悪い順）。 */
export interface MatchupRanking {
  best: OpponentStat[];
  worst: OpponentStat[];
}

/**
 * 対戦相手を勝率順に並べ、相性の良い／苦手な相手 TOP3 を返す。
 * 勝敗が確定した対戦が 1 度でもある相手のみ対象。
 * - 相性の良い相手 = 勝ち越している相手（勝率 > 50%）を勝率の高い順に。
 * - 苦手な相手 = 負け越している相手（勝率 < 50%）を勝率の低い順に。
 * 勝率 50%（五分）の相手はどちらにも含めない。良い／苦手は勝率で
 * 明確に分かれるため、同じ相手が両方に出ることはない。
 */
export function matchupRanking(
  outcomes: BattleOutcome[],
  top = 3
): MatchupRanking {
  const decided = opponentStats(outcomes).filter((s) => s.decided > 0);
  const best = decided
    .filter((s) => s.winRate > 0.5)
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.decided - a.decided ||
        b.battles - a.battles
    )
    .slice(0, top);
  const worst = decided
    .filter((s) => s.winRate < 0.5)
    .sort(
      (a, b) =>
        a.winRate - b.winRate ||
        b.decided - a.decided ||
        b.battles - a.battles
    )
    .slice(0, top);
  return { best, worst };
}

/* ---------- 兵種別の勝率 ---------- */

/** 兵種（万能 / 騎兵 / 歩兵 など）ごとの戦績。 */
export interface BranchStat {
  branch: string;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/** 注目側が出陣した兵種ごとに勝率を集計する（戦闘数の多い順）。 */
export function branchStats(outcomes: BattleOutcome[]): BranchStat[] {
  const map = new Map<string, BranchStat>();
  for (const o of outcomes) {
    const branch = o.self.branch?.trim() || "不明";
    let s = map.get(branch);
    if (!s) {
      s = { branch, battles: 0, wins: 0, losses: 0, decided: 0, winRate: 0 };
      map.set(branch, s);
    }
    s.battles++;
    if (o.result === "win") s.wins++;
    else if (o.result === "loss") s.losses++;
  }
  const arr = Array.from(map.values());
  for (const s of arr) {
    s.decided = s.wins + s.losses;
    s.winRate = s.decided > 0 ? s.wins / s.decided : 0;
  }
  return arr.sort((a, b) => b.battles - a.battles);
}

/* ---------- 兵種別の習熟度・相手特性別の勝率（ホーム用） ---------- */

/** 注目側が使った兵種ごとの戦績（習熟度の指標。戦闘数の多い順）。 */
export interface SelfUnitStat {
  unit: string;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/** 注目側が出陣した兵種ごとに勝率を集計する（戦闘数の多い順）。 */
export function selfUnitStats(outcomes: BattleOutcome[]): SelfUnitStat[] {
  const map = new Map<string, SelfUnitStat>();
  for (const o of outcomes) {
    const unit = o.self.unit ? normalizeDisplayToken(o.self.unit) : "不明";
    let s = map.get(unit);
    if (!s) {
      s = { unit, battles: 0, wins: 0, losses: 0, decided: 0, winRate: 0 };
      map.set(unit, s);
    }
    s.battles++;
    if (o.result === "win") s.wins++;
    else if (o.result === "loss") s.losses++;
  }
  const arr = Array.from(map.values());
  for (const s of arr) {
    s.decided = s.wins + s.losses;
    s.winRate = s.decided > 0 ? s.wins / s.decided : 0;
  }
  return arr.sort((a, b) => b.battles - a.battles);
}

/** 相手の特性（タイプ）ごとの注目側戦績（戦闘数の多い順）。 */
export interface OpponentTraitStat {
  trait: string;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/** 相手の特性（タイプ）ごとに注目側の勝率を集計する（戦闘数の多い順）。 */
export function opponentTraitStats(
  outcomes: BattleOutcome[]
): OpponentTraitStat[] {
  const map = new Map<string, OpponentTraitStat>();
  for (const o of outcomes) {
    const trait = o.opponent.type?.trim() || "不明";
    let s = map.get(trait);
    if (!s) {
      s = { trait, battles: 0, wins: 0, losses: 0, decided: 0, winRate: 0 };
      map.set(trait, s);
    }
    s.battles++;
    if (o.result === "win") s.wins++;
    else if (o.result === "loss") s.losses++;
  }
  const arr = Array.from(map.values());
  for (const s of arr) {
    s.decided = s.wins + s.losses;
    s.winRate = s.decided > 0 ? s.wins / s.decided : 0;
  }
  return arr.sort((a, b) => b.battles - a.battles);
}

/* ---------- 先週比の勝率トレンド（ホーム用） ---------- */

/** 「先週比」の勝率トレンド。 */
export interface WeeklyTrend {
  /** 今週（基準日からさかのぼって 7 日間）の勝率 0..1 */
  thisRate: number;
  /** 今週の勝敗確定数 */
  thisDecided: number;
  /** 先週（基準日の 7〜14 日前）の勝率 0..1 */
  lastRate: number;
  /** 先週の勝敗確定数 */
  lastDecided: number;
  /** 今週 − 先週 の勝率差（0..1 単位）。両週とも確定戦が無いと null。 */
  delta: number | null;
}

/**
 * 「先週比」の勝率トレンドを算出する。
 * 最新の戦闘日時を基準（アンカー）に、そこからさかのぼった 7 日間（今週）と
 * その前の 7 日間（先週）の勝率を比較する。実日時が無い戦闘は対象外。
 * 基準を「最新の戦闘」に固定することで、戦闘を記録しない限り数値は動かない
 * （日付が進むだけで今週／先週の区切りがずれて先週比が変わるのを防ぐ）。
 */
export function weeklyWinRateTrend(
  outcomes: BattleOutcome[],
  now: Date = new Date()
): WeeklyTrend {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const dated: { o: BattleOutcome; t: number }[] = [];
  for (const o of outcomes) {
    const d = parseActionDate(o.record.time, now);
    if (d) dated.push({ o, t: d.getTime() });
  }
  if (dated.length === 0) {
    return { thisRate: 0, thisDecided: 0, lastRate: 0, lastDecided: 0, delta: null };
  }
  // 基準は「最新の戦闘日時」。日付の経過では動かず、戦闘を記録した時だけ更新される。
  const anchor = Math.max(...dated.map((x) => x.t));
  const thisStart = anchor - WEEK_MS;
  const lastStart = anchor - 2 * WEEK_MS;
  const thisWeek: BattleOutcome[] = [];
  const lastWeek: BattleOutcome[] = [];
  for (const { o, t } of dated) {
    if (t > thisStart) thisWeek.push(o);
    else if (t > lastStart) lastWeek.push(o);
  }
  const a = summarize(thisWeek);
  const b = summarize(lastWeek);
  const delta = a.decided > 0 && b.decided > 0 ? a.winRate - b.winRate : null;
  return {
    thisRate: a.winRate,
    thisDecided: a.decided,
    lastRate: b.winRate,
    lastDecided: b.decided,
    delta,
  };
}

/* ---------- 年代別（在ゲーム年）の勝率ランキング ---------- */

/** 年代バケット（在ゲーム年の下2桁で区切る）。 */
export interface YearBucket {
  /** 内部キー（例: "06-11"）。 */
  key: string;
  /** 表示ラベル（例: "06年-11年"）。 */
  label: string;
  /** 下2桁の下限（含む）。 */
  min: number;
  /** 下2桁の上限（含む）。 */
  max: number;
}

/**
 * 在ゲーム年の下2桁で区切った年代バケット。
 * 06〜59 は固定幅、60 以上は「60年以降」で1つにまとめる。
 */
export const YEAR_BUCKETS: YearBucket[] = [
  { key: "06-11", label: "06年-11年", min: 6, max: 11 },
  { key: "12-17", label: "12年-17年", min: 12, max: 17 },
  { key: "18-23", label: "18年-23年", min: 18, max: 23 },
  { key: "24-35", label: "24年-35年", min: 24, max: 35 },
  { key: "36-47", label: "36年-47年", min: 36, max: 47 },
  { key: "48-59", label: "48年-59年", min: 48, max: 59 },
  { key: "60+", label: "60年以降", min: 60, max: 99 },
];

/** ランキングに載せる最低決着戦数（勝敗が確定した戦闘数）。 */
export const YEAR_RANK_MIN_DECIDED = 10;
/** 各バケットで何位まで表彰するか。 */
export const YEAR_RANK_TOP_N = 3;

/**
 * "1706年2月 06/18 12:36" などの戦闘時刻から在ゲーム年（西暦）を取り出す。
 * 年が含まれない／パースできない場合は null。
 */
export function parseGameYear(time: string | undefined): number | null {
  if (!time) return null;
  const m = time.match(/(\d+)\s*年/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/** 在ゲーム年（西暦）が属する年代バケットを返す（下2桁で判定）。該当なしは null。 */
export function yearBucketFor(year: number): YearBucket | null {
  const yy = ((year % 100) + 100) % 100;
  return YEAR_BUCKETS.find((b) => yy >= b.min && yy <= b.max) ?? null;
}

/** 年代別ランキングの 1 エントリ（武将 1 人ぶん）。 */
export interface WarlordYearRankEntry {
  /** 代表名（家督統合後）。 */
  name: string;
  /** バケット内の順位（1..N）。 */
  rank: number;
  /** バケット内の関与戦闘数。 */
  battles: number;
  wins: number;
  losses: number;
  /** 勝敗が確定した戦闘数（wins + losses）。 */
  decided: number;
  /** 勝率 0..1。 */
  winRate: number;
}

/** 1 バケットぶんのランキング。 */
export interface YearBucketRanking {
  bucket: YearBucket;
  /** 勝率の高い順（最大 topN 件）。 */
  entries: WarlordYearRankEntry[];
}

/**
 * 在ゲーム年の年代ごとに、武将を勝率（総合＝出兵＋守備）で順位付けする。
 * 各バケットで決着戦数が minDecided 以上の武将のみを対象に上位 topN を返す。
 *
 * @param log 戦闘ログ（期で絞らず全期間を渡す想定）。
 * @param db 武将DB。渡すと同じ household の別名を代表名へ統合して集計する。
 */
export function yearBucketWinRankings(
  log: BattleRecord[],
  db?: WarlordMap,
  opts?: { minDecided?: number; topN?: number }
): YearBucketRanking[] {
  const minDecided = opts?.minDecided ?? YEAR_RANK_MIN_DECIDED;
  const topN = opts?.topN ?? YEAR_RANK_TOP_N;
  const nameMap = db ? logNameMap(log) : null;
  const norm = (
    side: { name?: string; family?: string },
    term: number | undefined
  ): string | null => {
    const k = side.name?.trim();
    if (!k) return null;
    return resolveLogName(nameMap, term, side.family, k);
  };

  interface Tally {
    battles: number;
    wins: number;
    losses: number;
  }
  // バケットキー -> 代表名 -> 集計。
  const byBucket = new Map<string, Map<string, Tally>>();
  for (const b of YEAR_BUCKETS) byBucket.set(b.key, new Map());

  for (const { record, card } of dedupedCards(log)) {
    const year = parseGameYear(record.time ?? card.battleAt);
    if (year === null) continue;
    const bucket = yearBucketFor(year);
    if (!bucket) continue;
    const table = byBucket.get(bucket.key)!;

    const leftRep = norm(card.left, record.term);
    const rightRep = norm(card.right, record.term);
    // 通常は別人。同一人物に正規化される稀なケースは片側のみ計上する。
    const sides: { rep: string; side: SideKey }[] = [];
    if (leftRep) sides.push({ rep: leftRep, side: "left" });
    if (rightRep && rightRep !== leftRep)
      sides.push({ rep: rightRep, side: "right" });

    for (const { rep, side } of sides) {
      const t = table.get(rep) ?? { battles: 0, wins: 0, losses: 0 };
      t.battles += 1;
      const r = outcomeForSide(card.winner, side);
      if (r === "win") t.wins += 1;
      else if (r === "loss") t.losses += 1;
      table.set(rep, t);
    }
  }

  return YEAR_BUCKETS.map((bucket) => {
    const table = byBucket.get(bucket.key)!;
    const entries: WarlordYearRankEntry[] = [];
    for (const [name, t] of table) {
      const decided = t.wins + t.losses;
      if (decided < minDecided) continue;
      entries.push({
        name,
        rank: 0,
        battles: t.battles,
        wins: t.wins,
        losses: t.losses,
        decided,
        winRate: decided > 0 ? t.wins / decided : 0,
      });
    }
    entries.sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.decided - a.decided ||
        a.name.localeCompare(b.name, "ja")
    );
    const top = entries.slice(0, topN);
    top.forEach((e, i) => (e.rank = i + 1));
    return { bucket, entries: top };
  });
}

/** 武将ページに付ける年代別ランキングのタグ。 */
export interface YearRankTag {
  /** バケットキー（例: "06-11"）。 */
  bucketKey: string;
  /** 表示ラベル（例: "06年-11年"）。 */
  label: string;
  /** 順位（1..N）。 */
  rank: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/**
 * 指定した代表名の武将が入賞している年代バケットのタグ一覧を返す。
 * バケットは YEAR_BUCKETS の並び順（古い年代→新しい年代）。
 */
export function warlordYearRankTags(
  rankings: YearBucketRanking[],
  repName: string
): YearRankTag[] {
  const key = repName.trim();
  if (!key) return [];
  const out: YearRankTag[] = [];
  for (const { bucket, entries } of rankings) {
    const e = entries.find((x) => x.name === key);
    if (!e) continue;
    out.push({
      bucketKey: bucket.key,
      label: bucket.label,
      rank: e.rank,
      wins: e.wins,
      losses: e.losses,
      decided: e.decided,
      winRate: e.winRate,
    });
  }
  return out;
}

/* ---------- 時間帯・曜日別の勝率ヒートマップ ---------- */

/** 曜日ラベル（getDay() の 0..6 に対応）。 */
export const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
/** 1 バケットあたりの時間幅（時間）。 */
const HEAT_BUCKET_HOURS = 3;
/** 時間帯バケット数（24h / 3h = 8）。 */
export const HEAT_BUCKETS = 24 / HEAT_BUCKET_HOURS;

export interface HeatCell {
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

export interface WinHeatmap {
  /** [曜日 0..6][時間帯バケット 0..HEAT_BUCKETS-1] */
  cells: HeatCell[][];
  /** 各バケットの開始時刻ラベル（例: "0", "3", ...） */
  bucketLabels: string[];
  /** 日時を特定できた戦闘数 */
  dated: number;
}

/**
 * 戦闘を「曜日 × 時間帯」のセルに振り分け、各セルの勝率を求める。
 * 行動時刻（実時刻 MM/DD HH:mm）を基準にするため曜日は現実の曜日になる。
 */
export function winHeatmap(outcomes: BattleOutcome[]): WinHeatmap {
  const now = new Date();
  const cells: HeatCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: HEAT_BUCKETS }, () => ({
      battles: 0,
      wins: 0,
      losses: 0,
      decided: 0,
      winRate: 0,
    }))
  );
  let dated = 0;
  for (const o of outcomes) {
    const d = parseActionDate(o.record.time, now);
    if (!d) continue;
    dated++;
    const day = d.getDay();
    const bucket = Math.min(
      HEAT_BUCKETS - 1,
      Math.floor(d.getHours() / HEAT_BUCKET_HOURS)
    );
    const c = cells[day][bucket];
    c.battles++;
    if (o.result === "win") c.wins++;
    else if (o.result === "loss") c.losses++;
  }
  for (const row of cells) {
    for (const c of row) {
      c.decided = c.wins + c.losses;
      c.winRate = c.decided > 0 ? c.wins / c.decided : 0;
    }
  }
  const bucketLabels = Array.from(
    { length: HEAT_BUCKETS },
    (_, i) => `${i * HEAT_BUCKET_HOURS}`
  );
  return { cells, bucketLabels, dated };
}

/* ---------- 所属国の遍歴 ---------- */

/** ある国に所属していた 1 区間。 */
export interface FactionStint {
  faction: string;
  /** 区間内で最も古い在籍年（不明なら 0） */
  startYear: number;
  /** 区間内で最も新しい在籍年（不明なら 0） */
  endYear: number;
  battles: number;
  /** 以前にも所属していた国への出戻り区間か */
  returning: boolean;
}

/** battleAt（例: "1687年5月 06/15 09:30"）からゲーム内の年を取り出す。 */
function gameYear(card: BattleCard): number | null {
  const s = card.battleAt;
  if (!s) return null;
  const m = s.match(/(\d+)\s*年/);
  return m ? Number(m[1]) : null;
}

/** 戦闘（注目側視点の 1 件）からゲーム内の年を取り出す。年が不明なら null。 */
export function outcomeYear(o: BattleOutcome): number | null {
  return gameYear(o.card);
}

/** 年別の勝率（棒グラフ用）。ゲーム内の 1 年分の集計。 */
export interface YearlyWinRate {
  year: number;
  battles: number;
  wins: number;
  losses: number;
  /** 勝敗が確定した数（wins + losses） */
  decided: number;
  /** 勝率 0..1（decided が 0 のときは 0） */
  winRate: number;
}

/**
 * 戦績をゲーム内の年ごとに集計する。fromYear（既定 1600）からデータ内の
 * 最終年まで、年が飛んでいても連続した年の配列を返す（棒グラフ用に欠けた年も
 * 0 件で埋める）。年が判別できない戦闘は除外する。データが無ければ空配列。
 */
export function yearlyWinRates(
  outcomes: BattleOutcome[],
  fromYear = 1600
): YearlyWinRate[] {
  const map = new Map<number, { battles: number; wins: number; losses: number }>();
  let maxYear: number | null = null;
  for (const o of outcomes) {
    const y = outcomeYear(o);
    if (y == null) continue;
    let e = map.get(y);
    if (!e) {
      e = { battles: 0, wins: 0, losses: 0 };
      map.set(y, e);
    }
    e.battles++;
    if (o.result === "win") e.wins++;
    else if (o.result === "loss") e.losses++;
    if (maxYear == null || y > maxYear) maxYear = y;
  }
  if (maxYear == null) return [];
  const start = Math.min(fromYear, maxYear);
  const out: YearlyWinRate[] = [];
  for (let y = start; y <= maxYear; y++) {
    const e = map.get(y) ?? { battles: 0, wins: 0, losses: 0 };
    const decided = e.wins + e.losses;
    out.push({
      year: y,
      battles: e.battles,
      wins: e.wins,
      losses: e.losses,
      decided,
      winRate: decided > 0 ? e.wins / decided : 0,
    });
  }
  return out;
}

/**
 * battleAt からゲーム内の「年・月」を時系列順の比較値（year*12 + month）に変換する。
 * 月が取れない場合は year*12 を使う。年も取れなければ null。
 * 行動時刻（MM/DD HH:mm）は現実の時計時刻でありゲーム内の年とは無関係なため、
 * 所属国の遍歴はこのゲーム内年月を基準に並べる必要がある。
 */
function gameOrder(card: BattleCard): number | null {
  const year = gameYear(card);
  if (year == null) return null;
  const mm = card.battleAt?.match(/年\s*(\d+)\s*月/);
  const month = mm ? Number(mm[1]) : 1;
  return year * 12 + (month - 1);
}

/**
 * 戦闘ログから「同一人物」を term + 家名(family) でグループ化し、各人物の最新の
 * 表示名を決める名寄せマップを作る。改名（同一 term・同一家名で名前だけ変わる）を
 * 1つにまとめ、家名が無い／term・家名が違う同名は別人として区別する。
 *
 * db（name キー）から作ると、同名の別人が DB 上で1レコードに統合されてしまい
 * 区別できないため、ログ側の (term, family, name) から直接構築する。
 * キー = `${term}\u0000${family}\u0000${name}`、値 = 代表名。
 */
const logNameMapCache = new WeakMap<BattleRecord[], Map<string, string>>();

function logNameMap(log: BattleRecord[]): Map<string, string> {
  const cached = logNameMapCache.get(log);
  if (cached) return cached;
  // (term, family) グループごとに name -> その名前が登場した最新の在ゲーム年月。
  const groups = new Map<string, Map<string, number>>();
  for (const { record, card } of dedupedCards(log)) {
    const order = gameOrder(card) ?? -1;
    for (const side of [card.left, card.right]) {
      const name = side.name?.trim();
      const family = side.family?.trim();
      if (!name || !family) continue; // 家名が無い武将は名寄せ対象外
      const groupKey = `${record.term ?? ""}\u0000${family}`;
      let g = groups.get(groupKey);
      if (!g) {
        g = new Map();
        groups.set(groupKey, g);
      }
      const prev = g.get(name);
      if (prev == null || order > prev) g.set(name, order);
    }
  }
  // 各グループの代表 = 最新の在ゲーム年月を持つ名前（同率は先に現れた方）。
  const result = new Map<string, string>();
  for (const [groupKey, names] of groups) {
    let repName: string | null = null;
    let repOrder = -Infinity;
    for (const [name, order] of names) {
      if (order > repOrder) {
        repOrder = order;
        repName = name;
      }
    }
    if (repName == null) continue;
    for (const name of names.keys()) {
      result.set(`${groupKey}\u0000${name}`, repName);
    }
  }
  logNameMapCache.set(log, result);
  return result;
}

/**
 * ログ名寄せマップで (term, 家名, 名前) を代表名へ解決する。
 * 家名が無い、マップに無い場合は名前をそのまま返す。
 */
function resolveLogName(
  map: Map<string, string> | null,
  term: number | undefined,
  family: string | undefined,
  name: string | undefined
): string {
  const n = name?.trim() ?? "";
  if (!map || !n) return n;
  const f = family?.trim();
  if (!f) return n;
  return map.get(`${term ?? ""}\u0000${f}\u0000${n}`) ?? n;
}

/**
 * 武将が渡り歩いた国を時系列（古い順）の在籍区間に変換する。
 * 連続して同じ国に所属していた戦闘をまとめ、ゲーム内の年で区間を表す。
 * 一度離れた国へ戻った区間は returning（出戻り）として印を付ける。
 */
export function factionTimeline(outcomes: BattleOutcome[]): FactionStint[] {
  const now = new Date();
  const items = outcomes
    .map((o) => ({
      faction: o.self.faction?.trim() ?? "",
      year: gameYear(o.card),
      order: gameOrder(o.card),
      date: parseActionDate(o.record.time, now)?.getTime() ?? null,
      savedAt: o.record.savedAt,
    }))
    .filter((x) => x.faction.length > 0);
  // ゲーム内の年月（order）を最優先で古い順に並べる。
  // 同じ年月内のみ、補助的に実時刻・登録順で安定させる。
  items.sort((a, b) => {
    if (a.order != null && b.order != null) {
      if (a.order !== b.order) return a.order - b.order;
    } else if (a.order != null) {
      return -1;
    } else if (b.order != null) {
      return 1;
    }
    if (a.date != null && b.date != null && a.date !== b.date) {
      return a.date - b.date;
    }
    return a.savedAt - b.savedAt;
  });

  const stints: FactionStint[] = [];
  for (const it of items) {
    const prev = stints[stints.length - 1];
    if (prev && prev.faction === it.faction) {
      prev.battles++;
      if (it.year != null) {
        prev.startYear =
          prev.startYear === 0 ? it.year : Math.min(prev.startYear, it.year);
        prev.endYear = Math.max(prev.endYear, it.year);
      }
    } else {
      stints.push({
        faction: it.faction,
        startYear: it.year ?? 0,
        endYear: it.year ?? 0,
        battles: 1,
        returning: false,
      });
    }
  }
  // 同じ国が 2 度目以降に登場する区間は「出戻り」とみなす。
  const seen = new Set<string>();
  for (const s of stints) {
    if (seen.has(s.faction)) s.returning = true;
    seen.add(s.faction);
  }
  return stints;
}

/* ---------- 国（勢力）ページ ---------- */

/**
 * 指定した国が参戦した戦闘を、その国の視点で集める。
 * 1 戦闘で左右両軍が同じ国（同士討ち）の場合は 2 件になる。
 */
export function collectFactionBattles(
  log: BattleRecord[],
  faction: string
): BattleOutcome[] {
  const target = faction.trim();
  const out: BattleOutcome[] = [];
  for (const { record, card } of dedupedCards(log)) {
    if (card.left.faction?.trim() === target)
      out.push(makeOutcome(record, card, "left"));
    if (card.right.faction?.trim() === target)
      out.push(makeOutcome(record, card, "right"));
  }
  return sortByTimeDesc(out);
}

/** 国（勢力）一覧 1 行分の集計。 */
export interface FactionSummary {
  faction: string;
  /** 現在この国に所属している武将の人数（DB 名簿）。 */
  members: number;
  /** この国の旗で戦った戦闘数（同士討ちは左右で 2 件）。 */
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/**
 * 全戦闘履歴と DB 名簿から、国（勢力）ごとの一覧を集計する。
 * 戦歴・名簿のいずれかに登場する国をすべて対象にし、戦闘数の多い順
 * （同数なら勝率の高い順 → 名前順）に並べて返す。
 */
export function factionSummaries(
  log: BattleRecord[],
  db: WarlordMap
): FactionSummary[] {
  const agg = new Map<
    string,
    { battles: number; wins: number; losses: number }
  >();
  const ensure = (faction: string) => {
    let a = agg.get(faction);
    if (!a) {
      a = { battles: 0, wins: 0, losses: 0 };
      agg.set(faction, a);
    }
    return a;
  };
  for (const { card } of dedupedCards(log)) {
    for (const side of ["left", "right"] as SideKey[]) {
      const s = side === "left" ? card.left : card.right;
      const faction = s.faction?.trim();
      if (!faction) continue;
      const a = ensure(faction);
      a.battles++;
      const r = outcomeForSide(card.winner, side);
      if (r === "win") a.wins++;
      else if (r === "loss") a.losses++;
    }
  }

  // 戦闘履歴に登場した武将人数と DB 名簿人数の大きい方を採用する。
  // battle がある国は詳細画面に近い「最大人数」、battle がない国は DB の人数を
  // そのまま残すため、一覧から国が消えない。
  const battleMembers = new Map<string, Set<string>>();
  const ensureBattleMembers = (faction: string) => {
    let set = battleMembers.get(faction);
    if (!set) {
      set = new Set<string>();
      battleMembers.set(faction, set);
    }
    return set;
  };
  for (const { card } of dedupedCards(log)) {
    for (const s of [card.left, card.right]) {
      const faction = s.faction?.trim();
      const name = s.name?.trim();
      if (!faction || !name) continue;
      ensureBattleMembers(faction).add(name);
    }
  }

  const dbMembers = new Map<string, number>();
  for (const w of Object.values(db)) {
    const faction = w.faction?.trim();
    if (!faction) continue;
    dbMembers.set(faction, (dbMembers.get(faction) ?? 0) + 1);
  }

  // 戦歴・名簿のどちらかに出てくる国をすべて対象にする。
  const names = new Set<string>([
    ...agg.keys(),
    ...battleMembers.keys(),
    ...dbMembers.keys(),
  ]);
  const out: FactionSummary[] = [];
  for (const faction of names) {
    const a = agg.get(faction) ?? { battles: 0, wins: 0, losses: 0 };
    const decided = a.wins + a.losses;
    const battleCount = battleMembers.get(faction)?.size ?? 0;
    const dbCount = dbMembers.get(faction) ?? 0;
    out.push({
      faction,
      members: Math.max(battleCount, dbCount),
      battles: a.battles,
      wins: a.wins,
      losses: a.losses,
      decided,
      winRate: decided > 0 ? a.wins / decided : 0,
    });
  }
  return out.sort(
    (a, b) =>
      b.battles - a.battles ||
      b.winRate - a.winRate ||
      a.faction.localeCompare(b.faction, "ja")
  );
}

/**
 * 現在その国に所属する武将 1 人分の「在籍区間」の戦績。
 * 渡り歩いてきた武将を考慮し、最後にその国へ加入してから今までの
 * 連続した在籍区間のみを対象にする（過去に一度離れて出戻った場合、
 * 古い在籍ぶんは含めない）。
 */
export interface FactionMemberStat {
  name: string;
  /** 現在の在籍区間での戦闘数 */
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
  /** 現在の在籍区間で最後に使った兵種（正規化済み）。不明なら undefined。 */
  latestUnit?: string;
  /** 最後に使った兵種の兵種。不明なら undefined。 */
  latestBranch?: string;
}

/**
 * 指定した国に「今も所属している武将」ごとに、現在の在籍区間の戦績を集計する。
 *
 * 渡り歩いてきた武将がいるため、各武将の全戦闘履歴をたどり、最後にその国で
 * 戦った時点から連続してその国に居た区間だけを採用する。これにより、別の国に
 * 居たときの戦績や、過去に一度離れる前の古い在籍ぶんは集計から除外される。
 * latestUnit / latestBranch には、その区間で最後に出陣したときの兵種を入れる。
 */
export function factionMemberStats(
  log: BattleRecord[],
  faction: string
): FactionMemberStat[] {
  const target = faction.trim();
  const cards = dedupedCards(log);

  // 1. この国で 1 度でも戦ったことのある武将名を集める。
  const participants = new Set<string>();
  for (const { card } of cards) {
    if (card.left.faction?.trim() === target && card.left.name?.trim())
      participants.add(card.left.name.trim());
    if (card.right.faction?.trim() === target && card.right.name?.trim())
      participants.add(card.right.name.trim());
  }
  if (participants.size === 0) return [];

  // 2. 参加武将の全戦闘履歴を集める（所属の変化を追うため他国での戦いも含む）。
  const history = new Map<string, BattleOutcome[]>();
  for (const { record, card } of cards) {
    for (const side of ["left", "right"] as SideKey[]) {
      const s = side === "left" ? card.left : card.right;
      const name = s.name?.trim();
      if (!name || !participants.has(name)) continue;
      const arr = history.get(name) ?? [];
      arr.push(makeOutcome(record, card, side));
      history.set(name, arr);
    }
  }

  // 3. 各武将について、最後にその国で戦った時点から連続する在籍区間を集計する。
  const out: FactionMemberStat[] = [];
  for (const [name, all] of history) {
    const sorted = sortByTimeDesc(all); // 新しい順
    const start = sorted.findIndex((o) => o.self.faction?.trim() === target);
    if (start === -1) continue;
    const stint: BattleOutcome[] = [];
    for (let i = start; i < sorted.length; i++) {
      if (sorted[i].self.faction?.trim() === target) stint.push(sorted[i]);
      else break; // 別の国に移る直前まで（＝現在の在籍区間）
    }
    let wins = 0;
    let losses = 0;
    for (const o of stint) {
      if (o.result === "win") wins++;
      else if (o.result === "loss") losses++;
    }
    const decided = wins + losses;
    const latest = stint[0];
    out.push({
      name,
      battles: stint.length,
      wins,
      losses,
      decided,
      winRate: decided > 0 ? wins / decided : 0,
      latestUnit: latest?.self.unit
        ? normalizeDisplayToken(latest.self.unit)
        : undefined,
      latestBranch: latest?.self.branch?.trim() || undefined,
    });
  }
  return out.sort(
    (a, b) =>
      b.battles - a.battles ||
      b.winRate - a.winRate ||
      a.name.localeCompare(b.name, "ja")
  );
}

/** 兵種ごとにまとめた「最新使用兵種」の内訳。 */
export interface BranchLatestUnits {
  /** 兵種名（不明・空欄は "その他"）。 */
  branch: string;
  /** この兵種を最新で使っている人数の合計。 */
  total: number;
  /** 兵種ごとの人数（多い順）。 */
  units: { unit: string; count: number }[];
}

/**
 * 武将ごとの「最新で使っている兵種」を兵種別に集計する。
 * 各エントリ（1 武将）の最新兵種を 1 票として数え、兵種 → 兵種の順にまとめる。
 * 兵種は人数の多い順（"その他" は末尾）、兵種は各兵種内で人数の多い順。
 */
export function latestUnitsByBranch(
  members: { latestBranch?: string; latestUnit?: string }[]
): BranchLatestUnits[] {
  const OTHER = "その他";
  const map = new Map<string, Map<string, number>>();
  for (const m of members) {
    const unit = m.latestUnit?.trim();
    if (!unit) continue;
    const branch = m.latestBranch?.trim() || OTHER;
    let units = map.get(branch);
    if (!units) {
      units = new Map<string, number>();
      map.set(branch, units);
    }
    units.set(unit, (units.get(unit) ?? 0) + 1);
  }
  const arr: BranchLatestUnits[] = Array.from(map.entries()).map(
    ([branch, units]) => {
      const list = Array.from(units.entries())
        .map(([unit, count]) => ({ unit, count }))
        .sort((a, b) => b.count - a.count || a.unit.localeCompare(b.unit, "ja"));
      const total = list.reduce((s, u) => s + u.count, 0);
      return { branch, total, units: list };
    }
  );
  return arr.sort((a, b) => {
    const ao = a.branch === OTHER ? 1 : 0;
    const bo = b.branch === OTHER ? 1 : 0;
    if (ao !== bo) return ao - bo; // "その他" は末尾
    return b.total - a.total || a.branch.localeCompare(b.branch, "ja");
  });
}

/** 所属武将ごとの兵種傾向（期間内にその国の旗で使った兵種の頻度）。 */
export interface MemberUnitTrend {
  /** 兵種名（正規化済み）と使用回数（多い順）。 */
  units: { unit: string; count: number }[];
  /** 対象期間にその国の旗で戦った総数（兵種不明も含む）。 */
  total: number;
}

/**
 * 指定した国の所属武将ごとに、期間内でその国の旗を掲げて使った兵種の傾向を集計する。
 * sinceYear 以降（ゲーム内年）の戦闘のみを対象にする（null なら全期間）。
 * 返り値は 武将名 → 兵種頻度。国ページで各武将の得意兵種を出すのに使う。
 */
export function factionMemberUnitTrends(
  log: BattleRecord[],
  faction: string,
  sinceYear: number | null
): Map<string, MemberUnitTrend> {
  const target = faction.trim();
  const cards = dedupedCards(log);
  const unitCounts = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const { card } of cards) {
    const year = gameYear(card);
    if (sinceYear != null && (year == null || year < sinceYear)) continue;
    for (const side of ["left", "right"] as SideKey[]) {
      const s = side === "left" ? card.left : card.right;
      if (s.faction?.trim() !== target) continue;
      const name = s.name?.trim();
      if (!name) continue;
      totals.set(name, (totals.get(name) ?? 0) + 1);
      const unit = s.unit ? normalizeDisplayToken(s.unit) : "";
      if (!unit) continue;
      let units = unitCounts.get(name);
      if (!units) {
        units = new Map<string, number>();
        unitCounts.set(name, units);
      }
      units.set(unit, (units.get(unit) ?? 0) + 1);
    }
  }
  const out = new Map<string, MemberUnitTrend>();
  for (const name of totals.keys()) {
    const units = unitCounts.get(name);
    const list = units
      ? Array.from(units.entries())
          .map(([unit, count]) => ({ unit, count }))
          .sort(
            (a, b) => b.count - a.count || a.unit.localeCompare(b.unit, "ja")
          )
      : [];
    out.set(name, { units: list, total: totals.get(name) ?? 0 });
  }
  return out;
}

/* ---------- 兵種ページ：相性の良い／苦手な敵兵種 ---------- */

/** 注目兵種から見た、ある敵兵種に対する戦績。 */
export interface OpponentUnitStat {
  unit: string;
  battles: number;
  wins: number;
  losses: number;
  others: number;
  decided: number;
  winRate: number;
}

/** 相手の兵種ごとに、注目側視点の勝敗を集計する。 */
export function opponentUnitStats(
  outcomes: BattleOutcome[]
): OpponentUnitStat[] {
  const map = new Map<string, OpponentUnitStat>();
  for (const o of outcomes) {
    const unit = o.opponent.unit
      ? normalizeDisplayToken(o.opponent.unit)
      : "";
    if (!unit) continue;
    let s = map.get(unit);
    if (!s) {
      s = {
        unit,
        battles: 0,
        wins: 0,
        losses: 0,
        others: 0,
        decided: 0,
        winRate: 0,
      };
      map.set(unit, s);
    }
    s.battles++;
    if (o.result === "win") s.wins++;
    else if (o.result === "loss") s.losses++;
    else s.others++;
  }
  const arr = Array.from(map.values());
  for (const s of arr) {
    s.decided = s.wins + s.losses;
    s.winRate = s.decided > 0 ? s.wins / s.decided : 0;
  }
  return arr;
}

/** 相性の良い／苦手な敵兵種ランキング。 */
export interface UnitMatchupRanking {
  best: OpponentUnitStat[];
  worst: OpponentUnitStat[];
}

/**
 * 敵兵種を勝率順に並べ、相性の良い／苦手な兵種 TOP3 を返す。
 * 勝敗が確定した対戦が 1 度でもある兵種のみ対象。
 * - 相性の良い兵種 = 勝ち越している兵種（勝率 > 50%）を勝率の高い順に。
 * - 苦手な兵種 = 負け越している兵種（勝率 < 50%）を勝率の低い順に。
 * 勝率 50%（五分）の兵種はどちらにも含めない（同じ兵種が両方に出ない）。
 */
export function unitMatchupRanking(
  outcomes: BattleOutcome[],
  top = 3
): UnitMatchupRanking {
  const decided = opponentUnitStats(outcomes).filter((s) => s.decided > 0);
  const best = decided
    .filter((s) => s.winRate > 0.5)
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.decided - a.decided ||
        b.battles - a.battles
    )
    .slice(0, top);
  const worst = decided
    .filter((s) => s.winRate < 0.5)
    .sort(
      (a, b) =>
        a.winRate - b.winRate ||
        b.decided - a.decided ||
        b.battles - a.battles
    )
    .slice(0, top);
  return { best, worst };
}

/* ---------- 兵種ページ：武将別の勝率比較 ---------- */

/** この兵種を使った武将ごとの戦績。 */
export interface UserWinRate {
  name: string;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/**
 * 注目兵種を使った武将ごとに勝率を集計する。
 * 既定では戦闘数の多い順。
 */
export function userWinRates(outcomes: BattleOutcome[]): UserWinRate[] {
  const map = new Map<string, UserWinRate>();
  for (const o of outcomes) {
    const name = o.self.name?.trim();
    if (!name) continue;
    let s = map.get(name);
    if (!s) {
      s = { name, battles: 0, wins: 0, losses: 0, decided: 0, winRate: 0 };
      map.set(name, s);
    }
    s.battles++;
    if (o.result === "win") s.wins++;
    else if (o.result === "loss") s.losses++;
  }
  const arr = Array.from(map.values());
  for (const s of arr) {
    s.decided = s.wins + s.losses;
    s.winRate = s.decided > 0 ? s.wins / s.decided : 0;
  }
  return arr.sort((a, b) => b.battles - a.battles || b.winRate - a.winRate);
}

/* ---------- 兵種ページ：時期別の使用率推移 ---------- */

/** ある時期（ゲーム内年）における兵種の使用状況。 */
export interface UsageTrendPoint {
  /** ゲーム内の年 */
  year: number;
  /** その年に行われた全戦闘数 */
  totalBattles: number;
  /** うち、この兵種が登場した戦闘数 */
  unitBattles: number;
  /** 使用率 0..1（totalBattles が 0 のときは 0） */
  rate: number;
  /** その年のこの兵種の勝利数（左右両陣営が使った場合は各視点で加算） */
  wins: number;
  /** その年のこの兵種の敗北数 */
  losses: number;
  /** 勝敗が確定した数（wins + losses） */
  decided: number;
}

/**
 * 指定兵種の「使用率」をゲーム内の年ごとに推移として返す。
 * 使用率 = その年にこの兵種が登場した戦闘数 / その年の全戦闘数。
 * 戦闘の重複（同一戦闘の再登録）は除外し、1 戦闘につき最大 1 回数える。
 */
export function unitUsageTrend(
  log: BattleRecord[],
  unitName: string
): UsageTrendPoint[] {
  const target = unitName.trim();
  const total = new Map<number, number>();
  const used = new Map<number, number>();
  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  for (const { card } of dedupedCards(log)) {
    const year = gameYear(card);
    if (year == null) continue;
    total.set(year, (total.get(year) ?? 0) + 1);
    const inLeft = unitMatches(card.left, target);
    const inRight = unitMatches(card.right, target);
    if (inLeft || inRight) used.set(year, (used.get(year) ?? 0) + 1);
    if (inLeft) {
      const r = outcomeForSide(card.winner, "left");
      if (r === "win") wins.set(year, (wins.get(year) ?? 0) + 1);
      else if (r === "loss") losses.set(year, (losses.get(year) ?? 0) + 1);
    }
    if (inRight) {
      const r = outcomeForSide(card.winner, "right");
      if (r === "win") wins.set(year, (wins.get(year) ?? 0) + 1);
      else if (r === "loss") losses.set(year, (losses.get(year) ?? 0) + 1);
    }
  }
  return Array.from(total.entries())
    .map(([year, totalBattles]) => {
      const unitBattles = used.get(year) ?? 0;
      const w = wins.get(year) ?? 0;
      const l = losses.get(year) ?? 0;
      return {
        year,
        totalBattles,
        unitBattles,
        rate: totalBattles > 0 ? unitBattles / totalBattles : 0,
        wins: w,
        losses: l,
        decided: w + l,
      };
    })
    .sort((a, b) => a.year - b.year);
}

/** この兵種が分類される兵種（最も多く登場した兵種）を返す。 */
export function unitBranchLabel(
  outcomes: BattleOutcome[]
): string | undefined {
  const count = new Map<string, number>();
  for (const o of outcomes) {
    const b = o.self.branch?.trim();
    if (!b) continue;
    count.set(b, (count.get(b) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [b, n] of count) {
    if (n > bestN) {
      best = b;
      bestN = n;
    }
  }
  return best;
}

/* ---------- 枚抜き集計（出兵/守備の連勝） ---------- */

/** 1 出兵（同一出兵側・同一戦闘時刻）の集約。 */
interface SortieAgg {
  /** 出兵側として勝利した戦目番号の集合 */
  wins: Set<number>;
}

/**
 * 1 出兵の「枚抜き枚数」= 1戦目から連続で勝った数。
 * 出兵は 1戦目→2戦目→3戦目 と進むため、最初に勝てなかった時点で止まる。
 */
function sortieSweepCount(s: SortieAgg): number {
  let n = 0;
  // 今期の最大は 3戦目。将来拡張に備え上限は緩めに見る。
  for (let i = 1; i <= 10; i++) {
    if (s.wins.has(i)) n++;
    else break;
  }
  return n;
}

/** 戦目番号（"3戦目" → 3）を数値で返す。取れなければ 0。 */
function battleNoNumber(no: string | undefined): number {
  const m = no?.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** ある側（出兵=left / 守備=right）の視点で集計した武将ごとの枚抜き集計。 */
export interface SideSwiStat {
  name: string;
  faction?: string;
  branch?: string;
  /** その側として出兵（同一戦闘時刻でまとめた回数） */
  sorties: number;
  /** その側で勝った戦目の総数（出兵なら出兵勝利数 / 守備なら守備勝利数） */
  wins: number;
  /** 枚抜き枚数ごとの出兵回数（index = 枚数, 0..） */
  sweepCounts: number[];
}

/**
 * 指定した側（出兵 / 守備）の視点で、武将ごとの出兵・連勝（枚抜き）を集計する。
 * 出兵 = (注目側武将, 戦闘時刻) でまとめた 1 回。枚抜き = 1戦目からの連勝数。
 * 守備側も同様に (防衛側武将, 戦闘時刻) でまとめる。重複行は除外する。
 * 
 * @param log 戦闘ログ
 * @param side 集計対象の側（left=出兵 / right=守備）
 * @param db 武将DB。渡された場合、同じ household の複数の名前を1つに正規化。
 */
function computeSideSwi(
  log: BattleRecord[],
  side: SideKey,
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): Map<string, SideSwiStat> {
  const faction = normalizeFactionFilter(factionFilter);
  // (term, 家名) で同一人物をまとめ、最新の代表名に正規化するマップ
  const nameMap = db ? logNameMap(log) : null;

  // 出兵単位に集約。
  const sorties = new Map<string, SortieAgg>();
  // 武将ごとの最新の勢力・兵種（表示・フィルタ用）。
  const factionOf = new Map<string, string | undefined>();
  const branchOf = new Map<string, string | undefined>();

  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    const self = side === "left" ? card.left : card.right;
    if (!sideMatchesFaction(self, faction)) continue;
    const rawName = self.name?.trim();
    if (!rawName) continue;
    // (term, 家名) で同一人物をまとめ、代表名に正規化する。
    const name = resolveLogName(nameMap, record.term, self.family, rawName);
    const key = `${name}@@${card.battleAt ?? ""}`;
    let s = sorties.get(key);
    if (!s) {
      s = { wins: new Set() };
      sorties.set(key, s);
    }
    if (card.winner === side) s.wins.add(battleNoNumber(card.battleNo));
    if (self.faction) factionOf.set(name, self.faction);
    if (self.branch) branchOf.set(name, self.branch);
  }

  // 武将ごとに集約。
  interface Acc {
    name: string;
    sorties: number;
    wins: number;
    sweepCounts: number[];
  }
  const acc = new Map<string, Acc>();
  for (const [key, s] of sorties) {
    const name = key.slice(0, key.indexOf("@@"));
    let a = acc.get(name);
    if (!a) {
      a = {
        name,
        sorties: 0,
        wins: 0,
        sweepCounts: [],
      };
      acc.set(name, a);
    }
    const n = sortieSweepCount(s);
    a.sorties++;
    a.wins += s.wins.size;
    a.sweepCounts[n] = (a.sweepCounts[n] ?? 0) + 1;
  }

  const out = new Map<string, SideSwiStat>();
  for (const a of acc.values()) {
    const sweepCounts = Array.from(
      { length: a.sweepCounts.length },
      (_, i) => a.sweepCounts[i] ?? 0
    );
    out.set(a.name, {
      name: a.name,
      faction: factionOf.get(a.name),
      branch: branchOf.get(a.name),
      sorties: a.sorties,
      wins: a.wins,
      sweepCounts,
    });
  }
  return out;
}

/** 武将 1 人の抜き数（枚抜きの重み付き合計）。 */
export interface BreakthroughStat {
  name: string;
  faction?: string;
  branch?: string;
  /** 抜き数 = Σ n×(n枚抜きの出兵数)。 */
  score: number;
  /** 出兵出兵数（枚抜きの母数・参考）。 */
  sorties: number;
  /** 枚抜きの内訳（index=n 枚抜き, value=出兵回数）。 */
  sweepCounts: number[];
}

/**
 * 武将ごとの「抜き数」を集計する（出兵側の枚抜き）。
 * 抜き数 = 1×(1枚抜き) + 2×(2枚抜き) + … + n×(n枚抜き)。
 * 1 出兵から求める＝computeSideSwi の sweepCounts と同じ。
 * 国を指定した場合は、その国に所属して出兵した記録だけを対象にする。
 */
export function breakthroughRanking(
  log: BattleRecord[],
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): BreakthroughStat[] {
  const atk = computeSideSwi(log, "left", db, range, factionFilter);
  const out: BreakthroughStat[] = [];
  for (const s of atk.values()) {
    let score = 0;
    for (let n = 1; n < s.sweepCounts.length; n++) {
      score += n * (s.sweepCounts[n] ?? 0);
    }
    out.push({
      name: s.name,
      faction: s.faction,
      branch: s.branch,
      score,
      sorties: s.sorties,
      sweepCounts: s.sweepCounts,
    });
  }
  return out;
}

/** 守備勝ちに掛けるボーナス係数（守備の 1 勝を 1.4 勝として評価）。 */
const DEFENSE_WIN_BONUS = 1.4;

/** 武将 1 人の PontaPoint（守備勝ちにボーナスを付けた勝率）。 */
export interface PontaStat {
  name: string;
  faction?: string;
  branch?: string;
  /** 出兵側として勝った戦闘数。 */
  attackWins: number;
  /** 守備側として勝った戦闘数。 */
  defenseWins: number;
  /** 戦闘数（撤退戦を除く＝勝＋負。引分・不明も除外）。普通の勝率の分母。 */
  battles: number;
  /** PontaPoint = (出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。値域 0〜1.4。 */
  pontaPoint: number;
}

/**
 * 武将ごとの PontaPoint を集計する。
 * PontaPoint = (出兵勝 + 1.4×守備勝) ÷ 戦闘数（撤退戦を除く）。
 * 普通の勝率（勝 ÷ (勝＋負)）の分子で「守備の 1 勝」を 1.4 勝として重み付けするだけ。
 * 分母は撤退戦を除く戦闘数（＝勝＋負。引分・撤退・不明は除外）。攻守どちらの側でも集計する。
 * 国を指定した場合は、左右それぞれで所属国が一致する側だけを対象にする。
 */
export function pontaPointRanking(
  log: BattleRecord[],
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): PontaStat[] {
  const faction = normalizeFactionFilter(factionFilter);
  const nameMap = db ? logNameMap(log) : null;
  const resolve = (
    side: { name?: string; family?: string },
    term: number | undefined
  ): string | undefined => {
    const name = side.name?.trim();
    if (!name) return undefined;
    return resolveLogName(nameMap, term, side.family, name);
  };
  interface Acc {
    name: string;
    faction?: string;
    branch?: string;
    attackWins: number;
    defenseWins: number;
    losses: number;
  }
  const map = new Map<string, Acc>();
  const touch = (
    name: string,
    side: { faction?: string; branch?: string }
  ): Acc => {
    let e = map.get(name);
    if (!e) {
      e = { name, attackWins: 0, defenseWins: 0, losses: 0 };
      map.set(name, e);
    }
    if (side.faction) e.faction = side.faction;
    if (side.branch) e.branch = side.branch;
    return e;
  };
  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    const w = card.winner;
    if (w !== "left" && w !== "right") continue; // 撤退・引分・不明を除く（勝敗が付いた戦闘）のみ
    const ln = sideMatchesFaction(card.left, faction)
      ? resolve(card.left, record.term)
      : undefined;
    if (ln) {
      const e = touch(ln, card.left);
      if (w === "left") e.attackWins++;
      else e.losses++;
    }
    const rn = sideMatchesFaction(card.right, faction)
      ? resolve(card.right, record.term)
      : undefined;
    if (rn) {
      const e = touch(rn, card.right);
      if (w === "right") e.defenseWins++;
      else e.losses++;
    }
  }
  const out: PontaStat[] = [];
  for (const e of map.values()) {
    // 撤退戦を除く戦闘数＝勝＋負（撤退・引分・不明は除外）。
    const battles = e.attackWins + e.defenseWins + e.losses;
    const pontaPoint =
      battles > 0
        ? (e.attackWins + DEFENSE_WIN_BONUS * e.defenseWins) / battles
        : 0;
    out.push({
      name: e.name,
      faction: e.faction,
      branch: e.branch,
      attackWins: e.attackWins,
      defenseWins: e.defenseWins,
      battles,
      pontaPoint,
    });
  }
  return out;
}

/** 兵種・武器・品物の指標ランキング対象。 */
export type AssetMetricVariant = "unit" | "weapon" | "item";

/** 兵種・武器・品物 1 種類分の総合指標。 */
export interface AssetMetricStat {
  name: string;
  /** 代表兵種（兵種のみ）。 */
  branch?: string;
  /** 勝敗未確定を含む延べ使用回数。 */
  uses: number;
  attackWins: number;
  defenseWins: number;
  /** 勝敗が確定した戦闘数。 */
  battles: number;
  winRate: number;
  pontaPoint: number;
  breakthrough: number;
  sorties: number;
  breakthroughRate: number;
  ppn: number;
  sweepCounts: number[];
  topUsers: { name: string; count: number }[];
}

function assetName(
  side: BattleSide,
  variant: AssetMetricVariant
): string | undefined {
  const raw =
    variant === "unit"
      ? side.unit
      : variant === "weapon"
        ? side.equip2
        : side.equip1;
  if (!raw) return undefined;
  const name = normalizeDisplayToken(raw);
  return name && name !== "なし" ? name : undefined;
}

/**
 * 兵種・武器・品物ごとの PPN・PontaPoint・勝率・抜き数・抜き率を集計する。
 *
 * 勝敗系は左右それぞれが使用した対象へ帰属する。枚抜きは出兵側のみを対象とし、
 * 同一対象・同一使用者・同一戦闘時刻を 1 出兵として、1戦目からの連勝数を数える。
 * 国を指定した場合は、その国側の使用・勝敗・出兵だけで各指標を再集計する。
 */
export function assetMetricRanking(
  log: BattleRecord[],
  variant: AssetMetricVariant,
  range?: YearRange,
  factionFilter?: string
): AssetMetricStat[] {
  const faction = normalizeFactionFilter(factionFilter);
  interface Acc {
    name: string;
    uses: number;
    attackWins: number;
    defenseWins: number;
    losses: number;
    branches: Map<string, number>;
    users: Map<string, number>;
  }

  const metrics = new Map<string, Acc>();
  const sorties = new Map<string, { asset: string; wins: Set<number> }>();
  const sides: SideKey[] = ["left", "right"];

  const touch = (name: string): Acc => {
    let current = metrics.get(name);
    if (!current) {
      current = {
        name,
        uses: 0,
        attackWins: 0,
        defenseWins: 0,
        losses: 0,
        branches: new Map(),
        users: new Map(),
      };
      metrics.set(name, current);
    }
    return current;
  };

  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;

    for (const sideKey of sides) {
      const side = sideKey === "left" ? card.left : card.right;
      if (!sideMatchesFaction(side, faction)) continue;
      const name = assetName(side, variant);
      if (!name) continue;

      const metric = touch(name);
      metric.uses++;
      const user = side.name?.trim();
      if (user) {
        metric.users.set(user, (metric.users.get(user) ?? 0) + 1);
      }
      if (variant === "unit") {
        const branch = side.branch?.trim();
        if (branch) {
          metric.branches.set(
            branch,
            (metric.branches.get(branch) ?? 0) + 1
          );
        }
      }

      if (card.winner === "left" || card.winner === "right") {
        if (card.winner === sideKey) {
          if (sideKey === "left") metric.attackWins++;
          else metric.defenseWins++;
        } else {
          metric.losses++;
        }
      }
    }

    const attackerAsset = assetName(card.left, variant);
    if (!attackerAsset || !sideMatchesFaction(card.left, faction)) continue;
    const sortieKey = [
      attackerAsset,
      String(record.term),
      card.left.family ?? card.left.name,
      card.battleAt ?? "",
    ].join("@@");
    let sortie = sorties.get(sortieKey);
    if (!sortie) {
      sortie = { asset: attackerAsset, wins: new Set() };
      sorties.set(sortieKey, sortie);
    }
    if (card.winner === "left") {
      sortie.wins.add(battleNoNumber(card.battleNo));
    }
  }

  const sortieStats = new Map<
    string,
    { sorties: number; breakthrough: number; sweepCounts: number[] }
  >();
  for (const sortie of sorties.values()) {
    const sweep = sortieSweepCount(sortie);
    const current = sortieStats.get(sortie.asset) ?? {
      sorties: 0,
      breakthrough: 0,
      sweepCounts: [],
    };
    current.sorties++;
    current.breakthrough += sweep;
    current.sweepCounts[sweep] =
      (current.sweepCounts[sweep] ?? 0) + 1;
    sortieStats.set(sortie.asset, current);
  }

  return Array.from(metrics.values())
    .map((metric) => {
      const battles =
        metric.attackWins + metric.defenseWins + metric.losses;
      const wins = metric.attackWins + metric.defenseWins;
      const pontaPoint =
        battles > 0
          ? (metric.attackWins +
              DEFENSE_WIN_BONUS * metric.defenseWins) /
            battles
          : 0;
      const sortie = sortieStats.get(metric.name) ?? {
        sorties: 0,
        breakthrough: 0,
        sweepCounts: [],
      };
      const breakthroughRate =
        sortie.sorties > 0 ? sortie.breakthrough / sortie.sorties : 0;
      const branch =
        Array.from(metric.branches.entries()).sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0];
      const topUsers = Array.from(metric.users.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        name: metric.name,
        branch,
        uses: metric.uses,
        attackWins: metric.attackWins,
        defenseWins: metric.defenseWins,
        battles,
        winRate: battles > 0 ? wins / battles : 0,
        pontaPoint,
        breakthrough: sortie.breakthrough,
        sorties: sortie.sorties,
        breakthroughRate,
        ppn: pontaPoint + breakthroughRate,
        sweepCounts: Array.from(
          { length: sortie.sweepCounts.length },
          (_, index) => sortie.sweepCounts[index] ?? 0
        ),
        topUsers,
      };
    })
    .sort((a, b) => b.uses - a.uses || b.winRate - a.winRate);
}

/* ---------- 武将ランキング（出兵 / 守備の総合） ---------- */

/** ランキングで切り替えられる指標。 */
export type RankMetric =
  | "avgBreakthrough"
  | "defenseEfficiency"
  | "attackWinRate"
  | "defenseWinRate"
  | "assists";

/** 武将 1 人の出兵・守備の総合戦績。 */
export interface WarlordRankStat {
  name: string;
  faction?: string;
  branch?: string;
  /** 平均枚抜き（出兵勝利数 / 出兵出兵数） */
  avgBreakthrough: number;
  /** 守備効率（守備勝利数 / 守備出兵数） */
  defenseEfficiency: number;
  /** 出兵勝率（出兵側として勝った戦目 / 出兵側として参加した決着戦目） */
  attackWinRate: number;
  /** 守備勝率（守備側として勝った戦目 / 守備側として参加した決着戦目） */
  defenseWinRate: number;
  /** 出兵側としての出兵回数（撤退除く） */
  attackSorties: number;
  /** 出兵勝利数（出兵側として勝った戦目の総数） */
  attackWins: number;
  /** 出兵側として参加した決着戦目数 */
  attackRounds: number;
  /** 出兵側として勝った決着戦目数 */
  attackWinRounds: number;
  /** 守備側としての出兵回数（撤退除く） */
  defenseSorties: number;
  /** 守備勝利数（守備側として勝った戦目の総数） */
  defenseWins: number;
  /** 守備側として参加した決着戦目数 */
  defenseRounds: number;
  /** 守備側として勝った決着戦目数 */
  defenseWinRounds: number;
  /** アシスト数（削った相手が 40 分以内に倒された回数）。 */
  assists: number;
}

/** 指標値を取り出す。 */
export function rankMetricValue(s: WarlordRankStat, metric: RankMetric): number {
  switch (metric) {
    case "avgBreakthrough":
      return s.avgBreakthrough;
    case "defenseEfficiency":
      return s.defenseEfficiency;
    case "attackWinRate":
      return s.attackWinRate;
    case "defenseWinRate":
      return s.defenseWinRate;
    case "assists":
      return s.assists;
  }
}

/** 指標が出兵側のものか。 */
export function isAttackMetric(metric: RankMetric): boolean {
  return metric === "avgBreakthrough" || metric === "attackWinRate";
}

/** アシスト判定の時間窓（ミリ秒）。 */
const ASSIST_WINDOW_MS = 40 * 60 * 1000;

/**
 * 時刻ベースのアシスト集計。
 *
 * 「A が B を削った（攻守問わず B に勝った）時刻 T の後 40 分以内に
 *  B が誰かに倒された（別イベントで B が負けた）」場合、A に 1 アシストを付与する。
 *
 * - 出兵側（left 勝利）でも守備側（right 勝利）でもアシストが発生する。
 * - 同一 battleAt（同一タイムスタンプ）内の別ラウンドは 0 分差のため
 *   「別イベント」に含めない（T < T2 の厳格チェック）。
 */
function computeAssists(
  log: BattleRecord[],
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): Map<string, number> {
  const faction = normalizeFactionFilter(factionFilter);
  const nameMap = db ? logNameMap(log) : null;
  const now = new Date();
  const cards = dedupedCards(log).filter(({ card }) => withinYearRange(card, range));

  // battleAt の parse 結果をキャッシュする。
  const timeCache = new Map<string, number | null>();
  const getTime = (battleAt: string | undefined): number | null => {
    const key = battleAt ?? "";
    if (timeCache.has(key)) return timeCache.get(key)!;
    const d = parseActionDate(key, now);
    const t = d ? d.getTime() : null;
    timeCache.set(key, t);
    return t;
  };

  // damageEvents: A が B を削ったイベント（同一 battleAt のペアは 1 件に集約）。
  interface DamageEvent {
    winner: string;
    loser: string;
    time: number;
  }
  const damageEvents: DamageEvent[] = [];
  const damageEventSeen = new Set<string>();

  // defeatTimes: 各武将が倒された（負けた）時刻の一覧。
  const defeatTimes = new Map<string, number[]>();

  for (const { record, card } of cards) {
    if (card.winner !== "left" && card.winner !== "right") continue;
    const t = getTime(card.battleAt);
    if (t === null) continue;

    const winnerSide = card.winner === "left" ? card.left : card.right;
    const loserSide = card.winner === "left" ? card.right : card.left;
    const winnerName = resolveLogName(
      nameMap,
      record.term,
      winnerSide.family,
      winnerSide.name
    );
    const loserName = resolveLogName(
      nameMap,
      record.term,
      loserSide.family,
      loserSide.name
    );
    if (!winnerName || !loserName) continue;

    // 敗者の被倒時刻を記録。
    const dt = defeatTimes.get(loserName) ?? [];
    dt.push(t);
    defeatTimes.set(loserName, dt);

    // 後続の被倒時刻は全戦闘から保持し、加点対象だけを選択国の勝者に絞る。
    // ここで戦闘全体を除外すると、他国による追撃で倒された事実が失われる。
    if (!sideMatchesFaction(winnerSide, faction)) continue;

    // ダメージイベント（同一 battleAt × 同一ペアは 1 件に集約）。
    const key = `${winnerName}@@${loserName}@@${card.battleAt ?? ""}`;
    if (!damageEventSeen.has(key)) {
      damageEventSeen.add(key);
      damageEvents.push({ winner: winnerName, loser: loserName, time: t });
    }
  }

  // 各敗者の被倒時刻を昇順ソートし、二分探索で「T の直後 40 分以内の被倒」を判定する
  // （敗者ごとの線形走査 .some() は被倒回数が多い武将で O(n^2) 級に膨らむため）。
  for (const arr of defeatTimes.values()) arr.sort((a, b) => a - b);

  const assists = new Map<string, number>();
  for (const { winner, loser, time: T } of damageEvents) {
    const defeats = defeatTimes.get(loser);
    if (!defeats) continue;
    // T より大きい最小の被倒時刻を二分探索し、窓内なら別イベントでの被倒とみなす。
    let lo = 0;
    let hi = defeats.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (defeats[mid] > T) hi = mid;
      else lo = mid + 1;
    }
    if (lo < defeats.length && defeats[lo] <= T + ASSIST_WINDOW_MS) {
      assists.set(winner, (assists.get(winner) ?? 0) + 1);
    }
  }

  return assists;
}

/** 決着戦目ごとの出兵/守備勝率集計（撤退を除く）。 */
function computeRoundWinRates(
  log: BattleRecord[],
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): Map<string, { attackWins: number; attackRounds: number; defenseWins: number; defenseRounds: number }> {
  const faction = normalizeFactionFilter(factionFilter);
  const nameMap = db ? logNameMap(log) : null;
  const out = new Map<string, { attackWins: number; attackRounds: number; defenseWins: number; defenseRounds: number }>();
  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    if (card.winner !== "left" && card.winner !== "right") continue;
    const leftName = resolveLogName(nameMap, record.term, card.left.family, card.left.name);
    const rightName = resolveLogName(nameMap, record.term, card.right.family, card.right.name);
    if (leftName && sideMatchesFaction(card.left, faction)) {
      const cur = out.get(leftName) ?? { attackWins: 0, attackRounds: 0, defenseWins: 0, defenseRounds: 0 };
      cur.attackRounds += 1;
      if (card.winner === "left") cur.attackWins += 1;
      out.set(leftName, cur);
    }
    if (rightName && sideMatchesFaction(card.right, faction)) {
      const cur = out.get(rightName) ?? { attackWins: 0, attackRounds: 0, defenseWins: 0, defenseRounds: 0 };
      cur.defenseRounds += 1;
      if (card.winner === "right") cur.defenseWins += 1;
      out.set(rightName, cur);
    }
  }
  return out;
}

/** 撤退を含む出兵を除外した効率用の集計。 */
function computeEfficiency(
  log: BattleRecord[],
  side: SideKey,
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): Map<string, { wins: number; sorties: number }> {
  const faction = normalizeFactionFilter(factionFilter);
  const nameMap = db ? logNameMap(log) : null;
  interface Sortie {
    wins: Set<number>;
    hasRetreat: boolean;
  }
  const sorties = new Map<string, Sortie>();

  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    const self = side === "left" ? card.left : card.right;
    if (!sideMatchesFaction(self, faction)) continue;
    const rawName = self.name?.trim();
    if (!rawName) continue;
    const name = resolveLogName(nameMap, record.term, self.family, rawName);
    const key = `${name}@@${card.battleAt ?? ""}`;
    let s = sorties.get(key);
    if (!s) {
      s = { wins: new Set<number>(), hasRetreat: false };
      sorties.set(key, s);
    }
    if (card.winner === side) s.wins.add(battleNoNumber(card.battleNo));
    if (card.resultRaw.includes("撤退")) s.hasRetreat = true;
  }

  const out = new Map<string, { wins: number; sorties: number }>();
  for (const [key, s] of sorties) {
    // 撤退を含む出兵は効率の分母・分子から除外。
    if (s.hasRetreat) continue;
    const name = key.slice(0, key.indexOf("@@"));
    const cur = out.get(name) ?? { wins: 0, sorties: 0 };
    cur.sorties += 1;
    cur.wins += s.wins.size;
    out.set(name, cur);
  }
  return out;
}

/**
 * 武将ごとに出兵・守備の出兵数 / 勝利数 / SWI をまとめて集計する。
 * 出兵勝利数・守備勝利数はその側で勝った戦目の総数、
 * SWI（出兵 / 守備）はそれぞれの側を 1戦目からの連勝（枚抜き）で重み付け評価したもの。
 * 
 * @param log 戦闘ログ
 * @param db 武将DB。渡された場合、同じ household の複数の名前を1つに正規化。
 * @param factionFilter 指定した国に所属していた側だけを集計する任意条件。
 */
export function warlordRanking(
  log: BattleRecord[],
  db?: WarlordMap,
  range?: YearRange,
  factionFilter?: string
): WarlordRankStat[] {
  const atk = computeSideSwi(log, "left", db, range, factionFilter);
  const def = computeSideSwi(log, "right", db, range, factionFilter);
  const atkEff = computeEfficiency(log, "left", db, range, factionFilter);
  const defEff = computeEfficiency(log, "right", db, range, factionFilter);
  const roundRates = computeRoundWinRates(log, db, range, factionFilter);
  const assistsMap = computeAssists(log, db, range, factionFilter);
  const names = new Set<string>([...atk.keys(), ...def.keys()]);
  const out: WarlordRankStat[] = [];
  for (const name of names) {
    const a = atk.get(name);
    const d = def.get(name);
    const ae = atkEff.get(name) ?? { wins: 0, sorties: 0 };
    const de = defEff.get(name) ?? { wins: 0, sorties: 0 };
    const rr = roundRates.get(name) ?? { attackWins: 0, attackRounds: 0, defenseWins: 0, defenseRounds: 0 };
    out.push({
      name,
      faction: a?.faction ?? d?.faction,
      branch: a?.branch ?? d?.branch,
      avgBreakthrough: ae.sorties > 0 ? ae.wins / ae.sorties : 0,
      defenseEfficiency: de.sorties > 0 ? de.wins / de.sorties : 0,
      attackWinRate: rr.attackRounds > 0 ? rr.attackWins / rr.attackRounds : 0,
      defenseWinRate: rr.defenseRounds > 0 ? rr.defenseWins / rr.defenseRounds : 0,
      attackSorties: ae.sorties,
      attackWins: ae.wins,
      attackRounds: rr.attackRounds,
      attackWinRounds: rr.attackWins,
      defenseSorties: de.sorties,
      defenseWins: de.wins,
      defenseRounds: rr.defenseRounds,
      defenseWinRounds: rr.defenseWins,
      assists: assistsMap.get(name) ?? 0,
    });
  }
  return out;
}

/* ---------- 指標（アンチ戦闘） ---------- */

/**
 * アンチ（兵種じゃんけん）の索引。兵種名 → その兵種が得意とする兵種の集合。
 * 「兵種一覧」マスタの得意兵種をそのまま使うので、単純な 歩兵>騎兵>弓兵>歩兵 だけでなく、
 * ダブルアンチ（得意兵種を 2 つ持つ兵種。例: 南蛮象騎兵＝弓兵:壁）にも対応する。
 */
export function buildAntiIndex(unitTypes: UnitType[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const u of unitTypes) {
    const name = u.name.trim();
    if (!name) continue;
    map.set(name, new Set(splitGoodAgainst(u.goodAgainst)));
  }
  return map;
}

/**
 * ある兵種が指定の兵種にアンチ（得意兵種に相手の兵種が含まれる）かどうか。
 * 兵種名はオリジナル兵の括弧表記も normalizeDisplayToken で解決する。
 * antiIndex は buildAntiIndex(兵種一覧) で作る。
 */
export function unitCountersBranch(
  unit: string | undefined,
  branch: string | undefined,
  antiIndex: Map<string, Set<string>>
): boolean {
  if (!unit) return false;
  const good = antiIndex.get(normalizeDisplayToken(unit));
  const b = branch?.trim();
  return !!(good && b && good.has(b));
}

/** 武将 1 人のアンチ戦闘の集計。 */
export interface AntiContactStat {
  name: string;
  faction?: string;
  /** 武将の（最新の）兵種。フィルタ・表示用。 */
  branch?: string;
  /** アンチ戦闘数：自分の兵種の得意兵種に相手の兵種が含まれた戦闘数。 */
  antiContacts: number;
  /** 戦闘数：集計対象になった戦闘総数（出兵・守備の延べ）。 */
  contacts: number;
  /** アンチ戦闘率 = antiContacts / contacts（contacts が 0 なら 0）。 */
  antiRate: number;
}

/**
 * 武将ごとに「アンチ戦闘数・率」を集計する。
 *
 * アンチ＝兵種のじゃんけん。自分の兵種（兵種一覧の得意兵種）に相手の兵種が
 * 含まれていれば、その戦闘は「自分が有利に戦闘した（アンチ）」とみなす。
 * ダブルアンチ（得意兵種を 2 つ持つ兵種）は得意兵種のいずれかに一致すれば成立。
 *
 * - 出兵側・守備側の両方を集計対象にする（1 戦闘は各陣営の武将にそれぞれ 1 戦闘）。
 * - 家督名が同じ武将は最新の名前へ統合する（db を渡した場合）。
 * - 自分の兵種が兵種一覧に無い / 相手の兵種が不明な戦闘は「非アンチの戦闘」として数える
 *   （率の分母には含める）。
 */
export function antiContactRanking(
  log: BattleRecord[],
  unitTypes: UnitType[],
  db?: WarlordMap,
  range?: YearRange
): AntiContactStat[] {
  const antiIndex = buildAntiIndex(unitTypes);
  const nameMap = db ? logNameMap(log) : null;
  interface Acc {
    name: string;
    faction?: string;
    branch?: string;
    antiContacts: number;
    contacts: number;
  }
  const acc = new Map<string, Acc>();
  const sides: SideKey[] = ["left", "right"];
  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    for (const side of sides) {
      const self = side === "left" ? card.left : card.right;
      const opponent = side === "left" ? card.right : card.left;
      const rawName = self.name?.trim();
      if (!rawName) continue;
      const name = resolveLogName(nameMap, record.term, self.family, rawName);
      let a = acc.get(name);
      if (!a) {
        a = { name, antiContacts: 0, contacts: 0 };
        acc.set(name, a);
      }
      a.contacts++;
      if (self.faction) a.faction = self.faction;
      if (self.branch) a.branch = self.branch;
      // 自分の兵種の得意兵種に相手の兵種が含まれればアンチ戦闘。
      if (unitCountersBranch(self.unit, opponent.branch, antiIndex)) {
        a.antiContacts++;
      }
    }
  }
  const out: AntiContactStat[] = [];
  for (const a of acc.values()) {
    out.push({
      name: a.name,
      faction: a.faction,
      branch: a.branch,
      antiContacts: a.antiContacts,
      contacts: a.contacts,
      antiRate: a.contacts > 0 ? a.antiContacts / a.contacts : 0,
    });
  }
  return out;
}

/* ---------- 武器・品物（装備）図鑑 ---------- */

/** 装備（武器・品物）1 種の使用実績。 */
export interface EquipStat {
  name: string;
  /** 登場した戦闘数（攻守の延べ） */
  battles: number;
  wins: number;
  losses: number;
  others: number;
  decided: number;
  winRate: number;
  /** 出兵側で装備した回数 */
  attackUses: number;
  /** 守備側で装備した回数 */
  defenseUses: number;
  /** よく使う武将 TOP3 */
  topUsers: { name: string; count: number }[];
}

/**
 * 戦闘ログの装備枠（武器=武将の持つ武器 / 品物=武将の持つ品物）を集計し、装備ごとの使用回数・
 * 勝率・主な使用武将を求める。`pick` で集計対象の枠を選ぶ。出兵側・守備側の
 * 両方を対象とし、重複行は除外する。「なし」など装備なしは除外する。
 */
function collectEquipStats(
  log: BattleRecord[],
  pick: (side: BattleSide) => string | undefined,
  range?: YearRange
): EquipStat[] {
  interface Acc {
    name: string;
    battles: number;
    wins: number;
    losses: number;
    others: number;
    attackUses: number;
    defenseUses: number;
    users: Map<string, number>;
  }
  const map = new Map<string, Acc>();
  const sides: SideKey[] = ["left", "right"];
  for (const { card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    for (const side of sides) {
      const self = side === "left" ? card.left : card.right;
      const result = outcomeForSide(card.winner, side);
      const raw = pick(self);
      if (!raw) continue;
      const name = normalizeDisplayToken(raw);
      if (!name || name === "なし") continue;
      let e = map.get(name);
      if (!e) {
        e = {
          name,
          battles: 0,
          wins: 0,
          losses: 0,
          others: 0,
          attackUses: 0,
          defenseUses: 0,
          users: new Map(),
        };
        map.set(name, e);
      }
      e.battles++;
      if (result === "win") e.wins++;
      else if (result === "loss") e.losses++;
      else e.others++;
      if (side === "left") e.attackUses++;
      else e.defenseUses++;
      const user = self.name?.trim();
      if (user) e.users.set(user, (e.users.get(user) ?? 0) + 1);
    }
  }
  return Array.from(map.values())
    .map((e) => {
      const decided = e.wins + e.losses;
      const topUsers = Array.from(e.users.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return {
        name: e.name,
        battles: e.battles,
        wins: e.wins,
        losses: e.losses,
        others: e.others,
        decided,
        winRate: decided > 0 ? e.wins / decided : 0,
        attackUses: e.attackUses,
        defenseUses: e.defenseUses,
        topUsers,
      };
    })
    .sort((a, b) => b.battles - a.battles);
}

/** ゲーム上の「武将の持つ武器」列ごとに使用実績を集計する。 */
export function weaponStats(log: BattleRecord[], range?: YearRange): EquipStat[] {
  return collectEquipStats(log, (s) => s.equip2, range);
}

/** ゲーム上の「武将の持つ品物」列ごとに使用実績を集計する。 */
export function itemStats(log: BattleRecord[], range?: YearRange): EquipStat[] {
  return collectEquipStats(log, (s) => s.equip1, range);
}

/** 兵種ランキングの集計単位。 */
export interface UnitStat {
  /** 兵種名（normalizeDisplayToken 済み） */
  unit: string;
  /** 代表兵種（その兵種で最も多い兵種） */
  branch: string;
  /** 登場した戦闘数（攻守の延べ） */
  battles: number;
  wins: number;
  losses: number;
  others: number;
  /** 勝敗が確定した数（wins + losses） */
  decided: number;
  /** 勝率 0..1（decided が 0 のときは 0） */
  winRate: number;
  /** 出兵側で出兵した回数 */
  attackUses: number;
  /** 守備側で出兵した回数 */
  defenseUses: number;
  /** よく使う武将 TOP3 */
  topUsers: { name: string; count: number }[];
}

/**
 * 兵種ごとの出兵実績を集計し、使用回数・勝率・主な使用武将を求める。
 * 出兵側・守備側の両方を対象とし、重複行は除外する。兵種は最頻のものを代表とする。
 */
export function unitStats(log: BattleRecord[], range?: YearRange): UnitStat[] {
  interface Acc {
    unit: string;
    branches: Map<string, number>;
    battles: number;
    wins: number;
    losses: number;
    others: number;
    attackUses: number;
    defenseUses: number;
    users: Map<string, number>;
  }
  const map = new Map<string, Acc>();
  const sides: SideKey[] = ["left", "right"];
  for (const { card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    for (const side of sides) {
      const self = side === "left" ? card.left : card.right;
      const raw = self.unit;
      if (!raw) continue;
      const unit = normalizeDisplayToken(raw);
      if (!unit) continue;
      const result = outcomeForSide(card.winner, side);
      let e = map.get(unit);
      if (!e) {
        e = {
          unit,
          branches: new Map(),
          battles: 0,
          wins: 0,
          losses: 0,
          others: 0,
          attackUses: 0,
          defenseUses: 0,
          users: new Map(),
        };
        map.set(unit, e);
      }
      e.battles++;
      if (result === "win") e.wins++;
      else if (result === "loss") e.losses++;
      else e.others++;
      if (side === "left") e.attackUses++;
      else e.defenseUses++;
      const branch = self.branch?.trim();
      if (branch) e.branches.set(branch, (e.branches.get(branch) ?? 0) + 1);
      const user = self.name?.trim();
      if (user) e.users.set(user, (e.users.get(user) ?? 0) + 1);
    }
  }
  return Array.from(map.values())
    .map((e) => {
      const decided = e.wins + e.losses;
      const branch =
        Array.from(e.branches.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "";
      const topUsers = Array.from(e.users.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return {
        unit: e.unit,
        branch,
        battles: e.battles,
        wins: e.wins,
        losses: e.losses,
        others: e.others,
        decided,
        winRate: decided > 0 ? e.wins / decided : 0,
        attackUses: e.attackUses,
        defenseUses: e.defenseUses,
        topUsers,
      };
    })
    .sort((a, b) => b.battles - a.battles);
}

/** 装備枠。weapon=武器(武将の持つ武器) / item=品物(武将の持つ品物)。 */
export type EquipSlot = "weapon" | "item";

/** 装備枠に対応する取り出し関数を返す。 */
function equipPick(slot: EquipSlot): (side: BattleSide) => string | undefined {
  return slot === "weapon" ? (s) => s.equip2 : (s) => s.equip1;
}

/** 片側が指定の装備（武器/品物）を装備しているか。 */
function equipMatches(
  side: BattleSide,
  slot: EquipSlot,
  target: string
): boolean {
  const raw = equipPick(slot)(side);
  if (!raw) return false;
  return normalizeDisplayToken(raw) === target;
}

/**
 * 指定の装備（武器=武将の持つ武器 / 品物=武将の持つ品物）が使われた戦闘を新しい順で集める。
 * 同じ戦闘で両側が装備していれば 2 件になる（兵種ページと同じ方針）。
 */
export function collectEquipBattles(
  log: BattleRecord[],
  equipName: string,
  slot: EquipSlot
): BattleOutcome[] {
  const target = equipName.trim();
  const out: BattleOutcome[] = [];
  for (const { record, card } of dedupedCards(log)) {
    if (equipMatches(card.left, slot, target))
      out.push(makeOutcome(record, card, "left"));
    if (equipMatches(card.right, slot, target))
      out.push(makeOutcome(record, card, "right"));
  }
  return sortByTimeDesc(out);
}

/** 装備の組み合わせ（武器＝武将の持つ武器 × 品物＝武将の持つ品物）ごとの勝率。 */
export interface EquipSynergyStat {
  /** 武将の持つ武器 */
  weapon: string;
  /** 武将の持つ品物 */
  item: string;
  /** 登場した戦闘数（攻守の延べ） */
  battles: number;
  wins: number;
  losses: number;
  /** 勝敗が確定した数（wins + losses） */
  decided: number;
  /** 勝率 0..1（decided が 0 のときは 0） */
  winRate: number;
  /** よく使う武将 TOP3 */
  topUsers: { name: string; count: number }[];
}

/**
 * 武将の持つ武器と武将の持つ品物の組み合わせごとに勝率を集計し、どの組み合わせが
 * 強いかを数値化する。両方の装備が揃っている側のみ対象（片方でも空・「なし」は除外）。
 * 出兵側・守備側の両方を対象とし、重複行は除外する。
 */
export function equipSynergy(log: BattleRecord[]): EquipSynergyStat[] {
  interface Acc {
    weapon: string;
    item: string;
    battles: number;
    wins: number;
    losses: number;
    users: Map<string, number>;
  }
  const map = new Map<string, Acc>();
  const sides: SideKey[] = ["left", "right"];
  for (const { card } of dedupedCards(log)) {
    for (const side of sides) {
      const self = side === "left" ? card.left : card.right;
      if (!self.equip1 || !self.equip2) continue;
      const weapon = normalizeDisplayToken(self.equip2);
      const item = normalizeDisplayToken(self.equip1);
      if (!weapon || weapon === "なし") continue;
      if (!item || item === "なし") continue;
      const key = `${weapon}\u0000${item}`;
      const result = outcomeForSide(card.winner, side);
      let e = map.get(key);
      if (!e) {
        e = { weapon, item, battles: 0, wins: 0, losses: 0, users: new Map() };
        map.set(key, e);
      }
      e.battles++;
      if (result === "win") e.wins++;
      else if (result === "loss") e.losses++;
      const user = self.name?.trim();
      if (user) e.users.set(user, (e.users.get(user) ?? 0) + 1);
    }
  }
  return Array.from(map.values())
    .map((e) => {
      const decided = e.wins + e.losses;
      const topUsers = Array.from(e.users.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      return {
        weapon: e.weapon,
        item: e.item,
        battles: e.battles,
        wins: e.wins,
        losses: e.losses,
        decided,
        winRate: decided > 0 ? e.wins / decided : 0,
        topUsers,
      };
    })
    .sort((a, b) => b.battles - a.battles);
}

/** ログ中で最も新しいゲーム内の年を返す（判別できる戦闘が無ければ null）。 */
export function latestGameYear(log: BattleRecord[]): number | null {
  let max: number | null = null;
  for (const { card } of dedupedCards(log)) {
    const y = gameYear(card);
    if (y != null && (max == null || y > max)) max = y;
  }
  return max;
}

/** 指定したゲーム内年の範囲に登場する国名を、日本語順で返す。 */
export function factionsInYearRange(
  log: BattleRecord[],
  range?: YearRange
): string[] {
  const factions = new Set<string>();
  for (const { card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    for (const side of [card.left, card.right]) {
      const faction = side.faction?.trim();
      if (faction) factions.add(faction);
    }
  }
  return Array.from(factions).sort((a, b) => a.localeCompare(b, "ja"));
}

/**
 * ランキング（武将 / 兵種 / 武器 / 品物）用の集計期間プリセット。
 * 「全期間」「過去10年間」（ログ中の最新のゲーム内年から遡って 10 年）の順に置き、
 * 続けてメタ分析と同じ絶対年バケット（06年-11年 …）を並べ、
 * 特定の年ごとに区切って比較できるようにする。
 */
export function rankingPeriods(log: BattleRecord[]): MetaPeriod[] {
  const latest = latestGameYear(log);
  const last10: MetaPeriod =
    latest != null
      ? { key: RANKING_LAST10_KEY, label: "過去10年間", from: latest - 9, to: latest }
      : { key: RANKING_LAST10_KEY, label: "過去10年間", from: null, to: null };
  const all = META_PERIODS.find((period) => period.key === "all");
  const yearBuckets = META_PERIODS.filter((period) => period.key !== "all");
  return all ? [all, last10, ...yearBuckets] : [last10, ...yearBuckets];
}

/**
 * card のゲーム内の年が範囲 [from, to]（両端含む）に入るか。
 * range 未指定または両端 null なら常に true。年が判別できない戦闘は範囲指定時は除外する。
 */
function withinYearRange(
  card: BattleCard,
  range: YearRange | undefined
): boolean {
  if (!range || (range.from == null && range.to == null)) return true;
  const y = gameYear(card);
  if (y == null) return false;
  if (range.from != null && y < range.from) return false;
  if (range.to != null && y > range.to) return false;
  return true;
}

/**
 * 特性（タイプ）の組み合わせごとの勝率を、出兵側（左）視点で集計する。
 * 行＝出兵側の特性 / 列＝防衛側の特性。各セルは「行の特性で攻めて列の特性に勝った率」。
 * range を渡すと、その年範囲（ゲーム内の年が判明している分）に絞る。重複行は除外する。
 */
export function traitMatchupMatrix(
  log: BattleRecord[],
  range?: YearRange,
  traits: string[] = MATCHUP_TRAITS
): TraitMatchupMatrix {
  const index = new Map<string, number>();
  traits.forEach((t, i) => index.set(t, i));
  const acc = traits.map(() =>
    traits.map(() => ({ battles: 0, wins: 0, losses: 0 }))
  );
  for (const { card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    const ri = index.get(card.left.type?.trim() ?? "");
    const ci = index.get(card.right.type?.trim() ?? "");
    if (ri == null || ci == null) continue;
    const cell = acc[ri][ci];
    cell.battles++;
    const result = outcomeForSide(card.winner, "left");
    if (result === "win") cell.wins++;
    else if (result === "loss") cell.losses++;
  }
  const matrix = acc.map((row) =>
    row.map((c) => {
      const decided = c.wins + c.losses;
      return {
        battles: c.battles,
        wins: c.wins,
        losses: c.losses,
        decided,
        winRate: decided > 0 ? c.wins / decided : 0,
      };
    })
  );
  return { traits, matrix };
}

/**
 * 特定の相性（出兵側＝rowTrait × 防衛側＝colTrait）の戦闘を新しい順で集める。
 * マトリックスのセルをクリックしたときの対戦履歴表示に使う。
 */
export function collectTraitMatchupBattles(
  log: BattleRecord[],
  rowTrait: string,
  colTrait: string,
  range?: YearRange
): BattleOutcome[] {
  const row = rowTrait.trim();
  const col = colTrait.trim();
  const out: BattleOutcome[] = [];
  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    if ((card.left.type?.trim() ?? "") !== row) continue;
    if ((card.right.type?.trim() ?? "") !== col) continue;
    out.push(makeOutcome(record, card, "left"));
  }
  return sortByTimeDesc(out);
}

/* ---------- メタゲーム概観（環境ダッシュボード） ---------- */

/** トレンド（直近半分 − 古い半分の勝率差）の算出に必要な、片側の最小サンプル。 */
const META_TREND_MIN_HALF = 4;

/** 確定戦（時刻つき）を新しい順に半分ずつ比較し、勝率差を返す。不足なら null。 */
function computeTrend(decidedTimed: { t: number; win: boolean }[]): number | null {
  const n = decidedTimed.length;
  const half = Math.floor(n / 2);
  if (half < META_TREND_MIN_HALF) return null;
  const sorted = [...decidedTimed].sort((a, b) => b.t - a.t); // 新しい順
  const recent = sorted.slice(0, half);
  const older = sorted.slice(n - half);
  const rateOf = (arr: { win: boolean }[]) =>
    arr.filter((x) => x.win).length / arr.length;
  return rateOf(recent) - rateOf(older);
}

interface MetaUnitAcc {
  appearances: number;
  wins: number;
  losses: number;
  branches: Map<string, number>;
  /** トレンド算出用：勝敗が確定した戦闘を時刻つきで保持。 */
  decidedTimed: { t: number; win: boolean }[];
}

interface MetaTraitAcc {
  appearances: number;
  wins: number;
  losses: number;
}

/**
 * 環境（メタゲーム）全体を概観する集計。
 * 兵種ごとの採用率・勝率・強度ティア・トレンド、特性別の勝率、環境警告をまとめて返す。
 * range を渡すと、その年範囲（ゲーム内の年が判明している分）に絞る。重複行は除外する。
 * typeFilter を渡すと、兵種採用ランキングをその武将タイプ（特性）のものだけに絞り、
 * 採用率は「そのタイプの中での割合」として計算する（特性別の勝率セクションは比較用なので絞らない）。
 */
export function metaOverview(
  log: BattleRecord[],
  range?: YearRange,
  typeFilter?: string
): MetaOverview {
  const typeOf = typeFilter?.trim() || null;
  const now = new Date();
  const units = new Map<string, MetaUnitAcc>();
  const traits = new Map<string, MetaTraitAcc>();
  let totalBattles = 0;

  const addUnit = (
    side: BattleSide,
    result: OutcomeResult,
    t: number | null
  ) => {
    const name = side.unit ? normalizeDisplayToken(side.unit) : "";
    if (!name) return;
    let a = units.get(name);
    if (!a) {
      a = {
        appearances: 0,
        wins: 0,
        losses: 0,
        branches: new Map(),
        decidedTimed: [],
      };
      units.set(name, a);
    }
    a.appearances++;
    const branch = side.branch?.trim();
    if (branch) a.branches.set(branch, (a.branches.get(branch) ?? 0) + 1);
    if (result === "win") {
      a.wins++;
      if (t != null) a.decidedTimed.push({ t, win: true });
    } else if (result === "loss") {
      a.losses++;
      if (t != null) a.decidedTimed.push({ t, win: false });
    }
  };

  const addTrait = (side: BattleSide, result: OutcomeResult) => {
    const trait = side.type?.trim();
    if (!trait) return;
    let s = traits.get(trait);
    if (!s) {
      s = { appearances: 0, wins: 0, losses: 0 };
      traits.set(trait, s);
    }
    s.appearances++;
    if (result === "win") s.wins++;
    else if (result === "loss") s.losses++;
  };

  for (const { record, card } of dedupedCards(log)) {
    if (!withinYearRange(card, range)) continue;
    totalBattles++;
    const t = parseActionDate(record.time, now)?.getTime() ?? null;
    const leftResult = outcomeForSide(card.winner, "left");
    const rightResult = outcomeForSide(card.winner, "right");
    // 兵種ランキングは typeFilter 指定時にそのタイプの側だけ集計する。
    if (typeOf == null || card.left.type?.trim() === typeOf)
      addUnit(card.left, leftResult, t);
    if (typeOf == null || card.right.type?.trim() === typeOf)
      addUnit(card.right, rightResult, t);
    // 特性別の勝率は比較ビューなので typeFilter に関わらず全タイプを集計する。
    addTrait(card.left, leftResult);
    addTrait(card.right, rightResult);
  }

  const denom = totalBattles * 2;
  // typeFilter 指定時の採用率は「そのタイプの延べ登場数」を分母にし、タイプ内の割合として示す。
  let unitAppearances = 0;
  for (const a of units.values()) unitAppearances += a.appearances;
  const unitDenom = typeOf ? unitAppearances : denom;

  const unitStats: MetaUnitStat[] = Array.from(units.entries()).map(
    ([unit, a]) => {
      const decided = a.wins + a.losses;
      const winRate = decided > 0 ? a.wins / decided : 0;
      const pickRate = unitDenom > 0 ? a.appearances / unitDenom : 0;
      let branch: string | undefined;
      let bestN = 0;
      for (const [b, n] of a.branches) {
        if (n > bestN) {
          branch = b;
          bestN = n;
        }
      }
      return {
        unit,
        branch,
        appearances: a.appearances,
        pickRate,
        wins: a.wins,
        losses: a.losses,
        decided,
        winRate,
        tier: metaTier(pickRate, winRate, decided),
        trend: computeTrend(a.decidedTimed),
      };
    }
  );
  unitStats.sort((x, y) => y.pickRate - x.pickRate || y.winRate - x.winRate);

  const traitStats: MetaTraitStat[] = Array.from(traits.entries()).map(
    ([trait, s]) => {
      const decided = s.wins + s.losses;
      return {
        trait,
        appearances: s.appearances,
        pickRate: denom > 0 ? s.appearances / denom : 0,
        wins: s.wins,
        losses: s.losses,
        decided,
        winRate: decided > 0 ? s.wins / decided : 0,
      };
    }
  );
  traitStats.sort((x, y) => y.appearances - x.appearances);

  const warnings: MetaWarning[] = [];
  // タイプで絞り込んだときの採用率はタイプ内割合なので、全体基準の警告は出さない。
  if (!typeOf) {
    for (const u of unitStats) {
      const pickPct = Math.round(u.pickRate * 100);
      const winPct = Math.round(u.winRate * 100);
      if (u.tier === "S+") {
        warnings.push({
          unit: u.unit,
          level: "dominant",
          message: `${u.unit} が高採用・高勝率で環境を支配しています（採用 ${pickPct}% / 勝率 ${winPct}%）。`,
        });
      } else if (u.pickRate > 0.22) {
        warnings.push({
          unit: u.unit,
          level: "overpick",
          message: `${u.unit} の採用率が突出しています（採用 ${pickPct}%）。`,
        });
      }
    }
  }

  return { totalBattles, units: unitStats, traits: traitStats, warnings };
}
