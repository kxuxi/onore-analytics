import { describe, expect, it } from "vitest";
import {
  getEquipmentStatEffect,
  parseEquipmentBattleBonuses,
} from "./equipmentStats";

describe("getEquipmentStatEffect", () => {
  it("戦闘時・常時の複数能力補正を取得する", () => {
    expect(getEquipmentStatEffect("伊達秘鑑")?.bonuses).toEqual({
      power: 20, intelligence: 20, leadership: 20,
    });
    expect(getEquipmentStatEffect("孟徳新書")?.bonuses).toEqual({
      intelligence: 20, leadership: 20,
    });
    expect(getEquipmentStatEffect("土佐物語")?.bonuses).toEqual({
      politics: 20, leadership: 20,
    });
  });

  it("神龍の個人補正を使い、国宝の発動率や士気・訓練度を加算しない", () => {
    expect(getEquipmentStatEffect("神龍の護符")?.bonuses).toEqual({ leadership: 50 });
    expect(getEquipmentStatEffect("西楚の覇王")?.bonuses).toEqual({
      power: 30, leadership: 30,
    });
    expect(getEquipmentStatEffect("諸葛亮の白羽扇")?.bonuses).toEqual({
      politics: 50, intelligence: 50,
    });
  });

  it.each(["金の兜", "軍配団扇", "百翼戦旗", "聖母マリア像"])(
    "%s は能力補正なしと確認できる",
    (name) => expect(getEquipmentStatEffect(name)?.bonuses).toEqual({})
  );

  it.each(["内政の指南書", "越後流軍学書", "訓練の指南書", "信長公記"])(
    "%s の内政・徴兵等限定の補正を戦闘へ持ち込まない",
    (name) => expect(getEquipmentStatEffect(name)?.bonuses).toEqual({})
  );

  it("未確認の品物や呪いを補正なしと認定しない", () => {
    expect(getEquipmentStatEffect("未確認の呪い")).toBeNull();
    expect(getEquipmentStatEffect("バーおもち会員証")).toBeNull();
    expect(getEquipmentStatEffect("")).toBeNull();
  });

  it("幅と前後の空白を正規化し、参照元を返す", () => {
    expect(getEquipmentStatEffect(" アイスティー(?)　")).toMatchObject({
      bonuses: {},
      sourceUrl: "https://onore.servegame.com/game/sangoku/manual_data_table.cgi?mode=treasure",
    });
    expect(getEquipmentStatEffect(" 金の腕輪 ")?.bonuses).toEqual({ power: 30 });
  });

  it("呼び出し側の変更が次の武将の補正に影響しない", () => {
    const effect = getEquipmentStatEffect("銀の腕輪")!;
    effect.bonuses.power = 999;
    expect(getEquipmentStatEffect("銀の腕輪")?.bonuses.power).toBe(20);
  });
});

describe("parseEquipmentBattleBonuses", () => {
  it("全角符号・数字と呪いの負補正を値の下限を設けず扱う", () => {
    expect(parseEquipmentBattleBonuses("戦闘時 武力＋３０、知力－５０、政治−１０")).toEqual({
      power: 30, intelligence: -50, politics: -10,
    });
  });

  it("武器威力、攻撃・防御、発動率、割合補正を能力加算に変換しない", () => {
    expect(parseEquipmentBattleBonuses(
      "戦闘時 武器威力+100、攻撃力+30、防御力+20、武将AT+5%、武力+20%"
    )).toEqual({});
  });
});
