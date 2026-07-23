import { describe, expect, it } from "vitest";
import {
  buildBattleHistoryItems,
  buildBattleSearchText,
  filterAndSortBattleHistory,
  formatGameMonthOrder,
  parseGameMonthOrder,
  type BattleHistoryFilterCriteria,
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

const NOW = new Date(2026, 6, 1, 12, 0, 0);

const DEFAULT_CRITERIA: BattleHistoryFilterCriteria = {
  keyword: "",
  faction: "",
  fromGameMonth: null,
  toGameMonth: null,
  fromDate: "",
  toDate: "",
  sortOrder: "newest",
};

function makeBattleLine({
  battleNo = 1,
  gameYear = 1601,
  gameMonth = 4,
  actionTime = "04/10 10:00",
  place = "京都",
  leftFaction = "織田",
  leftName = "信長",
  leftUnit = "騎馬隊",
  leftBranch = "騎兵",
  leftItem = "槍",
  leftWeapon = "鎧",
  rightFaction = "武田",
  rightName = "勝頼",
  rightUnit = "足軽隊",
  rightBranch = "歩兵",
  rightItem = "馬",
  rightWeapon = "旗",
  turns = 12,
}: {
  battleNo?: number;
  gameYear?: number;
  gameMonth?: number;
  actionTime?: string;
  place?: string;
  leftFaction?: string;
  leftName?: string;
  leftUnit?: string;
  leftBranch?: string;
  leftItem?: string;
  leftWeapon?: string;
  rightFaction?: string;
  rightName?: string;
  rightUnit?: string;
  rightBranch?: string;
  rightItem?: string;
  rightWeapon?: string;
  turns?: number;
} = {}): string {
  return (
    `【${battleNo}戦目】 ${gameYear}年${gameMonth}月 ${actionTime} ${place} ` +
    `${leftFaction} ${leftName} 織田家 武特 ${leftUnit} ${leftBranch} ` +
    `${leftItem} ${leftWeapon} V.S. ` +
    `${rightFaction} ${rightName} 武田家 統特 ${rightUnit} ${rightBranch} ` +
    `${rightItem} ${rightWeapon} ${leftName}の勝利 ${turns}`
  );
}

function makeRecord(
  overrides: Partial<BattleRecord> & Pick<BattleRecord, "line">
): BattleRecord {
  return {
    term: 145,
    savedAt: 1,
    ...overrides,
  };
}

function filterHistory(
  records: readonly BattleRecord[],
  criteria: Partial<BattleHistoryFilterCriteria>,
  now = NOW
) {
  return filterAndSortBattleHistory(
    buildBattleHistoryItems(records),
    { ...DEFAULT_CRITERIA, ...criteria },
    now
  );
}

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

describe("buildBattleHistoryItems", () => {
  it("battleKey が同じ場合は入力順で最初のレコードと解析結果を保持する", () => {
    const battleBody =
      "織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. " +
      "武田 勝頼 武田家 統特 足軽隊 歩兵 馬 旗";
    const firstLine = makeBattleLine({ turns: 12 }).replace(
      battleBody,
      `[${battleBody}](https://example.com/battles/first)`
    );
    const first = makeRecord({
      id: 101,
      line: firstLine,
      time: "1601年4月 04/10 10:00",
      savedAt: 100,
    });
    const duplicate = makeRecord({
      id: 202,
      line: makeBattleLine({ turns: 8 }),
      time: "1601年4月 04/10 10:00",
      savedAt: 200,
    });

    const items = buildBattleHistoryItems([first, duplicate]);

    expect(items).toHaveLength(1);
    expect(items[0].record).toBe(first);
    expect(items[0].record.id).toBe(101);
    expect(items[0].card?.turns).toBe("12");
    expect(items[0].card?.url).toBe("https://example.com/battles/first");
  });

  it("解析できない行も正規化した battleKey で重複排除し、最初の ID を保持する", () => {
    const first = makeRecord({
      id: 11,
      line: "解析できない  メモ",
      savedAt: 10,
    });
    const duplicate = makeRecord({
      id: 22,
      line: "  解析できない メモ  ",
      savedAt: 20,
    });

    const items = buildBattleHistoryItems([first, duplicate]);

    expect(items).toHaveLength(1);
    expect(items[0].record).toBe(first);
    expect(items[0].card).toBeNull();
  });
});

describe("filterAndSortBattleHistory", () => {
  it("生テキストと左右の解析語を大小文字を区別せず検索する", () => {
    const target = makeRecord({
      id: 1,
      line: makeBattleLine({
        leftFaction: "Alpha国",
        leftName: "NobuNaga",
        leftUnit: "*ノクスミーティア",
        leftBranch: "Cavalry",
        leftItem: "Ruby",
        rightFaction: "Beta国",
        rightName: "Katsuyori",
        rightWeapon: "Spear",
      }),
      time: "1601年4月 04/10 10:00",
    });
    const other = makeRecord({
      id: 2,
      line: makeBattleLine({
        place: "大阪",
        leftName: "秀吉",
        rightName: "家康",
      }),
      time: "1601年4月 04/11 10:00",
    });

    for (const keyword of [
      "  alpha国 ",
      "NOBUNAGA",
      "ノクスミーティア",
      "cavalry",
      "ruby",
      "beta国",
      "KATSUYORI",
      "spear",
    ]) {
      expect(filterHistory([target, other], { keyword }).map((x) => x.record.id)).toEqual([
        1,
      ]);
    }
  });

  it("国は出兵側・守備側のどちらでも完全一致で絞り込む", () => {
    const first = makeRecord({
      id: 1,
      line: makeBattleLine({
        leftFaction: "織田",
        rightFaction: "武田",
      }),
      time: "1601年4月 04/10 10:00",
    });
    const second = makeRecord({
      id: 2,
      line: makeBattleLine({
        place: "大阪",
        leftFaction: "上杉",
        rightFaction: "北条",
      }),
      time: "1601年4月 04/11 10:00",
    });

    expect(
      filterHistory([first, second], { faction: "織田" }).map(
        (x) => x.record.id
      )
    ).toEqual([1]);
    expect(
      filterHistory([first, second], { faction: "武田" }).map(
        (x) => x.record.id
      )
    ).toEqual([1]);
    expect(filterHistory([first, second], { faction: "武" })).toEqual([]);
  });

  it("ゲーム内年月は両端を含み、両端指定時だけ逆順を正規化する", () => {
    const records = [3, 4, 5].map((month) =>
      makeRecord({
        id: month,
        line: makeBattleLine({
          gameMonth: month,
          actionTime: `0${month}/10 10:00`,
        }),
        time: `1601年${month}月 0${month}/10 10:00`,
        savedAt: month,
      })
    );
    const march = parseGameMonthOrder("1601年3月")!;
    const april = parseGameMonthOrder("1601年4月")!;
    const may = parseGameMonthOrder("1601年5月")!;

    expect(
      filterHistory(records, {
        fromGameMonth: may,
        toGameMonth: april,
        sortOrder: "oldest",
      }).map((x) => x.record.id)
    ).toEqual([4, 5]);
    expect(
      filterHistory(records, {
        fromGameMonth: march,
        toGameMonth: may,
        sortOrder: "oldest",
      }).map((x) => x.record.id)
    ).toEqual([3, 4, 5]);
    expect(
      filterHistory(records, {
        fromGameMonth: april,
        sortOrder: "oldest",
      }).map((x) => x.record.id)
    ).toEqual([4]);
  });

  it("ゲーム内年月を取得できない行は年月フィルター時だけ除外する", () => {
    const dated = makeRecord({
      id: 1,
      line: makeBattleLine(),
      time: "1601年4月 04/10 10:00",
      savedAt: 1,
    });
    const undated = makeRecord({
      id: 2,
      line: "解析できない行",
      savedAt: 2,
    });
    const april = parseGameMonthOrder(dated.time)!;

    expect(filterHistory([dated, undated], {})).toHaveLength(2);
    expect(
      filterHistory([dated, undated], {
        fromGameMonth: april,
        toGameMonth: april,
      }).map((x) => x.record.id)
    ).toEqual([1]);
  });

  it("実日付は日全体を両端に含み、逆順を正規化しない", () => {
    const records = [
      makeRecord({
        id: 1,
        line: makeBattleLine({ actionTime: "06/10 00:00" }),
        time: "1601年4月 06/10 00:00",
      }),
      makeRecord({
        id: 2,
        line: makeBattleLine({
          place: "大阪",
          actionTime: "06/10 23:59",
        }),
        time: "1601年4月 06/10 23:59",
      }),
      makeRecord({
        id: 3,
        line: makeBattleLine({
          place: "江戸",
          actionTime: "06/11 00:00",
        }),
        time: "1601年4月 06/11 00:00",
      }),
    ];

    expect(
      filterHistory(records, {
        fromDate: "2026-06-10",
        toDate: "2026-06-10",
        sortOrder: "oldest",
      }).map((x) => x.record.id)
    ).toEqual([1, 2]);
    expect(
      filterHistory(records, {
        fromDate: "2026-06-11",
        toDate: "2026-06-10",
      })
    ).toEqual([]);
  });

  it("now を基準に年を補完し、日時なしの行は実日付フィルター時に除外する", () => {
    const previousYear = makeRecord({
      id: 1,
      line: makeBattleLine({ actionTime: "12/31 23:59" }),
      time: "1601年4月 12/31 23:59",
    });
    const undated = makeRecord({
      id: 2,
      line: "解析できない行",
      savedAt: 2,
    });
    const invalidDate = makeRecord({
      id: 3,
      line: "解析できない別の行",
      time: "日時不明",
      savedAt: 3,
    });
    const januaryNow = new Date(2026, 0, 1, 0, 30, 0);

    expect(
      filterHistory(
        [previousYear, undated, invalidDate],
        {
          fromDate: "2025-12-31",
          toDate: "2025-12-31",
        },
        januaryNow
      ).map((x) => x.record.id)
    ).toEqual([1]);
  });

  it("新旧どちらの順でも日時なしを末尾にし、同日時は savedAt で並べる", () => {
    const records = [
      makeRecord({
        id: 1,
        line: makeBattleLine({
          place: "京都",
          actionTime: "06/10 10:00",
        }),
        time: "1601年4月 06/10 10:00",
        savedAt: 100,
      }),
      makeRecord({
        id: 2,
        line: makeBattleLine({
          place: "大阪",
          actionTime: "06/10 10:00",
        }),
        time: "1601年4月 06/10 10:00",
        savedAt: 200,
      }),
      makeRecord({
        id: 3,
        line: makeBattleLine({
          place: "江戸",
          actionTime: "06/11 10:00",
        }),
        time: "1601年4月 06/11 10:00",
        savedAt: 50,
      }),
      makeRecord({
        id: 4,
        line: "日時なし A",
        savedAt: 400,
      }),
      makeRecord({
        id: 5,
        line: "日時なし B",
        savedAt: 300,
      }),
    ];

    expect(
      filterHistory(records, { sortOrder: "newest" }).map((x) => x.record.id)
    ).toEqual([3, 2, 1, 4, 5]);
    expect(
      filterHistory(records, { sortOrder: "oldest" }).map((x) => x.record.id)
    ).toEqual([1, 2, 3, 5, 4]);
  });

  it("入力配列を変更しない", () => {
    const records = [
      makeRecord({
        id: 1,
        line: makeBattleLine({ actionTime: "06/10 10:00" }),
        time: "1601年4月 06/10 10:00",
      }),
      makeRecord({
        id: 2,
        line: makeBattleLine({
          place: "大阪",
          actionTime: "06/11 10:00",
        }),
        time: "1601年4月 06/11 10:00",
      }),
    ];
    const items = buildBattleHistoryItems(records);
    const before = [...items];

    filterAndSortBattleHistory(items, DEFAULT_CRITERIA, NOW);

    expect(items).toEqual(before);
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
