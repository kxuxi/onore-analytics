import type { CityMap } from "./cityMap";

export interface MerchantSettings {
  year: number;
  month: number;
}

export interface MerchantPosition {
  merchant: 1 | 2;
  rowIndex: number;
  columnIndex: number;
  rowLabel: string;
  columnLabel: string;
  city: string;
}

interface GameMonth {
  year: number;
  month: number;
}

export interface MerchantPrediction {
  status: "active" | "cinderella" | "before-start" | "after-end" | "no-cities";
  positions: MerchantPosition[];
  nextMove: GameMonth | null;
  stayUntil: GameMonth | null;
}

export const MERCHANT_START_YEAR = 1612;
export const MERCHANT_LAST_YEAR = 1719;
export const MERCHANT_STAY_MONTHS = 6;

// 1612年1月は20:00。1か月20分で進み、6年で実時間の1日になる。
// 各周期の翌年1月〜翌々年12月（00:00〜07:59）は出現・移動しない。
const DAY_MONTHS = 6 * 12;
const CINDERELLA_START_MONTH = 12;
const CINDERELLA_END_MONTH = 3 * 12;
const CINDERELLA_MONTHS = CINDERELLA_END_MONTH - CINDERELLA_START_MONTH;

/** 入力中の空欄、範囲外、文字列の数値を保存・計算へ渡さない。 */
export function parseMerchantSettings(value: unknown): MerchantSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("行商人の確認年月を指定してください。");
  }
  const { year, month } = value as Record<string, unknown>;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("年は1〜9999の整数で入力してください。");
  }
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("月は1〜12の整数で指定してください。");
  }
  // 以前保存された確認時刻が含まれていても、年月だけを読み出す。
  return { year, month };
}

/** 貼り付け時点の行商マーク。都市そのものや他の注記とは分ける。 */
export function isMerchantNote(note: string): boolean {
  return /^[★☆]\s*行商(?:人)?\s*$/.test(note.trim());
}

function cityName(cell: string): string {
  const name = cell.split("\n")[0].trim();
  return isMerchantNote(name) ? "" : name;
}

function gameMonth(order: number): GameMonth {
  return { year: Math.floor(order / 12), month: order % 12 + 1 };
}

function afterCinderella(elapsedMonths: number): number {
  const monthOfDay = elapsedMonths % DAY_MONTHS;
  return monthOfDay >= CINDERELLA_START_MONTH && monthOfDay < CINDERELLA_END_MONTH
    ? elapsedMonths + CINDERELLA_END_MONTH - monthOfDay
    : elapsedMonths;
}

/**
 * 両者とも都市のあるマスを左→右、上→下へ巡り、末尾から先頭へ戻る。
 * 2人目は全都市数の半分だけ先から開始する。
 * 公開ログの1612年1月はア・コルニャとパルマ（44都市の0番目・22番目）。
 * https://onore.servegame.com/game/sangoku/map.cgi?page=136
 * 実際の時計時刻は使わず、指定されたゲーム内年月だけから位置を求める。
 */
export function predictMerchants(map: CityMap, value: MerchantSettings): MerchantPrediction {
  const settings = parseMerchantSettings(value);
  const absent = (status: MerchantPrediction["status"]): MerchantPrediction => ({
    status,
    positions: [],
    nextMove: null,
    stayUntil: null,
  });
  const monthOrder = settings.year * 12 + settings.month - 1;
  const firstMonth = MERCHANT_START_YEAR * 12;
  // 最後の出現開始は1719年7月。6か月滞在し、1720年1月から出現しない。
  const lastMonth = (MERCHANT_LAST_YEAR + 1) * 12 - 1;
  if (monthOrder < firstMonth) return absent("before-start");
  if (monthOrder > lastMonth) return absent("after-end");

  const route: Omit<MerchantPosition, "merchant">[] = [];
  map.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      const city = cityName(cell);
      if (!city) return;
      route.push({
        rowIndex,
        columnIndex,
        rowLabel: row.label,
        columnLabel: map.columns[columnIndex],
        city,
      });
    });
  });
  if (!route.length) return absent("no-cities");

  const elapsedMonths = monthOrder - firstMonth;
  const appearanceMonth = firstMonth + afterCinderella(elapsedMonths);
  if (appearanceMonth !== monthOrder) {
    return {
      ...absent("cinderella"),
      nextMove: appearanceMonth <= lastMonth ? gameMonth(appearanceMonth) : null,
    };
  }

  const skippedMonths = Math.floor(elapsedMonths / DAY_MONTHS) * CINDERELLA_MONTHS
    + Math.min(Math.max(elapsedMonths % DAY_MONTHS - CINDERELLA_START_MONTH, 0), CINDERELLA_MONTHS);
  const step = Math.floor((elapsedMonths - skippedMonths) / MERCHANT_STAY_MONTHS);
  const stayEnd = (Math.floor(elapsedMonths / MERCHANT_STAY_MONTHS) + 1) * MERCHANT_STAY_MONTHS;
  const nextMonth = firstMonth + afterCinderella(stayEnd);
  const schedule = {
    nextMove: nextMonth <= lastMonth ? gameMonth(nextMonth) : null,
    stayUntil: gameMonth(firstMonth + stayEnd - 1),
  };
  const secondStart = Math.floor(route.length / 2);
  const positions: MerchantPosition[] = [
    { ...route[step % route.length], merchant: 1 },
    { ...route[(secondStart + step) % route.length], merchant: 2 },
  ];
  return { status: "active", positions, ...schedule };
}
