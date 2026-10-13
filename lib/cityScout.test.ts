import { describe, expect, it } from "vitest";
import {
  MAX_CITY_SCOUT_REPORTS,
  MAX_CITY_SCOUT_SOURCE_LENGTH,
  normalizeCityScoutName,
  parseCityScoutReports,
} from "./cityScout";

const sample = `1634年 9月
ブルゴス [己鯖夕食突撃部] : 大都市
人口 : 618700人 治安 : 99
農業 : 1800 / 1800
商業 : 2200 / 2200
技術 : 1000 / 1000
城壁 : 1184 / 1200
守備兵数 : 14000 / 14000
相場 : 0.78
施設 : ギルド(大都市) 南蛮町 武家町 牧場 鉄工所 総構え 門前町
都市資金 : 63928 都市兵糧 : 300230
守備 : ヤドラン (1人)

警備 :

海上守備 : (人)`;

describe("parseCityScoutReports", () => {
  it("実際に貼り付けられたブルゴスの各項目を読み取り、不明な人数を0にしない", () => {
    expect(parseCityScoutReports(sample)).toEqual([{
      cityName: "ブルゴス", faction: "己鯖夕食突撃部", cityType: "大都市", year: 1634, month: 9,
      population: 618700, publicOrder: 99,
      agriculture: { current: 1800, max: 1800 }, commerce: { current: 2200, max: 2200 },
      technology: { current: 1000, max: 1000 }, wall: { current: 1184, max: 1200 },
      garrison: { current: 14000, max: 14000 }, marketRate: 0.78,
      facilities: ["ギルド(大都市)", "南蛮町", "武家町", "牧場", "鉄工所", "総構え", "門前町"],
      funds: 63928, rice: 300230, defenders: { names: "ヤドラン", count: 1 },
      patrol: null, navalDefenders: { names: "", count: null }, source: sample,
    }]);
  });

  it("全角の記号と数値、タブ、桁区切り、CRLF、コードフェンスを受け付ける", () => {
    const source = "```text\r\n１６３４年　９月\r\nブルゴス　［所属］：　大都市\r\n人口：６１８，７００人\t治安：９９\r\n農業：１，８００ ／ １，８００\r\n相場：０．７８\r\n```";
    const [report] = parseCityScoutReports(source);
    expect(report).toMatchObject({
      cityName: "ブルゴス", faction: "所属", year: 1634, month: 9,
      population: 618700, publicOrder: 99, agriculture: { current: 1800, max: 1800 }, marketRate: 0.78,
    });
    expect(report.source).toContain("人口：６１８，７００人");
    expect(report.source).not.toContain("```");
    expect(parseCityScoutReports(report.source)).toEqual([report]);
  });

  it("空欄と省略はnull、明示されたゼロは0として区別する", () => {
    const [report] = parseCityScoutReports(`1634年9月
ブルゴス [] :
人口 : 0人 治安 :
農業 :
施設 :
都市資金 : 都市兵糧 : 0
守備 : (0人)
警備 : カビゴン`);
    expect(report).toMatchObject({ faction: "", cityType: "", population: 0, publicOrder: null,
      agriculture: null, commerce: null, funds: null, rice: 0, facilities: null,
      defenders: { names: "", count: 0 }, patrol: { names: "カビゴン", count: null }, navalDefenders: null });
  });

  it("別々の年月の複数都市を一括解析し、それぞれの原文を保存する", () => {
    const later = "1635年 1月\nマラガ [南軍] : 都市\n人口 : 12345人\n備考 : <script>alert(1)</script>";
    const reports = parseCityScoutReports(`${sample}\n\n${later}`);
    expect(reports).toHaveLength(2);
    expect(reports[0].source).toBe(sample);
    expect(reports[1]).toMatchObject({ cityName: "マラガ", year: 1635, month: 1, population: 12345, source: later });
    for (const report of reports) expect(parseCityScoutReports(report.source)).toEqual([report]);
  });

  it("同じ年月に複数都市が続く場合も各原文に年月を保持する", () => {
    const reports = parseCityScoutReports(`${sample}\n\nマラガ [南軍] : 都市\n守備 : ピカチュウ リザードン (2人)`);
    expect(reports[1]).toMatchObject({ cityName: "マラガ", year: 1634, month: 9,
      defenders: { names: "ピカチュウ リザードン", count: 2 } });
    expect(reports[1].source).toBe("1634年 9月\nマラガ [南軍] : 都市\n守備 : ピカチュウ リザードン (2人)");
    expect(parseCityScoutReports(reports[1].source)).toEqual([reports[1]]);
  });

  it.each([
    "人口 : 1,00人", "人口 : -1人", "治安 : 99x", "農業 : 1800", "商業 : 1 /",
    "技術 : 不明 / 1000", "城壁 : 100 / 100 / 100", "守備兵数 : 1.5 / 2",
    "相場 : NaN", "相場 : 0.78円", "都市資金 : 9007199254740992", "都市兵糧 : 1e3",
    "守備 : ヤドラン (一人)", "警備 : (1.5人)", "海上守備 : (-1人)",
  ])("不正な数値を黙って補完せず拒否する: %s", (field) => {
    expect(() => parseCityScoutReports(`1634年9月\nブルゴス [所属] : 大都市\n${field}`)).toThrow(/値を読み取れません/);
  });

  it.each(["", "地図のテキスト", "ブルゴス [所属] : 大都市", "1634年9月", "1634年9月\n[所属] : 大都市"])("年月または都市名がない入力を拒否する: %s", (source) => {
    expect(() => parseCityScoutReports(source)).toThrow();
  });

  it.each(["1634年0月", "1634年13月", "0年9月", "10000年9月", "不明年9月"])("不正な年月を拒否する: %s", (date) => {
    expect(() => parseCityScoutReports(`${date}\nブルゴス [所属] : 大都市`)).toThrow();
  });

  it("後続の都市に不正があれば一括貼り付け全体を拒否する", () => {
    expect(() => parseCityScoutReports(`${sample}\n1635年13月\nマラガ [所属] : 都市`)).toThrow();
    expect(() => parseCityScoutReports(`${sample}\n1635年1月`)).toThrow();
    expect(() => parseCityScoutReports(`1634年9月\n1635年1月\nマラガ [所属] : 都市`)).toThrow();
  });

  it("重複した数値のどちらかを勝手に選ばない", () => {
    expect(() => parseCityScoutReports(`${sample}\n人口 : 200人`)).toThrow(/人口が重複/);
  });

  it("壊れたコードフェンスを拒否する", () => {
    expect(() => parseCityScoutReports(`\`\`\`text\n${sample}`)).toThrow(/末尾/);
  });

  it("入力の文字数と都市件数の上限を適用する", () => {
    expect(() => parseCityScoutReports("a".repeat(MAX_CITY_SCOUT_SOURCE_LENGTH + 1))).toThrow(/50,000文字/);
    const report = (index: number) => `1634年9月\n都市${index} [所属] : 大都市`;
    const allowed = Array.from({ length: MAX_CITY_SCOUT_REPORTS }, (_, index) => report(index)).join("\n");
    expect(parseCityScoutReports(allowed)).toHaveLength(100);
    expect(() => parseCityScoutReports(`${allowed}\n${report(100)}`)).toThrow(/100都市/);
  });
});

describe("normalizeCityScoutName", () => {
  it("全角・半角や余白を揃え、地図の名称と照合できる", () => {
    expect(normalizeCityScoutName("　Ｐｏｒｔｏ\t 城　")).toBe("Porto 城");
    expect(normalizeCityScoutName("ﾌﾞﾙｺﾞｽ")).toBe("ブルゴス");
  });

  it("似ている都市名を勝手に同一視しない", () => {
    expect(normalizeCityScoutName("ラス・メデュラス")).not.toBe(normalizeCityScoutName("ラス・メデゥラス"));
  });
});
