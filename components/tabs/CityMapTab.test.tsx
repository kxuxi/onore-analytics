import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CityMapGrid, CityMapTab } from "./CityMapTab";
import { parseCityMap, CITY_MAP_EXAMPLE } from "@/lib/cityMap";
import { predictMerchants } from "@/lib/cityMapMerchants";
import { parseCityScoutReports } from "@/lib/cityScout";

describe("CityMapTab", () => {
  it("既存地図の取得前は編集欄を表示せず、入力の上書きを防ぐ", () => {
    const html = renderToStaticMarkup(<CityMapTab accountId={1} />);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("都市地図を読み込んでいます…");
    expect(html).not.toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).not.toContain("データリセット");
    expect(html).not.toContain("保存済み");
  });

  it("行列の座標、空きマス、都市名と注記の改行を保つ", () => {
    const html = renderToStaticMarkup(
      <CityMapGrid map={{
        columns: ["a", "b"],
        rows: [{ label: "1", cells: ["", "マラガ\n★行商"] }],
      }} />
    );

    expect(html).toContain('<th scope="col">a</th>');
    expect(html).toContain('<th scope="col">b</th>');
    expect(html).toContain('<th scope="row">1</th>');
    expect(html).toContain("空きマス");
    expect(html).toContain('<span class="city-map-city">マラガ</span>');
    expect(html).toContain('<span class="city-map-note">★行商</span>');
    expect(html.match(/<td>/g)).toHaveLength(2);
  });

  it("地図の内容にあるHTMLを実行せず文字列として描画する", () => {
    const html = renderToStaticMarkup(
      <CityMapGrid map={{
        columns: ["<img src=x>"],
        rows: [{ label: "<script>", cells: ["<img src=x onerror=alert(1)>\n<script>alert(1)</script>"] }],
      }} />
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("計算した2人の行商人を表示し、貼り付け時点の古い行商マークを除く", () => {
    const map = parseCityMap(CITY_MAP_EXAMPLE);
    const merchantPrediction = predictMerchants(map, { year: 1612, month: 1 });
    const html = renderToStaticMarkup(<CityMapGrid map={map} merchantPrediction={merchantPrediction} />);

    expect(html).toContain('city-map-merchant-badge--1">行商人1</span>');
    expect(html).toContain('city-map-merchant-badge--2">行商人2</span>');
    expect(html).not.toContain("★行商");
    expect(html.match(/city-map-cell-merchant/g)).toHaveLength(2);
    expect(html).toContain('data-merchants="1"');
    expect(html).toContain('data-merchants="2"');
  });

  it("出現期間外は貼り付け時のマークも予測バッジも表示しない", () => {
    const map = parseCityMap(CITY_MAP_EXAMPLE);
    const merchantPrediction = predictMerchants(map, { year: 1720, month: 1 });
    const html = renderToStaticMarkup(<CityMapGrid map={map} merchantPrediction={merchantPrediction} />);

    expect(html).not.toContain("★行商");
    expect(html).not.toContain("city-map-merchant-badge");
    expect(html).toContain("ラス・メデゥラス");
    expect(html).toContain("マラガ");
  });

  it("同じ都市に2人いる場合も両方のバッジを表示する", () => {
    const map = parseCityMap("| | a |\n| - | - |\n| 1 | 京都<br>港 | ");
    const merchantPrediction = predictMerchants(map, { year: 1612, month: 1 });
    const html = renderToStaticMarkup(<CityMapGrid map={map} merchantPrediction={merchantPrediction} />);

    expect(html.match(/city-map-cell-merchant/g)).toHaveLength(1);
    expect(html).toContain('data-merchants="1 2"');
    expect(html).toContain("行商人1");
    expect(html).toContain("行商人2");
    expect(html).toContain('<span class="city-map-note">港</span>');
  });

  it("年月の入力中や設定読込中に古い行商マークを復活させない", () => {
    const map = parseCityMap(CITY_MAP_EXAMPLE);
    const html = renderToStaticMarkup(<CityMapGrid map={map} merchantPrediction={null} />);

    expect(html).not.toContain("★行商");
    expect(html).not.toContain("city-map-merchant-badge");
  });

  it("都市だけを詳細を開くボタンにし、種類と施設の頭文字を表示する", () => {
    const map = parseCityMap("| | a | b | c |\n| - | - | - | - |\n| 1 | ブルゴス<br>★行商 | | レオン |");
    const [report] = parseCityScoutReports("1634年9月\nブルゴス [所属国] : 工業都市\n施設 : 兵舎 鉄工所 武家町 越後屋 南蛮町 郊外");
    const html = renderToStaticMarkup(
      <CityMapGrid
        map={map}
        onCitySelect={() => {}}
        scoutsByCity={new Map([[report.cityName, report]])}
      />
    );

    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toContain('aria-label="ブルゴスの都市情報（工業）、施設: 兵舎、鉄工所、武家町、越後屋、南蛮町、郊外"');
    expect(html).toContain('aria-label="レオンの都市情報"');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
    expect(html).toContain('<span class="city-map-city">ブルゴス<span class="city-map-city-type">（工業）</span></span>');
    expect(html.match(/city-map-facilities/g)).toHaveLength(1);
    expect(html).toContain("兵/鉄/武/越/南/郊");
    expect(html).not.toContain("偵察済み");
    expect(html.match(/city-map-cell-scouted/g)).toHaveLength(1);
    expect(html).toContain("★行商");
  });
});
