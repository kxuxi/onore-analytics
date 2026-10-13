import { describe, expect, it } from "vitest";
import { CITY_MAP_EXAMPLE, parseCityMap, type CityMap } from "./cityMap";
import {
  parseMerchantSettings,
  predictMerchants,
  type MerchantSettings,
} from "./cityMapMerchants";

const sample = parseCityMap(CITY_MAP_EXAMPLE);
const initial: MerchantSettings = { year: 1612, month: 1 };

function positionSummary(map: CityMap, settings: MerchantSettings = initial) {
  return predictMerchants(map, settings).positions.map((position) => ({
    merchant: position.merchant,
    coordinate: `${position.rowLabel}${position.columnLabel}`,
    city: position.city,
  }));
}

describe("predictMerchants", () => {
  it("公開ログの1612年1月と同じア・コルニャとパルマから始まる", () => {
    const result = predictMerchants(sample, initial);

    expect(result.status).toBe("active");
    expect(positionSummary(sample)).toEqual([
      { merchant: 1, coordinate: "1b", city: "ア・コルニャ" },
      { merchant: 2, coordinate: "4h", city: "パルマ" },
    ]);
    expect(result.positions.map(({ rowIndex, columnIndex }) => [rowIndex, columnIndex]))
      .toEqual([[0, 1], [3, 7]]);
    expect(result.nextMove).toEqual({ year: 1612, month: 7 });
    expect(result.stayUntil).toEqual({ year: 1612, month: 6 });
  });

  it("6月までは同じ都市に滞在し、7月に空きマスを飛ばして隣の都市へ進む", () => {
    expect(positionSummary(sample, { ...initial, month: 6 })).toEqual(positionSummary(sample));

    const july = { ...initial, month: 7 };
    expect(positionSummary(sample, july)).toEqual([
      { merchant: 1, coordinate: "1d", city: "アストゥリアス" },
      { merchant: 2, coordinate: "5b", city: "ファロ" },
    ]);
    expect(predictMerchants(sample, july).nextMove).toEqual({ year: 1615, month: 1 });
    expect(predictMerchants(sample, july).stayUntil).toEqual({ year: 1612, month: 12 });
  });

  it("行の右端の次は下の行の左端へ進み、貼付時の★行商は開始位置にしない", () => {
    expect(positionSummary(sample, { ...initial, year: 1617 })).toEqual([
      { merchant: 1, coordinate: "2b", city: "ポルト" },
      { merchant: 2, coordinate: "6c", city: "ジブラルタル" },
    ]);
    expect(positionSummary(sample, { ...initial, year: 1617, month: 7 })[0])
      .toEqual({ merchant: 1, coordinate: "2c", city: "ラス・メデゥラス" });
  });

  it("2人とも最後の都市の次は先頭へ戻り、夜間の停止を挟んで44都市を一周する", () => {
    expect(positionSummary(sample, { ...initial, year: 1629 })).toEqual([
      { merchant: 1, coordinate: "4h", city: "パルマ" },
      { merchant: 2, coordinate: "1b", city: "ア・コルニャ" },
    ]);
    expect(positionSummary(sample, { ...initial, year: 1646 })).toEqual(positionSummary(sample));
  });

  it("途中の空白行を飛ばし、2人目は都市数の半分だけ先から始まる", () => {
    const sparse = parseCityMap(`| | a | b | c | d |
| - | - | - | - | - |
| 1 | | 北港 | | |
| 2 | | | | 山城 |
| 3 | | | | |
| 4 | 南港 | | 島 | |`);

    expect(positionSummary(sparse)).toEqual([
      { merchant: 1, coordinate: "1b", city: "北港" },
      { merchant: 2, coordinate: "4a", city: "南港" },
    ]);
    expect(positionSummary(sparse, { ...initial, month: 7 })).toEqual([
      { merchant: 1, coordinate: "2d", city: "山城" },
      { merchant: 2, coordinate: "4c", city: "島" },
    ]);
    expect(positionSummary(sparse, { ...initial, year: 1615 })).toEqual([
      { merchant: 1, coordinate: "4a", city: "南港" },
      { merchant: 2, coordinate: "1b", city: "北港" },
    ]);
  });

  it.each([[10, "6"], [5, "3"]])("各行1都市の%i都市の地図では2人目は%s番目から始まる", (height, startRow) => {
    const map: CityMap = {
      columns: ["a"],
      rows: Array.from({ length: height }, (_, index) => ({
        label: String(index + 1), cells: [`都市${index + 1}`],
      })),
    };
    expect(predictMerchants(map, initial).positions[1].rowLabel).toBe(startRow);
  });

  it("都市が地図の上半分に偏っていても、2人目は都市数を基準に開始する", () => {
    const upperOnly = parseCityMap(`| | a | b |
| - | - | - |
| 1 | 北港 | |
| 2 | | 山城 |
| 3 | | |
| 4 | | |`);

    expect(positionSummary(upperOnly)).toEqual([
      { merchant: 1, coordinate: "1a", city: "北港" },
      { merchant: 2, coordinate: "2b", city: "山城" },
    ]);
  });

  it("1都市だけの地図でも2人を同じ都市に表示する", () => {
    const single = parseCityMap("| | a |\n| - | - |\n| 1 | 港<br>★行商 | ");
    const expected = [
      { merchant: 1, coordinate: "1a", city: "港" },
      { merchant: 2, coordinate: "1a", city: "港" },
    ];

    expect(positionSummary(single)).toEqual(expected);
    expect(positionSummary(single, { ...initial, year: 1700, month: 12 })).toEqual(expected);
  });

  it("都市がない地図では出現位置を返さない", () => {
    const empty = parseCityMap("| | a | b |\n| - | - | - |\n| 1 | | | ");
    const result = predictMerchants(empty, initial);

    expect(result.status).toBe("no-cities");
    expect(result.positions).toEqual([]);
  });

  it("1612年1月より前には出現しない", () => {
    const result = predictMerchants(sample, { ...initial, year: 1611, month: 12 });

    expect(result.status).toBe("before-start");
    expect(result.positions).toEqual([]);
  });

  it.each([
    [1613, 1, 1615],
    [1613, 12, 1615],
    [1614, 1, 1615],
    [1614, 12, 1615],
    [1619, 1, 1621],
    [1620, 12, 1621],
  ])("%i年%i月はシンデレラ期間で、%i年1月の再出現を案内する", (year, month, nextYear) => {
    expect(predictMerchants(sample, { year, month })).toEqual({
      status: "cinderella",
      positions: [],
      nextMove: { year: nextYear, month: 1 },
      stayUntil: null,
    });
  });

  it("シンデレラ直前の滞在は12月で終わり、再開時は次の都市へ1回だけ進む", () => {
    const before = predictMerchants(sample, { year: 1612, month: 12 });
    expect(before.positions[0].city).toBe("アストゥリアス");
    expect(before.stayUntil).toEqual({ year: 1612, month: 12 });
    expect(before.nextMove).toEqual({ year: 1615, month: 1 });

    const after = predictMerchants(sample, { year: 1615, month: 1 });
    expect(after.status).toBe("active");
    expect(after.positions[0].city).toBe("ビルバオ");
    expect(after.stayUntil).toEqual({ year: 1615, month: 6 });
    expect(after.nextMove).toEqual({ year: 1615, month: 7 });
  });

  it("6年後のシンデレラも移動回数へ加算しない", () => {
    expect(predictMerchants(sample, { year: 1618, month: 12 }).positions[0].city).toBe("ブルゴス");
    expect(predictMerchants(sample, { year: 1621, month: 1 }).positions[0].city).toBe("サラゴサ");
  });

  it("公開ログの1630年7月はバンブローナとグラナダにいる", () => {
    expect(positionSummary(sample, { year: 1630, month: 7 })).toEqual([
      { merchant: 1, coordinate: "5e", city: "グラナダ" },
      { merchant: 2, coordinate: "1f", city: "バンブローナ" },
    ]);
  });

  it("実ゲームで確認された1634年9月はマラガとラス・メデゥラスにいる", () => {
    const settings = { year: 1634, month: 9 };
    expect(positionSummary(sample, settings)).toEqual([
      { merchant: 1, coordinate: "6d", city: "マラガ" },
      { merchant: 2, coordinate: "2c", city: "ラス・メデゥラス" },
    ]);
    expect(predictMerchants(sample, settings).stayUntil).toEqual({ year: 1634, month: 12 });
    expect(predictMerchants(sample, settings).nextMove).toEqual({ year: 1635, month: 1 });
  });

  it("1719年7月が最後の移動で、その都市に12月まで滞在する", () => {
    const july = predictMerchants(sample, { ...initial, year: 1719, month: 7 });
    const december = predictMerchants(sample, { ...initial, year: 1719, month: 12 });

    expect(july.status).toBe("active");
    expect(positionSummary(sample, { ...initial, year: 1719, month: 7 })).toEqual([
      { merchant: 1, coordinate: "2h", city: "バルセロナ" },
      { merchant: 2, coordinate: "7c", city: "セウタ" },
    ]);
    expect(july.nextMove).toBeNull();
    expect(july.stayUntil).toEqual({ year: 1719, month: 12 });
    expect(december.status).toBe("active");
    expect(december.positions).toEqual(july.positions);
    expect(december.nextMove).toBeNull();
  });

  it("1720年1月以降は出現期間が終了している", () => {
    const result = predictMerchants(sample, { ...initial, year: 1720 });

    expect(result.status).toBe("after-end");
    expect(result.positions).toEqual([]);
    expect(result.nextMove).toBeNull();
  });

});

describe("parseMerchantSettings", () => {
  it.each([
    initial,
    { year: 1, month: 1 },
    { year: 9999, month: 12 },
  ])("設定値を検証して返す: %j", (settings) => {
    expect(parseMerchantSettings(settings)).toEqual(settings);
  });

  it.each(["00:00", "07:59", "08:00", "23:59"])("旧設定の判定時刻%sを取り除き、ゲーム年月だけで計算する", (time) => {
    const settings = parseMerchantSettings({ ...initial, time });

    expect(settings).toEqual(initial);
    expect(predictMerchants(sample, settings)).toEqual(predictMerchants(sample, initial));
    expect(predictMerchants(sample, settings).status).toBe("active");
  });

  it.each([
    undefined,
    null,
    [],
    {},
    "1612年1月",
    { ...initial, year: "1612" },
    { ...initial, year: 0 },
    { ...initial, year: 10_000 },
    { ...initial, year: 1612.5 },
    { ...initial, year: Number.NaN },
    { ...initial, year: Number.POSITIVE_INFINITY },
    { ...initial, month: "1" },
    { ...initial, month: 0 },
    { ...initial, month: 13 },
    { ...initial, month: 1.5 },
  ])("不正な設定値を拒否する: %j", (settings) => {
    expect(() => parseMerchantSettings(settings)).toThrow(Error);
  });
});
