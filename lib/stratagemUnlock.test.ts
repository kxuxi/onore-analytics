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
    // 知力90, 計略0 → 判定値 = 90*2/3 = 60。先制(120)まで60不足。
    const result = computeStratagemUnlockStatus(90, 0);
    const sensei = result.find((r) => r.label === "計略発動条件：先制")!;
    expect(sensei.unlocked).toBe(false);
    expect(sensei.currentValue).toBeCloseTo(60);
    // 計略Pだけで埋めるなら +60。
    expect(sensei.neededStrategy).toBe(60);
    // 知力だけで埋めるなら 60 / (2/3) = 90 → 知力90+90=180で判定値120。
    expect(sensei.neededIntelligence).toBe(90);
  });

  it("判定値がちょうど閾値なら解放済みとする（≧判定）", () => {
    // 知力0, 計略120 → 判定値120 = 先制の閾値。
    const result = computeStratagemUnlockStatus(0, 120);
    const sensei = result.find((r) => r.label === "計略発動条件：先制")!;
    expect(sensei.unlocked).toBe(true);
    expect(sensei.neededStrategy).toBe(0);
    expect(sensei.neededIntelligence).toBe(0);
  });

  it("判定値が閾値を超えていれば解放済みとする", () => {
    const result = computeStratagemUnlockStatus(300, 300);
    expect(result.every((r) => r.unlocked)).toBe(true);
    expect(result.every((r) => r.neededStrategy === 0)).toBe(true);
  });

  it("小数の判定値でも必要ポイントを切り上げで返す（不足分をきっちり埋められる値にする）", () => {
    // 知力61, 計略0 → 判定値 = 61*2/3 = 40.666... 発動率ボーナス+12%(300)まで259.333...不足。
    const result = computeStratagemUnlockStatus(61, 0);
    const bonus300 = result.find((r) => r.label === "発動率ボーナス：12%")!;
    expect(bonus300.unlocked).toBe(false);
    expect(bonus300.neededStrategy).toBe(260); // ceil(259.33...)
  });

  it("同じ閾値に複数の効果がある場合はすべて含む", () => {
    const result = computeStratagemUnlockStatus(0, 0);
    const at120 = result.filter((r) => r.threshold === 120);
    expect(at120.map((r) => r.label)).toEqual([
      "計略発動条件：先制",
      "武将アタック+10%",
      "兵種アタック+10%",
      "敵〇〇アタック（計略）半減",
    ]);
    const at150 = result.filter((r) => r.threshold === 150);
    expect(at150.map((r) => r.label)).toEqual([
      "敵計略封印",
      "計略発動タイミング：２枠",
      "計略効果：２枠",
    ]);
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
    const at230 = result.filter((r) => r.threshold === 230);
    expect(at230.map((r) => r.label)).toEqual([
      "激励（士気回復系）",
      "乱戦（封印系）",
      "神算鬼謀",
    ]);
    const at280 = result.filter((r) => r.threshold === 280);
    expect(at280.map((r) => r.label)).toEqual(["同士討（威力系）"]);
  });
});
