import { describe, expect, it } from "vitest";
import { buildActionAvailability } from "./actionObservation";
import type { BattleRecord } from "./types";

function battleLine({
  gameYear = 1583,
  gameMonth = 4,
  time,
  left = "信長",
  right = "勝頼",
  result,
}: {
  gameYear?: number;
  gameMonth?: number;
  time: string;
  left?: string;
  right?: string;
  result: string;
}): string {
  return (
    `【1戦目】 ${gameYear}年${gameMonth}月 ${time} 京都 ` +
    `織田 ${left} 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. ` +
    `武田 ${right} 武田家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`
  );
}

function record(
  line: string,
  term = 147,
  id = 1
): BattleRecord {
  return { id, line, term, savedAt: id };
}

describe("buildActionAvailability", () => {
  it("守備敗北を兵力減として保持する", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          time: "04/10 10:23",
          result: "信長の勝利",
        })
      ),
    ]);

    expect(availability.get("勝頼")).toMatchObject({
      term: 147,
      depletedByDefenseLoss: true,
      defenseLossAt: "04/10 10:23",
    });
  });

  it("守備敗北後の守備勝利では兵力減を解除しない", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          time: "04/10 10:23",
          result: "信長の勝利",
        }),
        147,
        1
      ),
      record(
        battleLine({
          time: "04/10 11:00",
          left: "秀吉",
          result: "勝頼の勝利",
        }),
        147,
        2
      ),
    ]);

    expect(availability.get("勝頼")?.depletedByDefenseLoss).toBe(true);
  });

  it("守備敗北後の新しい出兵で兵力減を解除する", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          time: "04/10 10:23",
          result: "信長の勝利",
        }),
        147,
        1
      ),
      record(
        battleLine({
          time: "04/10 11:00",
          left: "勝頼",
          right: "秀吉",
          result: "勝頼の勝利",
        }),
        147,
        2
      ),
    ]);

    expect(availability.get("勝頼")?.depletedByDefenseLoss).toBe(false);
  });

  it("古い守備敗北を後から登録しても新しい出兵を上書きしない", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          gameYear: 1584,
          time: "04/11 11:00",
          left: "勝頼",
          right: "秀吉",
          result: "勝頼の勝利",
        }),
        147,
        1
      ),
      record(
        battleLine({
          gameYear: 1583,
          time: "04/10 10:23",
          result: "信長の勝利",
        }),
        147,
        99
      ),
    ]);

    expect(availability.get("勝頼")?.depletedByDefenseLoss).toBe(false);
  });

  it("年末の守備敗北後に年始の出兵があれば兵力減を解除する", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          time: "12/31 23:50",
          result: "信長の勝利",
        }),
        147,
        1
      ),
      record(
        battleLine({
          time: "01/01 00:10",
          left: "勝頼",
          right: "秀吉",
          result: "勝頼の勝利",
        }),
        147,
        2
      ),
    ]);

    expect(availability.get("勝頼")?.depletedByDefenseLoss).toBe(false);
  });

  it("同時刻の出兵と守備敗北では安全側の兵力減を優先する", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          time: "04/10 10:23",
          left: "勝頼",
          right: "秀吉",
          result: "勝頼の勝利",
        }),
        147,
        1
      ),
      record(
        battleLine({
          time: "04/10 10:23",
          result: "信長の勝利",
        }),
        147,
        2
      ),
    ]);

    expect(availability.get("勝頼")?.depletedByDefenseLoss).toBe(true);
  });

  it("新しい期では前期の兵力減を持ち越さない", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          gameYear: 1700,
          time: "06/15 12:00",
          result: "信長の勝利",
        }),
        146,
        1
      ),
      record(
        battleLine({
          gameYear: 1600,
          time: "01/01 09:00",
          left: "秀吉",
          result: "勝頼の勝利",
        }),
        147,
        2
      ),
    ]);

    expect(availability.get("勝頼")).toMatchObject({
      term: 147,
      depletedByDefenseLoss: false,
    });
  });

  it("本人が新期に未登場でも全期間表示では旧期の兵力減を持ち越さない", () => {
    const availability = buildActionAvailability([
      record(
        battleLine({
          gameYear: 1700,
          time: "06/15 12:00",
          result: "信長の勝利",
        }),
        146,
        1
      ),
      record(
        battleLine({
          gameYear: 1600,
          time: "01/01 09:00",
          left: "秀吉",
          right: "家康",
          result: "家康の勝利",
        }),
        147,
        2
      ),
    ]);

    expect(availability.has("勝頼")).toBe(false);
  });

  it("改名前後を同じ代表名へ統合する", () => {
    const availability = buildActionAvailability(
      [
        record(
          battleLine({
            time: "04/10 10:23",
            right: "旧名",
            result: "信長の勝利",
          })
        ),
      ],
      { 旧名: "新名", 新名: "新名" }
    );

    expect(availability.has("旧名")).toBe(false);
    expect(availability.get("新名")?.depletedByDefenseLoss).toBe(true);
  });

  it("旧名での守備敗北後、新名で出兵すれば兵力減を解除する", () => {
    const availability = buildActionAvailability(
      [
        record(
          battleLine({
            time: "04/10 10:23",
            right: "旧名",
            result: "信長の勝利",
          }),
          147,
          1
        ),
        record(
          battleLine({
            time: "04/10 11:00",
            left: "新名",
            right: "秀吉",
            result: "新名の勝利",
          }),
          147,
          2
        ),
      ],
      { 旧名: "新名", 新名: "新名" }
    );

    expect(availability.get("新名")?.depletedByDefenseLoss).toBe(false);
  });

  it.each(["撤退", "引分", "判定不能"])(
    "%sは守備敗北として扱わない",
    (result) => {
      const availability = buildActionAvailability([
        record(battleLine({ time: "04/10 10:23", result })),
      ]);

      expect(availability.get("勝頼")?.depletedByDefenseLoss).toBe(false);
    }
  );
});
