import { normalizeWidth, parseBattleCard } from "./parser";
import type { BattleRecord } from "./types";

interface BattleEventPosition {
  gameMonthOrder: number | null;
  actionTimeOrder: number | null;
  actionAt?: string;
}

interface AvailabilityAccumulator {
  term: number;
  latestAttack?: BattleEventPosition;
  latestDefenseLoss?: BattleEventPosition;
}

const ACTION_TIME_YEAR_MINUTES = 12 * 32 * 24 * 60;

export interface ActionAvailability {
  term: number;
  depletedByDefenseLoss: boolean;
  /** 兵力減の原因になった守備敗北時刻（例: 06/15 12:51）。 */
  defenseLossAt?: string;
}

function parseGameMonthOrder(value: string | undefined): number | null {
  const match = normalizeWidth(value ?? "").match(
    /(\d+)\s*年\s*(\d+)\s*月/
  );
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

function parseActionTime(value: string | undefined): {
  actionAt?: string;
  order: number | null;
} {
  const match = normalizeWidth(value ?? "").match(
    /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/
  );
  if (!match) return { order: null };

  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  return {
    actionAt:
      `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")} ` +
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    order: (((month * 32 + day) * 24 + hour) * 60) + minute,
  };
}

function eventPosition(value: string | undefined): BattleEventPosition {
  const actionTime = parseActionTime(value);
  return {
    gameMonthOrder: parseGameMonthOrder(value),
    actionTimeOrder: actionTime.order,
    actionAt: actionTime.actionAt,
  };
}

/**
 * 同一期内の戦闘時刻を比較する。
 * 在ゲーム年月を優先し、同じ年月では実日時を使う。両方が同じ、または
 * 比較不能なら同時刻扱いにし、守備敗北側へ安全に倒せるよう 0 を返す。
 */
function compareEventPosition(
  left: BattleEventPosition,
  right: BattleEventPosition
): number {
  if (
    left.gameMonthOrder != null &&
    right.gameMonthOrder != null &&
    left.gameMonthOrder !== right.gameMonthOrder
  ) {
    return left.gameMonthOrder - right.gameMonthOrder;
  }
  if (
    left.actionTimeOrder != null &&
    right.actionTimeOrder != null &&
    left.actionTimeOrder !== right.actionTimeOrder
  ) {
    let difference = left.actionTimeOrder - right.actionTimeOrder;
    // 履歴には西暦が無いため、12月→1月の大きな差だけ年またぎとして補正する。
    if (difference > ACTION_TIME_YEAR_MINUTES / 2) {
      difference -= ACTION_TIME_YEAR_MINUTES;
    } else if (difference < -ACTION_TIME_YEAR_MINUTES / 2) {
      difference += ACTION_TIME_YEAR_MINUTES;
    }
    return difference;
  }
  return 0;
}

function currentTermAccumulator(
  accumulators: Map<string, AvailabilityAccumulator>,
  name: string,
  term: number
): AvailabilityAccumulator | null {
  const current = accumulators.get(name);
  if (current && current.term > term) return null;
  if (!current || current.term < term) {
    const next = { term };
    accumulators.set(name, next);
    return next;
  }
  return current;
}

function keepLatest(
  current: BattleEventPosition | undefined,
  candidate: BattleEventPosition
): BattleEventPosition {
  return !current || compareEventPosition(candidate, current) >= 0
    ? candidate
    : current;
}

/**
 * 戦闘履歴から、人物ごとの現在の兵力減状態を導出する。
 *
 * - 守備敗北: 兵力減にする
 * - 後の出兵: 兵を再び用意した証拠として解除する
 * - 守備勝利・撤退・引分: 状態を変えない
 * - 新しい期: 前期の状態を持ち越さない
 * - 同時刻の出兵と守備敗北: 守備敗北を優先する
 */
export function buildActionAvailability(
  log: readonly BattleRecord[],
  canonicalNames: Readonly<Record<string, string>> = {}
): Map<string, ActionAvailability> {
  const accumulators = new Map<string, AvailabilityAccumulator>();
  let latestTerm: number | null = null;
  for (const record of log) {
    if (latestTerm == null || record.term > latestTerm) latestTerm = record.term;
  }
  if (latestTerm == null) return new Map();

  for (const record of log) {
    // 全期間表示でも、前期の兵力減は新期へ持ち越さない。
    if (record.term !== latestTerm) continue;
    const card = parseBattleCard(record.line);
    if (!card) continue;
    const position = eventPosition(record.time ?? card.battleAt);
    const attackerName = canonicalNames[card.left.name] ?? card.left.name;
    const defenderName = canonicalNames[card.right.name] ?? card.right.name;

    const attacker = currentTermAccumulator(
      accumulators,
      attackerName,
      record.term
    );
    if (attacker) {
      attacker.latestAttack = keepLatest(attacker.latestAttack, position);
    }

    const defender = currentTermAccumulator(
      accumulators,
      defenderName,
      record.term
    );
    if (defender && card.winner === "left") {
      defender.latestDefenseLoss = keepLatest(
        defender.latestDefenseLoss,
        position
      );
    }
  }

  const result = new Map<string, ActionAvailability>();
  for (const [name, state] of accumulators) {
    const defenseLoss = state.latestDefenseLoss;
    const depletedByDefenseLoss =
      defenseLoss != null &&
      (state.latestAttack == null ||
        compareEventPosition(defenseLoss, state.latestAttack) >= 0);
    result.set(name, {
      term: state.term,
      depletedByDefenseLoss,
      defenseLossAt: depletedByDefenseLoss
        ? defenseLoss?.actionAt
        : undefined,
    });
  }
  return result;
}
