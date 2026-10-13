import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CITY_MAP_EXAMPLE, parseCityMap } from "@/lib/cityMap";
import { parseCityScoutReports } from "@/lib/cityScout";
import { CityScoutPanel, CityScoutPreview } from "./CityScoutPanel";

const map = parseCityMap(CITY_MAP_EXAMPLE);

describe("CityScoutPanel", () => {
  it("アカウントの情報を取得するまでは登録件数や編集欄を出さない", () => {
    const html = renderToStaticMarkup(<CityScoutPanel map={map} accountId={1} onStateChange={() => {}} />);

    expect(html).toContain("都市の偵察情報を読み込んでいます…");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("保存済み");
    expect(html).not.toContain("textarea");
  });

  it("貼り付けた都市名と偵察年月をそれぞれ確認できる", () => {
    const reports = parseCityScoutReports("1634年 9月\nブルゴス [国] : 大都市\n人口 : 618700人\n1634年 10月\nマラガ [国] : 都市\n人口 : 100人");
    const html = renderToStaticMarkup(<CityScoutPreview reports={reports} map={map} />);

    expect(html).toContain("ブルゴス");
    expect(html).toContain("1634年9月");
    expect(html).toContain("マラガ");
    expect(html).toContain("1634年10月");
    expect(html).not.toContain("現在の地図にない都市");
  });

  it("地図外の都市でも保存できることを案内する", () => {
    const reports = parseCityScoutReports("1634年9月\n別の都市 [国] : 都市\n人口 : 1人");
    const html = renderToStaticMarkup(<CityScoutPreview reports={reports} map={map} />);

    expect(html).toContain("別の都市");
    expect(html).toContain("現在の地図にない都市です（保存できます）");
  });

  it("都市名の全半角を揃えて地図と照合し、HTMLを実行しない", () => {
    const reports = parseCityScoutReports("1634年9月\nＡ市 [国] : 都市\n人口 : 1人");
    const normalizedHtml = renderToStaticMarkup(<CityScoutPreview reports={reports} map={{ columns: ["a"], rows: [{ label: "1", cells: ["A市\n★行商"] }] }} />);
    const escapedHtml = renderToStaticMarkup(<CityScoutPreview reports={[{ ...reports[0], cityName: "<script>alert(1)</script>" }]} map={map} />);

    expect(normalizedHtml).not.toContain("現在の地図にない都市");
    expect(escapedHtml).not.toContain("<script>");
    expect(escapedHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
