import { describe, expect, it } from "vitest";
import {
  collectTermDecades,
  decadeOf,
  includeSelectedTerm,
  mergeTermOptions,
  parseStoredSelectedTerm,
  parseStoredTermOptions,
  termsInDecade,
} from "./termSelection";

describe("parseStoredTermOptions", () => {
  it("正の整数を重複除去して新しい順に返す", () => {
    expect(parseStoredTermOptions('[145,"146",145,0,-1,1.5,"x"]')).toEqual([
      146, 145,
    ]);
  });

  it("未保存・不正JSON・配列以外は空配列を返す", () => {
    expect(parseStoredTermOptions(null)).toEqual([]);
    expect(parseStoredTermOptions("{")).toEqual([]);
    expect(parseStoredTermOptions('{"term":145}')).toEqual([]);
  });
});

describe("parseStoredSelectedTerm", () => {
  it("全期間と正の整数を復元する", () => {
    expect(parseStoredSelectedTerm("all")).toBe("all");
    expect(parseStoredSelectedTerm("145")).toBe(145);
  });

  it("未保存または不正値は null を返す", () => {
    expect(parseStoredSelectedTerm(null)).toBeNull();
    expect(parseStoredSelectedTerm("0")).toBeNull();
    expect(parseStoredSelectedTerm("1.5")).toBeNull();
    expect(parseStoredSelectedTerm("invalid")).toBeNull();
  });
});

describe("期選択肢の導出", () => {
  it("サーバー取得分と手動追加分を統合して新しい順にする", () => {
    expect(mergeTermOptions([145, 143], [146, 145])).toEqual([146, 145, 143]);
  });

  it("データにない選択中の期も選択肢へ残す", () => {
    expect(includeSelectedTerm([145, 144], 146)).toEqual([146, 145, 144]);
    expect(includeSelectedTerm([145, 144], "all")).toEqual([145, 144]);
  });

  it("期台とその中の期を新しい順に導出する", () => {
    const terms = [151, 149, 145, 139];
    expect(decadeOf(149)).toBe(140);
    expect(collectTermDecades(terms)).toEqual([150, 140, 130]);
    expect(termsInDecade(terms, 140)).toEqual([149, 145]);
    expect(termsInDecade(terms, null)).toEqual([]);
  });
});
