import { describe, expect, it } from "vitest";
import {
  splitGoodAgainst,
  parseReqStats,
  composeReqStats,
  parseCost,
  composeCost,
  parseYears,
  composeYears,
  parseUnitTypesTsv,
} from "./unitTypeForm";

describe("splitGoodAgainst", () => {
  it("半角・全角コロン区切りを分解し空要素を除く", () => {
    expect(splitGoodAgainst("弓兵:壁:")).toEqual(["弓兵", "壁"]);
    expect(splitGoodAgainst("騎兵：歩兵")).toEqual(["騎兵", "歩兵"]);
    expect(splitGoodAgainst("")).toEqual([]);
  });
});

describe("parseReqStats / composeReqStats", () => {
  it("'武力:40' を分解できる", () => {
    expect(parseReqStats("武力:40")).toEqual({ stat: "武力", num: "40" });
  });

  it("区切りが無ければ数値は空", () => {
    expect(parseReqStats("統率")).toEqual({ stat: "統率", num: "" });
  });

  it("再構成は round-trip する", () => {
    expect(composeReqStats("武力", "40")).toBe("武力:40");
  });

  it("ステータス名が空なら空文字を返す", () => {
    expect(composeReqStats("", "40")).toBe("");
  });
});

describe("parseCost / composeCost", () => {
  it("'金:600' を通貨と金額に分解できる", () => {
    expect(parseCost("金:600")).toEqual({ currency: "金", amount: "600" });
  });

  it("区切りが無ければ既定通貨（金）として金額のみ扱う", () => {
    expect(parseCost("600")).toEqual({ currency: "金", amount: "600" });
  });

  it("再構成は round-trip する", () => {
    expect(composeCost("米", "300")).toBe("米:300");
  });

  it("金額が空なら空文字を返す", () => {
    expect(composeCost("金", "")).toBe("");
  });
});

describe("parseYears / composeYears", () => {
  it("'36年' から数値を取り出す", () => {
    expect(parseYears("36年")).toBe("36");
  });

  it("数値が無ければ空文字", () => {
    expect(parseYears("年")).toBe("");
  });

  it("再構成は round-trip する", () => {
    expect(composeYears("36")).toBe("36年");
    expect(composeYears("")).toBe("");
  });
});

describe("parseUnitTypesTsv（兵種一覧の一括取り込み）", () => {
  it("タブ区切りの行を UnitType に変換する", () => {
    const text = [
      "赤備\t騎兵\t弓兵:\t70\t40\t金:250\t600\t6年\t統率:60\t牧場\t【統率・武力依存】攻撃力が上昇する。\t敵計略-5%",
    ].join("\n");
    const { units, parsed, skipped } = parseUnitTypesTsv(text);
    expect(parsed).toBe(1);
    expect(skipped).toBe(0);
    expect(units[0]).toEqual({
      name: "赤備",
      category: "騎兵",
      goodAgainst: "弓兵:",
      attack: 70,
      defense: 40,
      cost: "金:250",
      tech: "600",
      years: "6年",
      reqStats: "統率:60",
      facility: "牧場",
      special: "【統率・武力依存】攻撃力が上昇する。",
      bonus: "敵計略-5%",
    });
  });

  it("ヘッダー行・空行を無視する（複数行に割れたヘッダーも含む）", () => {
    const text = [
      "種類\t兵種\t得意兵種\t攻撃\t防御",
      "[%]\t雇用金\t技術\t年数\t必要",
      "能力値\t施設/国宝\t特殊攻撃\tボーナス",
      "名前\t種類\t得意兵種\t攻撃\t防御\t雇用金\t技術\t年数\t必要能力値\t施設/国宝\t特殊攻撃\tボーナス",
      "",
      "雑兵\t万能\t\t20\t5\t金:10\t0\t\t統率:0\t\t【統率依存】一斉攻撃。\t",
    ].join("\n");
    const { units, parsed, skipped } = parseUnitTypesTsv(text);
    expect(parsed).toBe(1);
    expect(skipped).toBe(0);
    expect(units[0].name).toBe("雑兵");
    expect(units[0].attack).toBe(20);
    expect(units[0].bonus).toBe("");
  });

  it("同名は後勝ち（最後の行で上書き）でまとめる", () => {
    const text = [
      "赤備\t騎兵\t弓兵:\t70\t40\t金:250\t600\t6年\t統率:60\t牧場\t旧\t敵計略-5%",
      "赤備\t騎兵\t弓兵:\t99\t45\t金:300\t900\t12年\t統率:120\t牧場\t新\t敵計略-6%",
    ].join("\n");
    const { units, parsed } = parseUnitTypesTsv(text);
    expect(parsed).toBe(1);
    expect(units[0].attack).toBe(99);
    expect(units[0].special).toBe("新");
  });

  it("列が少なすぎる行・攻撃が非数値の行はスキップして数える", () => {
    const text = [
      "これはメモです",
      "こわれた行\t騎兵\t弓兵:\tNaNだよ\t40\t金:250\t600\t6年\t統率:60\t牧場\t特\tボ",
      "母衣衆\t騎兵\t弓兵:\t50\t35\t金:120\t100\t\t統率:0\t\t特\t武将アタック+3%",
    ].join("\n");
    const { units, parsed, skipped } = parseUnitTypesTsv(text);
    expect(parsed).toBe(1);
    expect(skipped).toBe(2);
    expect(units[0].name).toBe("母衣衆");
  });

  it("空テキストは 0 件", () => {
    expect(parseUnitTypesTsv("")).toEqual({ units: [], parsed: 0, skipped: 0 });
  });
});
