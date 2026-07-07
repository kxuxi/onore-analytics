import {
  parseBattleCard,
  normalizeDisplayToken,
  battleKey,
  type BattleCard,
  type BattleSide,
  type BattleWinner,
} from "./parser";
import { parseActionDate } from "./action";
import { normalizationMap } from "./storage";
import type { BattleRecord, WarlordMap } from "./types";

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

/** ログをカード化し、内容が重複する行を除外する。 */
function dedupedCards(
  log: BattleRecord[]
): { record: BattleRecord; card: BattleCard }[] {
  const seen = new Set<string>();
  const out: { record: BattleRecord; card: BattleCard }[] = [];
  for (const record of log) {
    const key = battleKey(record.line);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const card = parseBattleCard(record.line);
    if (card) out.push({ record, card });
  }
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
  name: string,
  aliases?: string[]
): BattleOutcome[] {
  const targets = new Set([name.trim(), ...(aliases ?? []).map((a) => a.trim())]);
  const out: BattleOutcome[] = [];
  for (const { record, card } of dedupedCards(log)) {
    // 通常は左右どちらか一方のみ一致する。両方一致した場合は左を優先。
    if (targets.has(card.left.name ?? "")) out.push(makeOutcome(record, card, "left"));
    else if (targets.has(card.right.name ?? ""))
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
  return `${Math.round(rate * 100)}%`;
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

/* ---------- 兵科別の勝率 ---------- */

/** 兵科（万能 / 騎兵 / 歩兵 など）ごとの戦績。 */
export interface BranchStat {
  branch: string;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/** 注目側が出陣した兵科ごとに勝率を集計する（戦闘数の多い順）。 */
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
 * 在ゲーム年の年代ごとに、武将を勝率（総合＝攻撃＋守備）で順位付けする。
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
  const normMap = db ? normalizationMap(db) : null;
  const norm = (n: string | undefined): string | null => {
    const k = n?.trim();
    if (!k) return null;
    return (normMap && normMap[k]) || k;
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

    const leftRep = norm(card.left.name);
    const rightRep = norm(card.right.name);
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
  /** 最後に使った兵種の兵科。不明なら undefined。 */
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

/** 兵科ごとにまとめた「最新使用兵種」の内訳。 */
export interface BranchLatestUnits {
  /** 兵科名（不明・空欄は "その他"）。 */
  branch: string;
  /** この兵科を最新で使っている人数の合計。 */
  total: number;
  /** 兵種ごとの人数（多い順）。 */
  units: { unit: string; count: number }[];
}

/**
 * 武将ごとの「最新で使っている兵種」を兵科別に集計する。
 * 各エントリ（1 武将）の最新兵種を 1 票として数え、兵科 → 兵種の順にまとめる。
 * 兵科は人数の多い順（"その他" は末尾）、兵種は各兵科内で人数の多い順。
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
  for (const { card } of dedupedCards(log)) {
    const year = gameYear(card);
    if (year == null) continue;
    total.set(year, (total.get(year) ?? 0) + 1);
    const inBattle =
      unitMatches(card.left, target) || unitMatches(card.right, target);
    if (inBattle) used.set(year, (used.get(year) ?? 0) + 1);
  }
  return Array.from(total.entries())
    .map(([year, totalBattles]) => {
      const unitBattles = used.get(year) ?? 0;
      return {
        year,
        totalBattles,
        unitBattles,
        rate: totalBattles > 0 ? unitBattles / totalBattles : 0,
      };
    })
    .sort((a, b) => a.year - b.year);
}

/** この兵種が分類される兵科（最も多く登場した兵科）を返す。 */
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

/* ---------- 撃破加重指数（Sweep Weight Index / SWI） ---------- */

/**
 * 枚抜き枚数 n に対する重み（乗数）。実効値 = n × 乗数。
 *   2枚 ×1.0 / 3枚 ×1.2 / 4枚 ×1.5 / 5枚 ×2.0 / 6枚 ×2.5
 * 1枚は単純な1勝として ×1.0。6枚超は +0.5 刻みで外挿する。
 */
export function sweepMultiplier(n: number): number {
  if (n <= 0) return 0;
  const table: Record<number, number> = {
    1: 1.0,
    2: 1.0,
    3: 1.2,
    4: 1.5,
    5: 2.0,
    6: 2.5,
  };
  return table[n] ?? 2.5 + 0.5 * (n - 6);
}

/** 枚抜き枚数 n の実効値（= n × 乗数）。 */
export function sweepEffectiveValue(n: number): number {
  return n * sweepMultiplier(n);
}

/** 1 出撃（同一攻撃側・同一戦闘時刻）の集約。 */
interface SortieAgg {
  /** 攻撃側として勝利した戦目番号の集合 */
  wins: Set<number>;
}

/**
 * 1 出撃の「枚抜き枚数」= 1戦目から連続で勝った数。
 * 攻撃は 1戦目→2戦目→3戦目 と進むため、最初に勝てなかった時点で止まる。
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

export interface SwiStat {
  /** 攻撃側武将名 */
  name: string;
  faction?: string;
  /** 兵科（騎兵/歩兵など） */
  branch?: string;
  /** 総出兵数（攻撃側として出撃した回数） */
  sorties: number;
  /** 実効値の合計（Σ 枚数 × 重み） */
  weighted: number;
  /** SWI = weighted / sorties */
  swi: number;
  /** 枚抜き枚数ごとの出撃回数（index = 枚数, 0..） */
  sweepCounts: number[];
  /** 最大枚抜き枚数 */
  bestSweep: number;
}

/** 戦目番号（"3戦目" → 3）を数値で返す。取れなければ 0。 */
function battleNoNumber(no: string | undefined): number {
  const m = no?.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * 撃破加重指数（SWI）ランキングを算出する。
 * 出撃 = (攻撃側武将, 戦闘時刻) でまとめた 1 回の攻撃。
 * 各出撃の枚抜き枚数（1戦目からの連勝数）に重みを掛けた実効値を合算し、
 * 総出兵数で割って SWI とする。重複行は除外する。
 *
 * @param minSorties ランキングに載せる最小出撃数（既定 5）
 */
/** ある側（攻撃=left / 守備=right）の視点で集計した武将ごとの SWI 指標。 */
export interface SideSwiStat {
  name: string;
  faction?: string;
  branch?: string;
  /** その側として出撃（同一戦闘時刻でまとめた回数） */
  sorties: number;
  /** 実効値の合計（Σ 枚抜き × 重み） */
  weighted: number;
  /** SWI = weighted / sorties */
  swi: number;
  /** その側で勝った戦目の総数（攻撃なら出兵勝利数 / 守備なら守備勝利数） */
  wins: number;
  /** 枚抜き枚数ごとの出撃回数（index = 枚数, 0..） */
  sweepCounts: number[];
  /** 最大枚抜き枚数 */
  bestSweep: number;
}

/**
 * 指定した側（攻撃 / 守備）の視点で、武将ごとの出撃・連勝（枚抜き）・SWI を集計する。
 * 出撃 = (注目側武将, 戦闘時刻) でまとめた 1 回。枚抜き = 1戦目からの連勝数。
 * 守備側も同様に (防衛側武将, 戦闘時刻) でまとめ、1戦目から連続で守り切った数を
 * 「枚抜き（守備）」として攻撃と同じ重みで評価する。重複行は除外する。
 * 
 * @param log 戦闘ログ
 * @param side 集計対象の側（left=攻撃 / right=守備）
 * @param db 武将DB。渡された場合、同じ household の複数の名前を1つに正規化。
 */
function computeSideSwi(
  log: BattleRecord[],
  side: SideKey,
  db?: WarlordMap
): Map<string, SideSwiStat> {
  // 同じ household の複数の名前を最新の代表名に正規化するマップ
  const normMap = db ? normalizationMap(db) : null;

  // 出撃単位に集約。
  const sorties = new Map<string, SortieAgg>();
  // 武将ごとの最新の勢力・兵科（表示・フィルタ用）。
  const factionOf = new Map<string, string | undefined>();
  const branchOf = new Map<string, string | undefined>();

  for (const { card } of dedupedCards(log)) {
    const self = side === "left" ? card.left : card.right;
    let name = self.name?.trim();
    if (!name) continue;
    // household でグループ化（normMap が有効な場合）
    if (normMap && normMap[name]) {
      name = normMap[name];
    }
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
    weighted: number;
    wins: number;
    sweepCounts: number[];
    bestSweep: number;
  }
  const acc = new Map<string, Acc>();
  for (const [key, s] of sorties) {
    const name = key.slice(0, key.indexOf("@@"));
    let a = acc.get(name);
    if (!a) {
      a = {
        name,
        sorties: 0,
        weighted: 0,
        wins: 0,
        sweepCounts: [],
        bestSweep: 0,
      };
      acc.set(name, a);
    }
    const n = sortieSweepCount(s);
    a.sorties++;
    a.wins += s.wins.size;
    a.weighted += sweepEffectiveValue(n);
    a.sweepCounts[n] = (a.sweepCounts[n] ?? 0) + 1;
    if (n > a.bestSweep) a.bestSweep = n;
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
      weighted: a.weighted,
      swi: a.sorties > 0 ? a.weighted / a.sorties : 0,
      wins: a.wins,
      sweepCounts,
      bestSweep: a.bestSweep,
    });
  }
  return out;
}

export function swiRanking(log: BattleRecord[], minSorties = 5): SwiStat[] {
  return Array.from(computeSideSwi(log, "left").values())
    .filter((a) => a.sorties >= minSorties)
    .map((a) => ({
      name: a.name,
      faction: a.faction,
      branch: a.branch,
      sorties: a.sorties,
      weighted: a.weighted,
      swi: a.swi,
      sweepCounts: a.sweepCounts,
      bestSweep: a.bestSweep,
    }))
    .sort((a, b) => b.swi - a.swi || b.sorties - a.sorties);
}

/* ---------- 武将ランキング（攻撃 / 守備の総合） ---------- */

/** ランキングで切り替えられる指標。 */
export type RankMetric =
  | "avgBreakthrough"
  | "defenseEfficiency"
  | "attackWinRate"
  | "defenseWinRate"
  | "assists";

/** 武将 1 人の攻撃・守備の総合戦績。 */
export interface WarlordRankStat {
  name: string;
  faction?: string;
  branch?: string;
  /** 平均枚抜き（攻撃勝利数 / 攻撃出撃数） */
  avgBreakthrough: number;
  /** 守備効率（守備勝利数 / 守備出撃数） */
  defenseEfficiency: number;
  /** 攻撃勝率（攻撃側として勝った戦目 / 攻撃側として参加した決着戦目） */
  attackWinRate: number;
  /** 守備勝率（守備側として勝った戦目 / 守備側として参加した決着戦目） */
  defenseWinRate: number;
  /** 攻撃側としての出撃回数（撤退除く） */
  attackSorties: number;
  /** 出兵勝利数（攻撃側として勝った戦目の総数） */
  attackWins: number;
  /** 攻撃側として参加した決着戦目数 */
  attackRounds: number;
  /** 攻撃側として勝った決着戦目数 */
  attackWinRounds: number;
  /** SWI（攻撃） */
  attackSwi: number;
  /** 攻撃側の最高枚抜き */
  attackBestSweep: number;
  /** 守備側としての出撃回数（撤退除く） */
  defenseSorties: number;
  /** 守備勝利数（守備側として勝った戦目の総数） */
  defenseWins: number;
  /** 守備側として参加した決着戦目数 */
  defenseRounds: number;
  /** 守備側として勝った決着戦目数 */
  defenseWinRounds: number;
  /** SWI（守備） */
  defenseSwi: number;
  /** 守備側の最高枚抜き */
  defenseBestSweep: number;
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

/** 指標が攻撃側のものか。 */
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
 * - 攻撃側（left 勝利）でも守備側（right 勝利）でもアシストが発生する。
 * - 同一 battleAt（同一タイムスタンプ）内の別ラウンドは 0 分差のため
 *   「別イベント」に含めない（T < T2 の厳格チェック）。
 */
function computeAssists(log: BattleRecord[], db?: WarlordMap): Map<string, number> {
  const normMap = db ? normalizationMap(db) : null;
  const now = new Date();
  const cards = dedupedCards(log);

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

  for (const { card } of cards) {
    if (card.winner !== "left" && card.winner !== "right") continue;
    const t = getTime(card.battleAt);
    if (t === null) continue;

    let winnerName = (
      card.winner === "left" ? card.left : card.right
    ).name?.trim();
    let loserName = (
      card.winner === "left" ? card.right : card.left
    ).name?.trim();
    if (winnerName && normMap && normMap[winnerName]) {
      winnerName = normMap[winnerName];
    }
    if (loserName && normMap && normMap[loserName]) {
      loserName = normMap[loserName];
    }
    if (!winnerName || !loserName) continue;

    // 敗者の被倒時刻を記録。
    const dt = defeatTimes.get(loserName) ?? [];
    dt.push(t);
    defeatTimes.set(loserName, dt);

    // ダメージイベント（同一 battleAt × 同一ペアは 1 件に集約）。
    const key = `${winnerName}@@${loserName}@@${card.battleAt ?? ""}`;
    if (!damageEventSeen.has(key)) {
      damageEventSeen.add(key);
      damageEvents.push({ winner: winnerName, loser: loserName, time: t });
    }
  }

  const assists = new Map<string, number>();
  for (const { winner, loser, time: T } of damageEvents) {
    const defeats = defeatTimes.get(loser);
    if (!defeats) continue;
    // T < T2 <= T+40min の別イベントで B が倒されたか。
    const wasDefeated = defeats.some(
      (t2) => t2 > T && t2 <= T + ASSIST_WINDOW_MS
    );
    if (wasDefeated) {
      assists.set(winner, (assists.get(winner) ?? 0) + 1);
    }
  }

  return assists;
}

/** 決着戦目ごとの攻撃/守備勝率集計（撤退・引き分けを除く）。 */
function computeRoundWinRates(
  log: BattleRecord[],
  db?: WarlordMap
): Map<string, { attackWins: number; attackRounds: number; defenseWins: number; defenseRounds: number }> {
  const normMap = db ? normalizationMap(db) : null;
  const out = new Map<string, { attackWins: number; attackRounds: number; defenseWins: number; defenseRounds: number }>();
  for (const { card } of dedupedCards(log)) {
    if (card.winner !== "left" && card.winner !== "right") continue;
    let leftName = card.left.name?.trim();
    let rightName = card.right.name?.trim();
    if (leftName && normMap && normMap[leftName]) {
      leftName = normMap[leftName];
    }
    if (rightName && normMap && normMap[rightName]) {
      rightName = normMap[rightName];
    }
    if (leftName) {
      const cur = out.get(leftName) ?? { attackWins: 0, attackRounds: 0, defenseWins: 0, defenseRounds: 0 };
      cur.attackRounds += 1;
      if (card.winner === "left") cur.attackWins += 1;
      out.set(leftName, cur);
    }
    if (rightName) {
      const cur = out.get(rightName) ?? { attackWins: 0, attackRounds: 0, defenseWins: 0, defenseRounds: 0 };
      cur.defenseRounds += 1;
      if (card.winner === "right") cur.defenseWins += 1;
      out.set(rightName, cur);
    }
  }
  return out;
}

/** 撤退を含む出撃を除外した効率用の集計。 */
function computeEfficiency(
  log: BattleRecord[],
  side: SideKey,
  db?: WarlordMap
): Map<string, { wins: number; sorties: number }> {
  const normMap = db ? normalizationMap(db) : null;
  interface Sortie {
    wins: Set<number>;
    hasRetreat: boolean;
  }
  const sorties = new Map<string, Sortie>();

  for (const { card } of dedupedCards(log)) {
    const self = side === "left" ? card.left : card.right;
    let name = self.name?.trim();
    if (name && normMap && normMap[name]) {
      name = normMap[name];
    }
    if (!name) continue;
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
    // 撤退を含む出撃は効率の分母・分子から除外。
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
 * 武将ごとに攻撃・守備の出撃数 / 勝利数 / SWI をまとめて集計する。
 * 出兵勝利数・守備勝利数はその側で勝った戦目の総数、
 * SWI（攻撃 / 守備）はそれぞれの側を 1戦目からの連勝（枚抜き）で重み付け評価したもの。
 * 
 * @param log 戦闘ログ
 * @param db 武将DB。渡された場合、同じ household の複数の名前を1つに正規化。
 */
export function warlordRanking(log: BattleRecord[], db?: WarlordMap): WarlordRankStat[] {
  const atk = computeSideSwi(log, "left", db);
  const def = computeSideSwi(log, "right", db);
  const atkEff = computeEfficiency(log, "left", db);
  const defEff = computeEfficiency(log, "right", db);
  const roundRates = computeRoundWinRates(log, db);
  const assistsMap = computeAssists(log, db);
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
      attackSwi: a?.swi ?? 0,
      attackBestSweep: a?.bestSweep ?? 0,
      defenseSorties: de.sorties,
      defenseWins: de.wins,
      defenseRounds: rr.defenseRounds,
      defenseWinRounds: rr.defenseWins,
      defenseSwi: d?.swi ?? 0,
      defenseBestSweep: d?.bestSweep ?? 0,
      assists: assistsMap.get(name) ?? 0,
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
  /** 攻撃側で装備した回数 */
  attackUses: number;
  /** 守備側で装備した回数 */
  defenseUses: number;
  /** よく使う武将 TOP3 */
  topUsers: { name: string; count: number }[];
}

/**
 * 戦闘ログの装備枠（武器=装備1 / 品物=装備2）を集計し、装備ごとの使用回数・
 * 勝率・主な使用武将を求める。`pick` で集計対象の枠を選ぶ。攻撃側・守備側の
 * 両方を対象とし、重複行は除外する。「なし」など装備なしは除外する。
 */
function collectEquipStats(
  log: BattleRecord[],
  pick: (side: BattleSide) => string | undefined
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

/** 武器（ゲームの装備2列）ごとの使用実績を集計する。 */
export function weaponStats(log: BattleRecord[]): EquipStat[] {
  return collectEquipStats(log, (s) => s.equip2);
}

/** 品物（ゲームの装備1列）ごとの使用実績を集計する。 */
export function itemStats(log: BattleRecord[]): EquipStat[] {
  return collectEquipStats(log, (s) => s.equip1);
}

/** 兵種ランキングの集計単位。 */
export interface UnitStat {
  /** 兵種名（normalizeDisplayToken 済み） */
  unit: string;
  /** 代表兵科（その兵種で最も多い兵科） */
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
  /** 攻撃側で出撃した回数 */
  attackUses: number;
  /** 守備側で出撃した回数 */
  defenseUses: number;
  /** よく使う武将 TOP3 */
  topUsers: { name: string; count: number }[];
}

/**
 * 兵種ごとの出撃実績を集計し、使用回数・勝率・主な使用武将を求める。
 * 攻撃側・守備側の両方を対象とし、重複行は除外する。兵科は最頻のものを代表とする。
 */
export function unitStats(log: BattleRecord[]): UnitStat[] {
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

/** 装備枠。weapon=武器(装備2) / item=品物(装備1)。 */
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
 * 指定の装備（武器=装備2 / 品物=装備1）が使われた戦闘を新しい順で集める。
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

/** 装備の組み合わせ（武器＝装備2 × 品物＝装備1）ごとの勝率。 */
export interface EquipSynergyStat {
  /** 武器（装備2） */
  weapon: string;
  /** 品物（装備1） */
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
 * 武器（装備2）と品物（装備1）の組み合わせごとに勝率を集計し、どの組み合わせが
 * 強いかを数値化する。両方の装備が揃っている側のみ対象（片方でも空・「なし」は除外）。
 * 攻撃側・守備側の両方を対象とし、重複行は除外する。
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

/**
 * 相性マトリックスで扱う主要な特性（タイプ）の表示順。
 * 政治家・謎などの非戦闘タイプは対戦相性の対象外とする。
 */
export const MATCHUP_TRAITS = ["武特", "知特", "統特", "武統", "知武", "統知"];

/** 相性マトリックスの 1 セル（攻撃側の特性 × 防衛側の特性）。 */
export interface TraitMatchupCell {
  /** 対戦数（攻撃側＝左側の延べ） */
  battles: number;
  wins: number;
  losses: number;
  /** 勝敗が確定した数（wins + losses） */
  decided: number;
  /** 勝率 0..1（decided が 0 のときは 0） */
  winRate: number;
}

/** 特性ごとの相性マトリックス。 */
export interface TraitMatchupMatrix {
  /** 行（攻撃側）・列（防衛側）に並ぶ特性。 */
  traits: string[];
  /** matrix[i][j] = traits[i]（攻撃側）が traits[j]（防衛側）と戦った成績。 */
  matrix: TraitMatchupCell[][];
}

/** ゲーム内の年でフィルタする範囲（西暦・両端を含む、null＝無制限）。 */
export interface YearRange {
  from: number | null;
  to: number | null;
}

/** メタ分析の集計期間プリセット（ゲーム内の年で区切る）。 */
export interface MetaPeriod extends YearRange {
  key: string;
  label: string;
}

/**
 * メタ分析（相性マトリックス・環境ダッシュボード）の集計期間プリセット。
 * ゲーム内の通算年（西暦の下2桁が「○年」）で区切る。from/to は西暦で両端を含む。
 */
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
 * 特性（タイプ）の組み合わせごとの勝率を、攻撃側（左）視点で集計する。
 * 行＝攻撃側の特性 / 列＝防衛側の特性。各セルは「行の特性で攻めて列の特性に勝った率」。
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
 * 特定の相性（攻撃側＝rowTrait × 防衛側＝colTrait）の戦闘を新しい順で集める。
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

/** 兵種の強度ティア（上から S+ が最強）。 */
export type MetaTier = "S+" | "S" | "A+" | "A" | "B" | "C";

/** 強度ティアを判定するのに必要な、最小の勝敗確定戦数。 */
export const META_MIN_TIER_DECIDED = 10;

/** トレンド（直近半分 − 古い半分の勝率差）の算出に必要な、片側の最小サンプル。 */
const META_TREND_MIN_HALF = 4;

/** 環境ダッシュボードに表示する 1 兵種分の集計。 */
export interface MetaUnitStat {
  unit: string;
  /** 最も多く登場した兵科。 */
  branch?: string;
  /** 延べ登場数（左右どちらでも 1 と数える）。 */
  appearances: number;
  /** 採用率 0..1（appearances / (2 × 総戦闘数)）。 */
  pickRate: number;
  wins: number;
  losses: number;
  /** 勝敗が確定した数（wins + losses）。 */
  decided: number;
  /** 勝率 0..1。 */
  winRate: number;
  /** 強度ティア。確定戦数が不足する場合は null。 */
  tier: MetaTier | null;
  /** 直近半分 − 古い半分の勝率差（-1..1）。サンプル不足は null。 */
  trend: number | null;
}

/** 特性（タイプ）別の採用率・勝率。 */
export interface MetaTraitStat {
  trait: string;
  appearances: number;
  pickRate: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
}

/** 環境警告（支配的な兵種・採用率の突出など）。 */
export interface MetaWarning {
  unit: string;
  /** dominant＝高採用かつ高勝率（S+）/ overpick＝採用率が突出。 */
  level: "dominant" | "overpick";
  message: string;
}

/** 環境ダッシュボードの集計結果。 */
export interface MetaOverview {
  /** 集計対象の総戦闘数（重複除外後）。 */
  totalBattles: number;
  /** 兵種別の集計（採用率の高い順）。 */
  units: MetaUnitStat[];
  /** 特性別の集計（採用率の高い順）。 */
  traits: MetaTraitStat[];
  /** 環境警告。 */
  warnings: MetaWarning[];
}

/** 採用率・勝率・確定戦数から強度ティアを判定する。 */
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

