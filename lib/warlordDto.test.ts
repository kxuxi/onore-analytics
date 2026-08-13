import { describe, expect, it } from "vitest";
import { warlordCoreRowToDto, type WarlordCoreRow } from "./warlordDto";

function makeRow(overrides: Partial<WarlordCoreRow> = {}): WarlordCoreRow {
  return {
    name: "信長",
    faction: null,
    type: "武特",
    branch: "騎兵",
    unit: null,
    battleAt: null,
    lastActionAt: null,
    actions: [],
    updatedAt: 123n,
    power: null,
    intelligence: null,
    leadership: null,
    politics: null,
    strategy: null,
    selfPr: null,
    maxTroops: null,
    statsRaw: null,
    ...overrides,
  };
}

describe("warlordCoreRowToDto", () => {
  it("BigIntをnumberへ変換し、nullと空の行動履歴を省略する", () => {
    expect(warlordCoreRowToDto(makeRow())).toEqual({
      name: "信長",
      type: "武特",
      branch: "騎兵",
      updatedAt: 123,
    });
  });

  it("設定済みのプロフィールと能力値を保持する", () => {
    expect(
      warlordCoreRowToDto(
        makeRow({
          faction: "織田",
          unit: "騎馬隊",
          actions: ["04/10 10:00"],
          power: 100,
          strategy: 90.5,
          selfPr: "自己PR",
          maxTroops: 50000,
        })
      )
    ).toMatchObject({
      faction: "織田",
      unit: "騎馬隊",
      actions: ["04/10 10:00"],
      power: 100,
      strategy: 90.5,
      selfPr: "自己PR",
      maxTroops: 50000,
    });
  });
});
