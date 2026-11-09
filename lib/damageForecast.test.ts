import { describe, expect, it } from "vitest";
import { getActionInfo } from "./action";
import {
  buildLastTargets,
  computeForecast,
  floorToSlot,
  formatClock,
  hourlyActivity,
  latestImportedAt,
} from "./damageForecast";
import type { BattleRecord, Warlord } from "./types";

const warlord = (actions: string[]): Warlord => ({
  name: "武将",
  type: "武特",
  branch: "騎兵",
  updatedAt: 0,
  actions,
  lastActionAt: actions[actions.length - 1],
});

describe("computeForecast", () => {
  it("固定行動が無ければ、出兵可能になる時刻（+40分）を来うる時刻にする", () => {
    const now = new Date(2026, 6, 25, 20, 10);
    const info = getActionInfo(warlord(["07/25 20:00"]), now);
    const f = computeForecast(info, now);
    expect(formatClock(f.readyAt!)).toBe("20:40");
    expect(f.predictedAt).toBeNull();
    expect(formatClock(f.expectedAt!)).toBe("20:40");
  });

  it("クールタイムが明けていれば、来うる時刻は now", () => {
    const now = new Date(2026, 6, 25, 21, 0);
    const info = getActionInfo(warlord(["07/25 20:00"]), now);
    const f = computeForecast(info, now);
    expect(f.expectedAt!.getTime()).toBe(now.getTime());
  });

  it("休養なし（60分間隔）は次の時刻をちょうどで予測する", () => {
    const now = new Date(2026, 6, 25, 21, 10);
    const info = getActionInfo(
      warlord(["07/25 19:05", "07/25 20:05", "07/25 21:05"]),
      now
    );
    expect(info.noRestLabel).toBe("休養なし");
    const f = computeForecast(info, now);
    expect(formatClock(f.predictedAt!)).toBe("22:05");
    expect(f.predictedSpread).toBe(0);
    expect(f.fixedDigit).toBe(5);
    expect(f.expectedAt).toEqual(f.predictedAt);
  });

  it("末尾固定は±10分の幅を持たせ、過ぎた予測は次の周期へ繰り延べる", () => {
    // 末尾固定（1の位が5）で最終 20:45。21:50 時点なら次は 22:45。
    const now = new Date(2026, 6, 25, 21, 55);
    const info = getActionInfo(warlord(["07/25 19:55", "07/25 20:45"]), now);
    expect(info.noRestLabel).toBe("末尾固定");
    const f = computeForecast(info, now);
    expect(formatClock(f.predictedAt!)).toBe("22:45");
    expect(f.predictedSpread).toBe(10);
    // 並び替えは幅の開始（最も早く来うる時刻）を基準にする。
    expect(formatClock(f.expectedAt!)).toBe("22:35");
  });

  it("予測時刻を少し過ぎただけなら同じ予測を保つ", () => {
    const now = new Date(2026, 6, 25, 22, 8);
    const info = getActionInfo(
      warlord(["07/25 20:05", "07/25 21:05"]),
      now
    );
    expect(formatClock(computeForecast(info, now).predictedAt!)).toBe("22:05");
  });

  it("兵力減（守備敗北）からは出兵時刻を予測しない", () => {
    const now = new Date(2026, 6, 25, 21, 10);
    const info = getActionInfo(
      warlord(["07/25 19:05", "07/25 20:05"]),
      now,
      { depletedByDefenseLoss: true, defenseLossAt: "07/25 21:00" }
    );
    const f = computeForecast(info, now);
    expect(info.status).toBe("depleted");
    expect(f.predictedAt).toBeNull();
    expect(formatClock(f.readyAt!)).toBe("21:40");
  });

  it("観測時刻が無ければすべて null", () => {
    const now = new Date(2026, 6, 25, 21, 10);
    const f = computeForecast(getActionInfo(warlord([]), now), now);
    expect(f.expectedAt).toBeNull();
  });
});

describe("hourlyActivity / floorToSlot", () => {
  it("時ごとの観測件数を数える（重複は1件）", () => {
    const now = new Date(2026, 6, 25, 23, 0);
    const counts = hourlyActivity(
      ["07/25 21:05", "07/25 21:45", "07/24 21:05", "07/25 09:00", "07/25 21:05"],
      now
    );
    expect(counts[21]).toBe(3);
    expect(counts[9]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("10分単位に切り捨てる", () => {
    expect(formatClock(floorToSlot(new Date(2026, 6, 25, 20, 47, 30)))).toBe(
      "20:40"
    );
  });
});

describe("buildLastTargets", () => {
  const log: BattleRecord[] = [
    {
      id: 1,
      term: 147,
      savedAt: 1000,
      line:
        "【1戦目】 1583年4月 07/25 20:00 京都 " +
        "東軍 攻め手 攻め家 武特 騎馬隊 騎兵 槍 鎧 V.S. " +
        "西軍 守り手 守り家 知特 弓兵隊 弓兵 弓 旗 攻め手の勝利 5\n" +
        "【壁戦】 1583年4月 07/25 20:28 大坂 " +
        "東軍 壁攻め 壁家 統特 歩兵隊 歩兵 刀 盾 V.S. " +
        "西軍 大坂の守備隊 精鋭城壁兵 壁 なし なし 大坂の守備隊の勝利 6",
    },
    {
      id: 2,
      term: 147,
      savedAt: 3000,
      line:
        "【1戦目】 1583年5月 07/25 21:00 堺 " +
        "東軍 攻め手 攻め家 武特 騎馬隊 騎兵 槍 鎧 V.S. " +
        "南軍 別の守り 別家 知特 弓兵隊 弓兵 弓 旗 別の守りの勝利 5",
    },
  ];

  it("武将ごとに最新の出兵先（都市・守備側の国）を返す", () => {
    const targets = buildLastTargets(log);
    expect(targets.get("攻め手")).toMatchObject({
      at: "07/25 21:00",
      place: "堺",
      defenderName: "別の守り",
      defenderFaction: "南軍",
      wall: false,
    });
    expect(targets.get("壁攻め")).toMatchObject({
      at: "07/25 20:28",
      place: "大坂",
      defenderFaction: "西軍",
      wall: true,
    });
    // 守備側は出兵先を持たない。
    expect(targets.has("守り手")).toBe(false);
  });

  it("最終取り込み時刻は savedAt の最大値", () => {
    expect(latestImportedAt(log)).toBe(3000);
    expect(latestImportedAt([])).toBeNull();
  });
});
