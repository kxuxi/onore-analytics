import { parseActionDate } from "./action";
import {
  battleKey,
  normalizeDisplayToken,
  parseBattleCard,
  type BattleCard,
} from "./parser";
import type { BattleRecord } from "./types";

export interface BattleHistoryItem {
  record: BattleRecord;
  card: BattleCard | null;
  search: string;
}

export interface BattleHistoryFilterCriteria {
  keyword: string;
  faction: string;
  fromGameMonth: number | null;
  toGameMonth: number | null;
  fromDate: string;
  toDate: string;
  sortOrder: "newest" | "oldest";
}

type CachedBattleHistoryItem = {
  line: string;
  key: string;
  item: BattleHistoryItem;
};

// 登録後は大半の BattleRecord オブジェクトがそのまま残るため、解析結果も再利用する。
// WeakMap なので、履歴から外れたレコードをメモリに保持し続けない。
const battleHistoryItemCache = new WeakMap<
  BattleRecord,
  CachedBattleHistoryItem
>();

function cachedBattleHistoryItem(
  record: BattleRecord
): CachedBattleHistoryItem {
  const cached = battleHistoryItemCache.get(record);
  if (cached?.line === record.line) return cached;

  const card = parseBattleCard(record.line);
  const result = {
    line: record.line,
    key: battleKey(record.line),
    item: {
      record,
      card,
      search: buildBattleSearchText(record, card),
    },
  };
  battleHistoryItemCache.set(record, result);
  return result;
}

function sameBattleRecord(
  left: BattleRecord,
  right: BattleRecord
): boolean {
  return (
    left.id === right.id &&
    left.line === right.line &&
    left.time === right.time &&
    left.term === right.term &&
    left.savedAt === right.savedAt
  );
}

/**
 * サーバーから返された1期分の完全な履歴で、その期だけを置き換える。
 * 値が変わらないレコードは参照を維持し、表示用解析キャッシュを再利用する。
 */
export function replaceBattleRecordsForTerm(
  current: readonly BattleRecord[],
  term: number,
  termRecords: readonly BattleRecord[]
): BattleRecord[] {
  const previousTermRecords = new Map<number, BattleRecord>();
  const recordsFromOtherTerms: BattleRecord[] = [];

  for (const record of current) {
    if (record.term !== term) {
      recordsFromOtherTerms.push(record);
    } else if (record.id != null) {
      previousTermRecords.set(record.id, record);
    }
  }

  const nextTermRecords = termRecords.map((record) => {
    if (record.id == null) return record;
    const previous = previousTermRecords.get(record.id);
    return previous && sameBattleRecord(previous, record) ? previous : record;
  });

  return [...recordsFromOtherTerms, ...nextTermRecords].sort(
    (left, right) =>
      (left.id ?? Number.MAX_SAFE_INTEGER) -
      (right.id ?? Number.MAX_SAFE_INTEGER)
  );
}

export function buildBattleSearchText(
  record: BattleRecord,
  card: BattleCard | null
): string {
  const searchableParts: string[] = [record.line];
  if (card) {
    for (const side of [card.left, card.right]) {
      if (side.name) searchableParts.push(side.name);
      if (side.faction) searchableParts.push(side.faction);
      if (side.branch) searchableParts.push(side.branch);
      if (side.unit) searchableParts.push(normalizeDisplayToken(side.unit));
      for (const equipment of side.equips) {
        searchableParts.push(normalizeDisplayToken(equipment));
      }
    }
  }
  return searchableParts.join(" ").toLowerCase();
}

export function parseGameMonthOrder(
  time: string | undefined
): number | null {
  if (!time) return null;
  const match = time.match(/(\d+)\s*年\s*(\d+)\s*月/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

export function formatGameMonthOrder(order: number): string {
  const month = ((order - 1) % 12) + 1;
  const year = Math.floor((order - 1) / 12);
  return `${year}年${month}月`;
}

/**
 * 履歴を表示用に解析し、同一戦闘を除外する。
 * 重複時は ID や URL を含め、入力順で最初のレコードを保持する。
 */
export function buildBattleHistoryItems(
  log: readonly BattleRecord[]
): BattleHistoryItem[] {
  const seenBattleKeys = new Set<string>();
  const items: BattleHistoryItem[] = [];

  for (const record of log) {
    const cached = cachedBattleHistoryItem(record);
    const { key } = cached;
    if (key && seenBattleKeys.has(key)) continue;
    if (key) seenBattleKeys.add(key);

    items.push(cached.item);
  }

  return items;
}

/**
 * 履歴一覧の検索・期間絞り込み・日時順ソートを行う。
 * `now` は年を持たない実日時の解釈を呼び出しごとに固定するために受け取る。
 */
export function filterAndSortBattleHistory(
  items: readonly BattleHistoryItem[],
  criteria: Readonly<BattleHistoryFilterCriteria>,
  now: Date
): BattleHistoryItem[] {
  const keyword = criteria.keyword.trim().toLowerCase();

  // 両端が指定された場合のみ、逆順でも範囲として扱う。
  // 片端のみの場合は従来どおり、その年月だけに絞り込む。
  const gameMonthLower =
    criteria.fromGameMonth != null && criteria.toGameMonth != null
      ? Math.min(criteria.fromGameMonth, criteria.toGameMonth)
      : criteria.fromGameMonth ?? criteria.toGameMonth;
  const gameMonthUpper =
    criteria.fromGameMonth != null && criteria.toGameMonth != null
      ? Math.max(criteria.fromGameMonth, criteria.toGameMonth)
      : criteria.fromGameMonth ?? criteria.toGameMonth;

  // 実日付は入力された開始・終了の向きを維持する。
  const dateLower = criteria.fromDate
    ? new Date(`${criteria.fromDate}T00:00:00`).getTime()
    : null;
  const dateUpper = criteria.toDate
    ? new Date(`${criteria.toDate}T23:59:59`).getTime()
    : null;

  const filteredItems = items.filter(({ record, card, search }) => {
    if (keyword && !search.includes(keyword)) return false;

    if (
      criteria.faction &&
      card?.left.faction !== criteria.faction &&
      card?.right.faction !== criteria.faction
    ) {
      return false;
    }

    if (gameMonthLower != null || gameMonthUpper != null) {
      const gameMonth = parseGameMonthOrder(record.time);
      if (gameMonth == null) return false;
      if (gameMonthLower != null && gameMonth < gameMonthLower) return false;
      if (gameMonthUpper != null && gameMonth > gameMonthUpper) return false;
    }

    if (dateLower != null || dateUpper != null) {
      const actionTime = parseActionDate(record.time, now)?.getTime() ?? null;
      if (actionTime == null) return false;
      if (dateLower != null && actionTime < dateLower) return false;
      if (dateUpper != null && actionTime > dateUpper) return false;
    }

    return true;
  });

  const direction = criteria.sortOrder === "newest" ? 1 : -1;
  const actionTimeOf = (record: BattleRecord) =>
    parseActionDate(record.time, now)?.getTime() ?? null;

  return [...filteredItems].sort((left, right) => {
    const leftTime = actionTimeOf(left.record);
    const rightTime = actionTimeOf(right.record);

    if (leftTime != null && rightTime != null) {
      if (rightTime !== leftTime) {
        return (rightTime - leftTime) * direction;
      }
      return (right.record.savedAt - left.record.savedAt) * direction;
    }
    if (leftTime != null) return -1;
    if (rightTime != null) return 1;
    return (right.record.savedAt - left.record.savedAt) * direction;
  });
}
