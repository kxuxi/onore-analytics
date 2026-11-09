import { describe, expect, it } from "vitest";
import { metaUnitUsage } from "./stats";
import type { BattleRecord } from "./types";

/** 左が勝つか右が勝つかを指定して1戦ぶんの行を作る（壁戦ではない通常戦）。 */
function line(o: {
  left: string;
  leftUnit: string;
  leftType?: string;
  right: string;
  rightUnit: string;
  winner: "left" | "right";
  minute: number;
}): string {
  const result = o.winner === "left" ? `${o.left}の勝利` : `${o.right}の勝利`;
  const mm = String(o.minute % 60).padStart(2, "0");
  const hh = String(10 + Math.floor(o.minute / 60)).padStart(2, "0");
  return (
    `【1戦目】 1600年4月 04/10 ${hh}:${mm} 京都 ` +
    `東軍 ${o.left} ${o.left}家 ${o.leftType ?? "武特"} ${o.leftUnit} 騎兵 槍 鎧 V.S. ` +
    `西軍 ${o.right} ${o.right}家 統特 ${o.rightUnit} 弓兵 弓 旗 ${result} 12`
  );
}

let seq = 0;
function rec(l: string): BattleRecord {
  seq++;
  return { id: seq, line: l, time: undefined, term: 1, savedAt: seq };
}

describe("metaUnitUsage", () => {
  // 上手な「名人」は普段（騎馬隊以外）10戦10勝。弱兵では 7勝3敗。
  // 「凡人」は普段 5勝5敗、弱兵では 2勝8敗。
  const log: BattleRecord[] = [];
  let m = 0;
  const push = (
    left: string,
    leftUnit: string,
    win: boolean,
    leftType?: string,
  ) =>
    log.push(
      rec(
        line({
          left,
          leftUnit,
          leftType,
          right: `相手${m}`,
          rightUnit: "相手兵",
          winner: win ? "left" : "right",
          minute: m++,
        }),
      ),
    );
  for (let i = 0; i < 10; i++) push("名人", "騎馬隊", true);
  for (let i = 0; i < 10; i++) push("名人", "弱兵", i < 7);
  for (let i = 0; i < 10; i++) push("凡人", "騎馬隊", i < 5);
  for (let i = 0; i < 10; i++) push("凡人", "弱兵", i < 2);

  it("兵種ごとに使い手と戦績を集計する", () => {
    const u = metaUnitUsage(log).get("弱兵")!;
    expect(u.userCount).toBe(2);
    const meijin = u.users.find((x) => x.name === "名人")!;
    expect(meijin).toMatchObject({ wins: 7, losses: 3, baselineDecided: 10 });
    // 普段 10勝0敗を 50% 6戦ぶんで縮める: (10+3)/(10+6)。
    expect(meijin.baselineRate).toBeCloseTo(13 / 16);
  });

  it("勝率が普段より低ければ lift はマイナス（使い手の力）", () => {
    const u = metaUnitUsage(log).get("弱兵")!;
    // 弱兵の勝率 9/20=45%。期待勝率 = (13/16 + 8/16)/2 ≒ 65.6%。
    expect(u.expectedRate).toBeCloseTo((13 / 16 + 8 / 16) / 2);
    expect(u.lift!).toBeLessThan(-0.05);
  });

  it("相手側（右）の兵種も集計に含める", () => {
    const u = metaUnitUsage(log).get("相手兵")!;
    expect(u.userCount).toBe(40);
  });

  it("タイプで絞ると、そのタイプで戦った分だけを集計する（普段の勝率は全体から）", () => {
    const typed: BattleRecord[] = [
      ...log,
      rec(
        line({
          left: "名人",
          leftUnit: "弱兵",
          leftType: "知特",
          right: "x",
          rightUnit: "y",
          winner: "left",
          minute: 500,
        }),
      ),
    ];
    const u = metaUnitUsage(typed, undefined, "知特").get("弱兵")!;
    expect(u.users).toHaveLength(1);
    expect(u.users[0]).toMatchObject({ name: "名人", wins: 1, battles: 1 });
    // 弱兵での全11戦を除いた 10戦10勝が普段。
    expect(u.users[0].baselineDecided).toBe(10);
  });
});
