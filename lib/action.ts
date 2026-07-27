import type { Warlord } from "./types";

import type { ActionAvailability } from "./actionObservation";

export type ActionStatus =
  | "done"
  | "ready"
  | "unknown"
  | "depleted"
  | "none";

export interface ActionInfo {
  status: ActionStatus;
  /** 判定に使用した観測時刻からの経過分（時刻が無い場合は null） */
  minutes: number | null;
  /** 状況判定と経過時間に使用した観測時刻。 */
  actionAt: string | null;
  /** 直近の行動が「末尾固定」（分の1の位が動かず連続行動）か */
  noRest: boolean;
  /** 末尾から連続して「末尾固定」（分の1の位が一致）で行動した戦数（2未満は 0） */
  noRestStreak: number;
  /** 末尾から連続してちょうど60分間隔（=休養なし）で行動した戦数（2未満は 0） */
  strictStreak: number;
  /** 表示する固定バッジ（該当なしは null）。固定分＞休養なし＞末尾固定の優先順位。 */
  noRestLabel: NoRestLabel | null;
}

/** 固定系バッジの種類（優先度の高い順）。 */
export type NoRestLabel = "固定分" | "休養なし" | "末尾固定";

/** この戦数以上の連続「末尾固定」で表示が「固定分」へ進化する閾値。 */
export const NO_REST_EVOLVE_STREAK = 5;


export const ACTION_LABEL: Record<ActionStatus, string> = {
  done: "行動済み",
  ready: "未行動",
  unknown: "行動可",
  depleted: "兵力減",
  none: "データなし",
};

/** ステータスの並び順の重み（小さいほど上）。行動候補を先に表示する。 */
export const STATUS_ORDER: Record<ActionStatus, number> = {
  ready: 0,
  unknown: 1,
  done: 2,
  depleted: 3,
  none: 4,
};

/**
 * 全角の数字・記号（例: "０６／１０ ０９：３０"）を半角へ正規化する。
 * 行動時刻に全角が混じって登録されても同じ Date にパースできるようにする。
 */
function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/／/g, "/")
    .replace(/：/g, ":")
    .replace(/　/g, " ");
}

/**
 * "MM/DD HH:mm" 形式の行動時刻を Date に変換する。
 * 年は履歴に含まれないため、基準時刻(now)の年を採用する。
 * ただし算出結果が now より大きく未来になる場合は前年とみなす（年またぎ対策）。
 */
export function parseActionDate(
  lastActionAt: string | undefined,
  now: Date
): Date | null {
  if (!lastActionAt) return null;
  const m = toHalfWidth(lastActionAt).match(
    /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/
  );
  if (!m) return null;
  const [, mm, dd, hh, min] = m;
  let year = now.getFullYear();
  let d = new Date(
    year,
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    0,
    0
  );
  // 未来（now より先）になったら前年の同日時とみなす
  if (d.getTime() - now.getTime() > 60 * 1000) {
    year -= 1;
    d = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0);
  }
  return d;
}

function latestObservedAt(
  storedAt: string | undefined,
  derivedAttackAt: string | undefined,
  now: Date
): string | undefined {
  if (!storedAt) return derivedAttackAt;
  if (!derivedAttackAt) return storedAt;

  const storedDate = parseActionDate(storedAt, now);
  const derivedDate = parseActionDate(derivedAttackAt, now);
  if (!storedDate) return derivedDate ? derivedAttackAt : storedAt;
  if (!derivedDate) return storedAt;
  return derivedDate.getTime() >= storedDate.getTime()
    ? derivedAttackAt
    : storedAt;
}

/**
 * 行動時刻からの経過時間でステータスを判定する。
 *  - 40分以内            … 行動済み (done)
 *  - 40分〜1時間20分     … 未行動   (ready)
 *  - 1時間20分以上       … 行動可   (unknown)
 *  - 最新状態が守備敗北  … 兵力減   (depleted)
 *  - 行動時刻なし        … データなし (none)
 */
export function getActionInfo(
  w: Warlord,
  now: Date,
  availability?: Pick<
    ActionAvailability,
    "depletedByDefenseLoss" | "defenseLossAt" | "latestAttackAt"
  >
): ActionInfo {
  const latestActionAt = latestObservedAt(
    w.lastActionAt,
    availability?.latestAttackAt,
    now
  );
  const actionAt =
    availability?.depletedByDefenseLoss && availability.defenseLossAt
      ? availability.defenseLossAt
      : latestActionAt;
  const d = parseActionDate(actionAt, now);
  if (!d)
    return {
      status: availability?.depletedByDefenseLoss ? "depleted" : "none",
      minutes: null,
      actionAt: actionAt ?? null,
      noRest: false,
      noRestStreak: 0,
      strictStreak: 0,
      noRestLabel: null,
    };
  const minutes = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60000));
  let status: ActionStatus;
  if (availability?.depletedByDefenseLoss) status = "depleted";
  else if (minutes < 40) status = "done";
  else if (minutes < 80) status = "ready";
  else status = "unknown";
  const noRestStreak = computeNoRestStreak(w, now);
  const strictStreak = computeStrictStreak(w, now);
  const noRestLabel = resolveNoRestLabel(noRestStreak, strictStreak);
  return {
    status,
    minutes,
    actionAt: actionAt ?? null,
    noRest: noRestStreak >= 2,
    noRestStreak,
    strictStreak,
    noRestLabel,
  };
}

/**
 * 固定系バッジの優先順位を解決する。
 * 固定分（末尾固定が NO_REST_EVOLVE_STREAK 戦以上連続）
 *   ＞ 休養なし（ちょうど60分間隔が2戦以上連続）
 *   ＞ 末尾固定（分の1の位が2戦以上一致）
 *   ＞ 表示なし(null)
 */
function resolveNoRestLabel(
  noRestStreak: number,
  strictStreak: number
): NoRestLabel | null {
  if (noRestStreak >= NO_REST_EVOLVE_STREAK) return "固定分";
  if (strictStreak >= 2) return "休養なし";
  if (noRestStreak >= 2) return "末尾固定";
  return null;
}

/**
 * 末尾から連続して「末尾固定」（分の1の位が動いていない）で行動した戦数を数える。
 * クールタイムは約1時間で、休まず連続行動すると分の「1の位」が変わらない。
 * 10分単位のズレ（例: 45→35→35→25分）は1の位が「5」で固定のため許容する。
 * 直近の行動から遡り、分の1の位が一致し続ける限りカウントする。
 * 連続が無ければ（直近2回の1の位が異なれば）0 を返す。
 */
function computeNoRestStreak(w: Warlord, now: Date): number {
  const acts = w.actions;
  if (!acts || acts.length < 2) return 0;
  let streak = 1; // 末尾の行動自体を1戦目として数える
  for (let i = acts.length - 1; i > 0; i--) {
    const cur = parseActionDate(acts[i], now);
    const prev = parseActionDate(acts[i - 1], now);
    if (!cur || !prev) break;
    // 分の1の位（末尾の数字）が一致していれば「末尾固定」として継続
    if (cur.getMinutes() % 10 === prev.getMinutes() % 10) streak++;
    else break;
  }
  return streak >= 2 ? streak : 0;
}

/**
 * 末尾から連続して「ちょうど60分間隔（=休養なし）」で行動した戦数を数える。
 * 1分も休まずクールタイムぴったりで連続行動した場合のみカウントする。
 * 連続が無ければ（直近2回が60分でなければ）0 を返す。
 */
function computeStrictStreak(w: Warlord, now: Date): number {
  const acts = w.actions;
  if (!acts || acts.length < 2) return 0;
  let streak = 1; // 末尾の行動自体を1戦目として数える
  for (let i = acts.length - 1; i > 0; i--) {
    const cur = parseActionDate(acts[i], now);
    const prev = parseActionDate(acts[i - 1], now);
    if (!cur || !prev) break;
    const diff = Math.round((cur.getTime() - prev.getTime()) / 60000);
    if (diff === 60) streak++;
    else break;
  }
  return streak >= 2 ? streak : 0;
}

/** 経過分を "1時間05分" のような表記にする */
export function formatElapsed(minutes: number | null): string {
  if (minutes == null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}分`;
  return `${h}時間${String(m).padStart(2, "0")}分`;
}
