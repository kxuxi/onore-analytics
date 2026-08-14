import { describe, expect, it } from "vitest";
import {
  computeConscriptionSecurityDecrease,
  CONSCRIPTION_POLITICS_ITEMS,
} from "./conscriptionSecurity";

describe("computeConscriptionSecurityDecrease", () => {
  it("徴兵数 ÷ (政治×2) + 1 を返す", () => {
    // 1000 / (50*2) + 1 = 11
    expect(computeConscriptionSecurityDecrease(1000, 50)).toBe(11);
  });

  it("徴兵数が少なくても +1 される", () => {
    // 10 / (100*2) + 1 = 1.05
    expect(computeConscriptionSecurityDecrease(10, 100)).toBeCloseTo(1.05);
  });

  it("政治力が0以下なら計算不能としてnullを返す", () => {
    expect(computeConscriptionSecurityDecrease(1000, 0)).toBeNull();
    expect(computeConscriptionSecurityDecrease(1000, -10)).toBeNull();
  });

  it("小数の結果もそのまま返す", () => {
    // 1000 / (300*2) + 1 = 2.666...
    expect(computeConscriptionSecurityDecrease(1000, 300)).toBeCloseTo(
      2.6666,
      3
    );
  });
});

describe("CONSCRIPTION_POLITICS_ITEMS", () => {
  it("「なし」が加算0で先頭にある", () => {
    expect(CONSCRIPTION_POLITICS_ITEMS[0]).toMatchObject({
      name: "なし",
      politicsBonus: 0,
    });
  });

  it("東雲ドーナツが最大の政治力ボーナス(+300)を持つ", () => {
    const donut = CONSCRIPTION_POLITICS_ITEMS.find(
      (i) => i.name === "東雲ドーナツ"
    )!;
    expect(donut.politicsBonus).toBe(300);
  });
});
