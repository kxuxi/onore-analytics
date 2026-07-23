import { describe, expect, it } from "vitest";
import {
  buildBattleSearchText,
  formatGameMonthOrder,
  parseGameMonthOrder,
} from "./historyFilters";
import { parseBattleCard } from "./parser";
import type { BattleRecord } from "./types";

const line =
  "【1戦目】 1601年4月 04/10 10:00 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 足軽隊 歩兵 馬 旗 信長の勝利 12";
const record: BattleRecord = {
  line,
  time: "1601年4月 04/10 10:00",
  term: 145,
  savedAt: 1,
};

describe("buildBattleSearchText", () => {
  it("生テキストと解析後の表示語を小文字化して検索対象にする", () => {
    const text = buildBattleSearchText(record, parseBattleCard(line));
    expect(text).toContain("信長");
    expect(text).toContain("武田");
    expect(text).toContain("騎兵");
  });

  it("解析できない場合も生テキストを保持する", () => {
    expect(buildBattleSearchText(record, null)).toBe(line.toLowerCase());
  });
});

describe("ゲーム内年月", () => {
  it("年月を並び替え可能な値へ変換し、同じ表示へ戻す", () => {
    const order = parseGameMonthOrder("1601年4月 04/10 10:00");
    expect(order).not.toBeNull();
    expect(formatGameMonthOrder(order!)).toBe("1601年4月");
  });

  it("年月を取得できない場合は null", () => {
    expect(parseGameMonthOrder(undefined)).toBeNull();
    expect(parseGameMonthOrder("04/10 10:00")).toBeNull();
  });
});
