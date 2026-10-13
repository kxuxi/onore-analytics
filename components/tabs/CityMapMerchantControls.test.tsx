import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CITY_MAP_EXAMPLE, parseCityMap } from "@/lib/cityMap";
import { parseMerchantSettings, predictMerchants, type MerchantPrediction } from "@/lib/cityMapMerchants";
import { CityMapMerchantControls, MerchantPredictionSummary, shiftMerchantMonth } from "./CityMapMerchantControls";

const map = parseCityMap(CITY_MAP_EXAMPLE);

describe("CityMapMerchantControls", () => {
  it("保存済み設定を取得するまでは入力欄・予測を表示しない", () => {
    const html = renderToStaticMarkup(
      <CityMapMerchantControls map={map} accountId={1} onPredictionChange={() => {}} />
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("行商人の設定を読み込んでいます…");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("ア・コルニャ");
  });

  it("開始時には2人の都市名・座標と次回移動を表示する", () => {
    const prediction = predictMerchants(map, { year: 1612, month: 1 });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).toContain("行商人1");
    expect(html).toContain("ア・コルニャ");
    expect(html).toContain("（1, b）");
    expect(html).toContain("行商人2");
    expect(html).toContain("パルマ");
    expect(html).toContain("（4, h）");
    expect(html).toContain("1612年6月まで滞在。");
    expect(html).toContain("次の移動は1612年7月です。");
  });

  it("最終期間には次の移動を案内しない", () => {
    const prediction = predictMerchants(map, { year: 1719, month: 12 });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).toContain("1719年12月まで滞在。");
    expect(html).toContain("最後の滞在期間です。以後は出現しません。");
    expect(html).not.toContain("次の移動は");
  });

  it.each([
    [1613, 1, 1615],
    [1614, 12, 1615],
    [1619, 1, 1621],
  ])("%i年%i月には不在の理由と%i年の再出現を表示する", (year, month, nextYear) => {
    const prediction = predictMerchants(map, { year, month });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).toContain("シンデレラ時間（00:00〜07:59）にあたるため、行商人は出現しません。");
    expect(html).toContain(`次の出現は${nextYear}年1月です。`);
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("まで滞在");
    expect(html).not.toContain("次の移動は");
  });

  it("シンデレラ時間に入る前は次に出現する年月を移動予定として表示する", () => {
    const prediction = predictMerchants(map, { year: 1612, month: 7 });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).toContain("1612年12月まで滞在。");
    expect(html).toContain("次の移動は1615年1月です。");
  });

  it("実際の出現が報告された1634年9月にマラガとラス・メデゥラスを表示する", () => {
    const prediction = predictMerchants(map, { year: 1634, month: 9 });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).toContain("マラガ");
    expect(html).toContain("（6, d）");
    expect(html).toContain("ラス・メデゥラス");
    expect(html).toContain("（2, c）");
    expect(html).toContain("1634年12月まで滞在。");
    expect(html).toContain("次の移動は1635年1月です。");
  });

  it.each([
    ["before-start", "1612年1月より前"],
    ["after-end", "1720年1月以降は出現しません"],
    ["no-cities", "地図に都市がないため"],
  ] as const)("%s のとき不在の理由を明示し位置を出さない", (status, reason) => {
    const prediction: MerchantPrediction = { status, positions: [], stayUntil: null, nextMove: null };
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).toContain(reason);
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("次の移動は");
  });

  it("過去に保存した時刻にかかわらず年月から都市を表示する", () => {
    const settings = parseMerchantSettings({ year: 1612, month: 1, time: "07:59" });
    const prediction = predictMerchants(map, settings);
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(settings).toEqual({ year: 1612, month: 1 });
    expect(html).toContain("ア・コルニャ");
    expect(html).toContain("パルマ");
    expect(html).not.toContain("判定時刻");
    expect(html).not.toContain("現在時刻");
  });

  it("都市名をHTMLとして実行しない", () => {
    const prediction = predictMerchants({
      columns: ["a"],
      rows: [{ label: "1", cells: ["<img src=x onerror=alert(1)>"] }],
    }, { year: 1612, month: 1 });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("行商人1");
    expect(html).toContain("行商人2");
  });

  it.each([
    [{ year: 1634, month: 7 }, 6, { year: 1635, month: 1 }],
    [{ year: 1634, month: 7 }, -6, { year: 1634, month: 1 }],
    [{ year: 1612, month: 3 }, -6, { year: 1611, month: 9 }],
  ])("%o から%iか月ずらした年月を返す", (settings, months, expected) => {
    expect(shiftMerchantMonth(settings, months)).toEqual(expected);
  });

  it("入力できる年の範囲外へはずらさない", () => {
    expect(shiftMerchantMonth({ year: 1, month: 3 }, -6)).toBeNull();
    expect(shiftMerchantMonth({ year: 9999, month: 9 }, 6)).toBeNull();
  });

  it("出現位置の一覧は地図と同じ色のバッジで行商人を示す", () => {
    const prediction = predictMerchants(map, { year: 1612, month: 1 });
    const html = renderToStaticMarkup(<MerchantPredictionSummary prediction={prediction} />);
    expect(html).toContain('city-map-merchant-badge--1">行商人1</span>');
    expect(html).toContain('city-map-merchant-badge--2">行商人2</span>');
  });
});
