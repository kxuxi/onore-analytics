import { describe, it, expect } from "vitest";
import { displayWarlordType } from "./warlordType";

describe("displayWarlordType", () => {
  it("謎以外のタイプはそのまま返す", () => {
    expect(displayWarlordType({ type: "武統", power: 10, leadership: 20 })).toBe(
      "武統"
    );
  });

  it("謎で差が30より大きく武が統より高ければ 謎(武>統) を返す", () => {
    expect(
      displayWarlordType({ type: "謎", power: 80, leadership: 40 })
    ).toBe("謎(武>統)");
  });

  it("謎で差が30より大きく統が武より高ければ 謎(統>武) を返す", () => {
    expect(
      displayWarlordType({ type: "謎", power: 40, leadership: 80 })
    ).toBe("謎(統>武)");
  });

  it("差がちょうど30ならイコールで結ぶ（境界値）", () => {
    expect(
      displayWarlordType({ type: "謎", power: 80, leadership: 50 })
    ).toBe("謎(武=統)");
  });

  it("差が31なら大なりで結ぶ（境界値）", () => {
    expect(
      displayWarlordType({ type: "謎", power: 81, leadership: 50 })
    ).toBe("謎(武>統)");
  });

  it("差が30以内なら大なりの代わりにイコールで結ぶ", () => {
    expect(
      displayWarlordType({ type: "謎", power: 80, leadership: 60 })
    ).toBe("謎(武=統)");
  });

  it("1位と2位が同値ならイコールで結ぶ", () => {
    expect(displayWarlordType({ type: "謎", power: 50, leadership: 50 })).toBe(
      "謎(武=統)"
    );
  });

  it("4項目のうち上位2つを採用する", () => {
    expect(
      displayWarlordType({
        type: "謎",
        power: 50,
        intelligence: 90,
        leadership: 55,
        politics: 30,
      })
    ).toBe("謎(知>統)");
  });

  it("ステータスが1項目以下しか無ければそのまま返す", () => {
    expect(displayWarlordType({ type: "謎", power: 80 })).toBe("謎");
    expect(displayWarlordType({ type: "謎" })).toBe("謎");
  });
});
