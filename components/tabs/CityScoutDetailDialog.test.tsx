import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseCityScoutReports, type CityScoutReport } from "@/lib/cityScout";
import { CityScoutDetailDialog } from "./CityScoutDetailDialog";

const source = `1634年 9月
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

const report = parseCityScoutReports(source)[0];

function renderReport(value: CityScoutReport | null = report) {
  return renderToStaticMarkup(<CityScoutDetailDialog cityName="ブルゴス" report={value} onClose={() => {}} />);
}

describe("CityScoutDetailDialog", () => {
  it("提示された偵察情報を年月・全数値・施設・守備ごとに表示する", () => {
    const html = renderReport();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="city-scout-dialog-title"');
    expect(html).toContain("1634年9月の偵察情報");
    for (const value of ["己鯖夕食突撃部", "大都市", "618,700人", "99", "1,800 / 1,800", "2,200 / 2,200", "1,000 / 1,000", "1,184 / 1,200", "14,000 / 14,000", "0.78", "63,928", "300,230", "ギルド(大都市)", "南蛮町", "武家町", "牧場", "鉄工所", "総構え", "門前町", "ヤドラン （1人）"]) {
      expect(html).toContain(value);
    }
    for (const label of ["所属", "都市規模", "人口", "治安", "農業", "商業", "技術", "城壁", "守備兵数", "相場", "都市資金", "都市兵糧", "施設", "守備", "警備", "海上守備"]) {
      expect(html).toContain(`<dt>${label}</dt>`);
    }
    expect(html).toContain("貼り付けた偵察結果");
    expect(html).toContain('aria-label="都市情報を閉じる"');
  });

  it("不明な項目を0とせず、実際の0と空欄の記載を区別する", () => {
    const html = renderReport({
      ...report,
      population: null,
      publicOrder: 0,
      agriculture: null,
      commerce: { current: 0, max: 100 },
      marketRate: 0,
      facilities: [],
      defenders: null,
      patrol: { names: "", count: null },
      navalDefenders: { names: "", count: 0 },
    });

    expect(html).toContain("<dt>人口</dt><dd>未記載</dd>");
    expect(html).toContain("<dt>治安</dt><dd>0</dd>");
    expect(html).toContain("<dt>農業</dt><dd>未記載</dd>");
    expect(html).toContain("<dt>商業</dt><dd>0 / 100</dd>");
    expect(html).toContain("<dt>相場</dt><dd>0</dd>");
    expect(html).toContain("<dt>施設</dt><dd>記載なし</dd>");
    expect(html).toContain("<dt>守備</dt><dd>未記載</dd>");
    expect(html).toContain("<dt>警備</dt><dd>記載なし</dd>");
    expect(html).toContain("<dt>海上守備</dt><dd>（0人）</dd>");
  });

  it("未登録なら貼り付け欄からの登録を案内する", () => {
    const html = renderReport(null);
    expect(html).toContain("この都市の偵察情報はまだ保存されていません。");
    expect(html).toContain("偵察結果を貼り付ける");
    expect(html).not.toContain("<dl");
  });

  it("読込中や取得失敗を未登録として表示しない", () => {
    const loadingHtml = renderToStaticMarkup(<CityScoutDetailDialog cityName="ブルゴス" report={null} loading onClose={() => {}} />);
    const errorHtml = renderToStaticMarkup(<CityScoutDetailDialog cityName="ブルゴス" report={null} error="取得に失敗しました" onClose={() => {}} />);

    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain("偵察情報を読み込んでいます…");
    expect(loadingHtml).not.toContain("まだ保存されていません");
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("取得に失敗しました");
    expect(errorHtml).not.toContain("まだ保存されていません");
  });

  it("都市名・守備名・施設・元テキストをHTMLとして実行しない", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const html = renderToStaticMarkup(<CityScoutDetailDialog cityName={payload} report={{ ...report, defenders: { names: payload, count: 1 }, facilities: [payload], source: payload }} onClose={() => {}} />);

    expect(html).not.toContain("<img");
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)).toHaveLength(4);
  });
});
