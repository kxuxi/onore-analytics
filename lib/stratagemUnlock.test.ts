import { describe, expect, it } from "vitest";
import {
  computeStratagemUnlockStatus,
  groupPendingByThreshold,
  stratagemJudgeValue,
  STRATAGEM_UNLOCK_THRESHOLDS,
} from "./stratagemUnlock";

const find = (
  result: ReturnType<typeof computeStratagemUnlockStatus>,
  label: string
) => {
  const item = result.find((r) => r.label === label);
  if (!item) throw new Error(`${label} が見つかりません`);
  return item;
};

describe("stratagemJudgeValue", () => {
  it("出現判定値 = 計略P + 知力×2/3（端数切捨て）", () => {
    expect(stratagemJudgeValue(80, 20)).toBe(73); // 53.33… → 53
    expect(stratagemJudgeValue(84, 102.5)).toBe(158.5);
    expect(stratagemJudgeValue(1, 0)).toBe(0);
  });
});

describe("computeStratagemUnlockStatus", () => {
  it("すべての項目に対して結果を返す", () => {
    const result = computeStratagemUnlockStatus(0, 0);
    expect(result).toHaveLength(STRATAGEM_UNLOCK_THRESHOLDS.length);
    expect(result.map((r) => r.label)).toEqual(
      STRATAGEM_UNLOCK_THRESHOLDS.map((t) => t.label)
    );
  });

  it("計略一覧の出現判定を反映している（変更・追加分）", () => {
    const thresholdOf = (label: string) =>
      STRATAGEM_UNLOCK_THRESHOLDS.find((t) => t.label === label)?.threshold;
    expect(thresholdOf("神算鬼謀（威力系）")).toBe(250);
    expect(thresholdOf("同士討（威力系）")).toBe(300);
    expect(thresholdOf("神威赫赫（威力系）")).toBe(300);
    expect(thresholdOf("敵計略半減")).toBe(120);
    expect(thresholdOf("敵武将アタック半減")).toBe(120);
    expect(thresholdOf("敵兵種アタック半減")).toBe(120);
    expect(thresholdOf("計略効果：3つ目")).toBe(150);
  });

  it("出現判定が0の項目は最初から解放済み", () => {
    const result = computeStratagemUnlockStatus(0, 0);
    expect(find(result, "攻撃力+10%").unlocked).toBe(true);
    expect(find(result, "士気ダウン威力10").unlocked).toBe(true);
  });

  it("判定値が閾値未満なら未解放で、必要な追加ポイントを計算する", () => {
    // 知力90, 計略0 → 判定値60。先制(120)まで60不足。
    const sensei = find(computeStratagemUnlockStatus(90, 0), "計略発動条件：先制");
    expect(sensei.unlocked).toBe(false);
    expect(sensei.currentValue).toBe(60);
    expect(sensei.neededStrategy).toBe(60);
    // floor(知力×2/3) ≧ 120 には知力180が必要 → +90。
    expect(sensei.neededIntelligence).toBe(90);
  });

  it("知力の端数切捨てを踏まえて必要知力を求める", () => {
    // 知力84・計略102.5 → 判定値158.5。160には floor(知力×2/3) ≧ 58 → 知力87 → +3。
    const item = find(
      computeStratagemUnlockStatus(84, 102.5),
      "両者武将アタック封印"
    );
    expect(item.neededStrategy).toBe(2);
    expect(item.neededIntelligence).toBe(3);
  });

  it("判定値がちょうど閾値なら解放済みとする（≧判定）", () => {
    const sensei = find(computeStratagemUnlockStatus(0, 120), "計略発動条件：先制");
    expect(sensei.unlocked).toBe(true);
    expect(sensei.neededStrategy).toBe(0);
    expect(sensei.neededIntelligence).toBe(0);
  });

  it("判定値が最大の閾値を超えていればすべて解放済み", () => {
    const result = computeStratagemUnlockStatus(300, 300);
    expect(result.every((r) => r.unlocked)).toBe(true);
  });
});

describe("groupPendingByThreshold", () => {
  it("未解放の項目を閾値ごとにまとめ、低い順に返す", () => {
    const tiers = groupPendingByThreshold(computeStratagemUnlockStatus(84, 102.5));
    expect(tiers[0].threshold).toBe(160);
    expect(tiers[0].items.map((i) => i.label)).toEqual([
      "攻守向上+30%",
      "兵回復 中",
      "万能将軍+5%",
      "両者武将アタック封印",
      "両者兵種アタック封印",
    ]);
    expect(tiers[1].threshold).toBe(180);
    expect(tiers.every((t, i) => i === 0 || tiers[i - 1].threshold < t.threshold)).toBe(true);
  });

  it("すべて解放済みなら空配列", () => {
    expect(groupPendingByThreshold(computeStratagemUnlockStatus(300, 300))).toEqual([]);
  });
});
