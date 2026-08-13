import { describe, expect, it } from "vitest";
import {
  computeStratagemUnlockStatus,
  STRATAGEM_UNLOCK_THRESHOLDS,
} from "./stratagemUnlock";

describe("computeStratagemUnlockStatus", () => {
  it("すべての閾値に対して結果を返す", () => {
    const result = computeStratagemUnlockStatus(0, 0);
    expect(result).toHaveLength(STRATAGEM_UNLOCK_THRESHOLDS.length);
    expect(result.map((r) => r.label)).toEqual(
      STRATAGEM_UNLOCK_THRESHOLDS.map((t) => t.label)
    );
  });

  it("判定値が閾値未満なら未解放で、必要な追加ポイントを計算する", () => {
    // 知力90, 計略0 → 判定値 = 90*2/3 = 60。先制計略(120)まで60不足。
    const result = computeStratagemUnlockStatus(90, 0);
    const senseiKeiryaku = result.find((r) => r.label === "先制計略")!;
    expect(senseiKeiryaku.unlocked).toBe(false);
    expect(senseiKeiryaku.currentValue).toBeCloseTo(60);
    // 計略Pだけで埋めるなら +60。
    expect(senseiKeiryaku.neededStrategy).toBe(60);
    // 知力だけで埋めるなら 60 / (2/3) = 90 → 知力90+90=180で判定値120。
    expect(senseiKeiryaku.neededIntelligence).toBe(90);
  });

  it("判定値がちょうど閾値なら解放済みとする（≧判定）", () => {
    // 知力0, 計略120 → 判定値120 = 先制計略の閾値。
    const result = computeStratagemUnlockStatus(0, 120);
    const senseiKeiryaku = result.find((r) => r.label === "先制計略")!;
    expect(senseiKeiryaku.unlocked).toBe(true);
    expect(senseiKeiryaku.neededStrategy).toBe(0);
    expect(senseiKeiryaku.neededIntelligence).toBe(0);
  });

  it("判定値が閾値を超えていれば解放済みとする", () => {
    const result = computeStratagemUnlockStatus(300, 300);
    expect(result.every((r) => r.unlocked)).toBe(true);
    expect(result.every((r) => r.neededStrategy === 0)).toBe(true);
  });

  it("小数の判定値でも必要ポイントを切り上げで返す（不足分をきっちり埋められる値にする）", () => {
    // 知力61, 計略0 → 判定値 = 61*2/3 = 40.666... 神算鬼謀(230)まで189.333...不足。
    const result = computeStratagemUnlockStatus(61, 0);
    const shinsanKibou = result.find((r) => r.label === "神算鬼謀")!;
    expect(shinsanKibou.unlocked).toBe(false);
    expect(shinsanKibou.neededStrategy).toBe(190); // ceil(189.33...)
  });

  it("同じ閾値の項目（両者武将/兵種アタック封印、敵武将/兵種アタック封印）も両方含む", () => {
    const result = computeStratagemUnlockStatus(0, 0);
    const at160 = result.filter((r) => r.threshold === 160);
    expect(at160.map((r) => r.label)).toEqual([
      "両者武将アタック封印",
      "両者兵種アタック封印",
    ]);
    const at180 = result.filter((r) => r.threshold === 180);
    expect(at180.map((r) => r.label)).toEqual([
      "敵武将アタック封印",
      "敵兵種アタック封印",
    ]);
  });
});
