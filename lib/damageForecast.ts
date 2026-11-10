/**
 * 被弾表の「次にいつ来るか」予測。
 *
 * 守備側が知りたいのは「前回いつ動いたか」ではなく「次にいつ出兵してくるか」。
 * 観測済みの行動時刻と固定行動のパターンから、次の出兵時刻（予測）や
 * 出兵可能になる時刻、時間帯ごとの傾向、前回の攻撃先を導出する。
 */
import {
  ACTION_DONE_MINUTES,
  parseActionDate,
  type ActionInfo,
} from "./action";
import { normalizeWidth, parseBattleCard } from "./parser";
import type { BattleRecord } from "./types";

const MINUTE = 60 * 1000;
/** 固定行動（休養を挟まない連続出兵）の間隔。 */
export const FIXED_INTERVAL_MINUTES = 60;
/** 末尾固定・固定分は10分単位で前後し得るため、予測に持たせる幅（分）。 */
export const FIXED_SPREAD_MINUTES = 10;
/** 予測時刻を過ぎても、この分数までは「まもなく」として同じ予測を保つ。 */
const PREDICTION_GRACE_MINUTES = 5;
/** 予測を先へ繰り延べる上限回数（約半日）。それより古い観測からは予測しない。 */
const MAX_PREDICTION_STEPS = 12;

/** 次の出兵の見込み。 */
export interface Forecast {
  /** 判定に使った観測時刻（最新の出兵、または後から受けた守備敗北）。 */
  baseAt: Date | null;
  /** 最新の出兵時刻。固定行動の予測の起点。 */
  attackAt: Date | null;
  /** 出兵可能になる時刻（観測時刻 + 40分）。 */
  readyAt: Date | null;
  /** 固定行動から予測した次の出兵時刻（固定行動でなければ null）。 */
  predictedAt: Date | null;
  /** 予測の幅（分）。予測時刻の何分前から来うるか。休養なしは 0。 */
  predictedSpread: number | null;
  /** 固定行動の「分」の1の位（例: 5 → 毎時◯5分）。 */
  fixedDigit: number | null;
  /**
   * 並び替え・時間帯分けに使う「来うる時刻」。
   * 予測があれば予測の最も早い時刻（予測時刻 − 幅）、無ければ出兵可能になる時刻
   * （既に過ぎていれば now）。
   */
  expectedAt: Date | null;
}

/** 行動状況と観測時刻から、次の出兵の見込みを求める。 */
export function computeForecast(info: ActionInfo, now: Date): Forecast {
  const baseAt = parseActionDate(info.actionAt ?? undefined, now);
  if (!baseAt) {
    return {
      baseAt: null,
      attackAt: null,
      readyAt: null,
      predictedAt: null,
      predictedSpread: null,
      fixedDigit: null,
      expectedAt: null,
    };
  }
  const readyAt = new Date(baseAt.getTime() + ACTION_DONE_MINUTES * MINUTE);

  let predictedAt: Date | null = null;
  let predictedSpread: number | null = null;
  let fixedDigit: number | null = null;
  // 固定行動は出兵の並びから読むので、起点は必ず最新の出兵時刻にする
  // （守備敗北の時刻は出兵パターンではない）。兵力減の間は予測しない。
  const attackAt = parseActionDate(info.attackAt ?? undefined, now);
  if (info.noRestLabel && attackAt && info.status !== "depleted") {
    fixedDigit = attackAt.getMinutes() % 10;
    predictedSpread =
      info.noRestLabel === "休養なし" ? 0 : FIXED_SPREAD_MINUTES;
    let candidate = attackAt.getTime() + FIXED_INTERVAL_MINUTES * MINUTE;
    let steps = 1;
    while (
      candidate < now.getTime() - PREDICTION_GRACE_MINUTES * MINUTE &&
      steps < MAX_PREDICTION_STEPS
    ) {
      candidate += FIXED_INTERVAL_MINUTES * MINUTE;
      steps++;
    }
    if (candidate >= now.getTime() - PREDICTION_GRACE_MINUTES * MINUTE) {
      predictedAt = new Date(candidate);
    }
  }

  // 幅のある予測は「最も早く来うる時刻」（幅の開始）を基準に並べる。
  const earliestPredicted =
    predictedAt != null
      ? new Date(predictedAt.getTime() - (predictedSpread ?? 0) * MINUTE)
      : null;
  const expectedAt =
    earliestPredicted ??
    (readyAt.getTime() > now.getTime() ? readyAt : new Date(now.getTime()));

  return {
    baseAt,
    attackAt,
    readyAt,
    predictedAt,
    predictedSpread,
    fixedDigit,
    expectedAt,
  };
}

/** 時刻を "HH:mm" にする。 */
export function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 時刻を10分単位に切り捨てる（時間帯の枠の開始時刻）。 */
export function floorToSlot(d: Date, slotMinutes = 10): Date {
  const out = new Date(d.getTime());
  out.setSeconds(0, 0);
  out.setMinutes(out.getMinutes() - (out.getMinutes() % slotMinutes));
  return out;
}

/**
 * 観測した行動時刻を、時（0〜23時）ごとの件数に数える。
 * 「この人は21時台によく来る」といった時間帯の傾向を見るために使う。
 */
export function hourlyActivity(
  actions: readonly string[],
  now: Date
): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const a of new Set(actions)) {
    const d = parseActionDate(a, now);
    if (d) counts[d.getHours()]++;
  }
  return counts;
}

/** 前回の出兵先。 */
export interface LastTarget {
  /** 出兵時刻（MM/DD HH:mm） */
  at: string;
  /** 戦場の都市 */
  place?: string;
  /** 守備側の武将名（壁戦なら守備隊名） */
  defenderName?: string;
  /** 守備側の所属国 */
  defenderFaction?: string;
  /** 壁戦か */
  wall: boolean;
}

function actionAtOf(value: string | undefined): string | undefined {
  const m = normalizeWidth(value ?? "").match(
    /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/
  );
  if (!m) return undefined;
  return (
    `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")} ` +
    `${m[3].padStart(2, "0")}:${m[4]}`
  );
}

/**
 * 【壁戦】セグメントから、出兵側の名前・時刻・都市・守備側（壁）の国を読む。
 * 壁側は通常戦と項目数が違い parseBattleCard では読めないため、
 * 「時刻の直後＝都市」「V.S. の直後＝守備側の国・守備隊名」として取り出す。
 */
function parseWallTargets(line: string): {
  attackerName?: string;
  attackerHousehold?: string;
  target: LastTarget;
}[] {
  const out: {
    attackerName?: string;
    attackerHousehold?: string;
    target: LastTarget;
  }[] = [];
  const segments = normalizeWidth(line.replace(/\r/g, ""))
    .split(/(?=【(?:[^】]*戦目|壁戦)】)/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("【壁戦】"));
  for (const segment of segments) {
    const tokens = segment.split(/\s+/);
    const timeIdx = tokens.findIndex((t) => /^\d{1,2}:\d{2}$/.test(t));
    const vsIdx = tokens.findIndex((t) => /^v\.?s\.?$/i.test(t));
    if (timeIdx < 1 || vsIdx < 8) continue;
    const at = actionAtOf(`${tokens[timeIdx - 1]} ${tokens[timeIdx]}`);
    if (!at) continue;
    // 出兵側は V.S. の直前8項目（国 名前 家 タイプ 兵種 兵種タイプ 品物 武器）。
    const attacker = tokens.slice(vsIdx - 8, vsIdx);
    out.push({
      attackerName: attacker[1],
      attackerHousehold: attacker[2],
      target: {
        at,
        place: tokens[timeIdx + 1],
        defenderFaction: tokens[vsIdx + 1],
        defenderName: tokens[vsIdx + 2],
        wall: true,
      },
    });
  }
  return out;
}

/**
 * 最新の期のログから、武将ごとの「前回の出兵先」を求める。
 * 名前は被弾表と同じ正規化（別名・家督名）で代表名へ寄せる。
 */
export function buildLastTargets(
  log: readonly BattleRecord[],
  canonicalNames: Readonly<Record<string, string>> = {},
  canonicalHouseholds: Readonly<Record<string, string>> = {}
): Map<string, LastTarget> {
  let latestTerm: number | null = null;
  for (const r of log) {
    if (latestTerm == null || r.term > latestTerm) latestTerm = r.term;
  }
  const result = new Map<string, LastTarget>();
  if (latestTerm == null) return result;

  const resolve = (name?: string, household?: string) =>
    (name ? canonicalNames[name] : undefined) ??
    (household ? canonicalHouseholds[household] : undefined) ??
    name;
  const keep = (name: string | undefined, target: LastTarget) => {
    if (!name) return;
    const prev = result.get(name);
    // "MM/DD HH:mm" はゼロ埋め固定長のため文字列比較で時刻順になる。
    if (!prev || target.at >= prev.at) result.set(name, target);
  };

  for (const record of log) {
    if (record.term !== latestTerm) continue;
    const card = parseBattleCard(record.line);
    if (card) {
      const at = actionAtOf(record.time ?? card.battleAt);
      if (at) {
        keep(resolve(card.left.name, card.left.family), {
          at,
          place: card.place,
          defenderName: card.right.name,
          defenderFaction: card.right.faction,
          wall: false,
        });
      }
    }
    for (const wall of parseWallTargets(record.line)) {
      keep(resolve(wall.attackerName, wall.attackerHousehold), wall.target);
    }
  }
  return result;
}

/** ログの最終取り込み時刻（savedAt の最大値、ミリ秒）。無ければ null。 */
export function latestImportedAt(log: readonly BattleRecord[]): number | null {
  let max: number | null = null;
  for (const r of log) {
    if (Number.isFinite(r.savedAt) && (max == null || r.savedAt > max)) {
      max = r.savedAt;
    }
  }
  return max;
}
