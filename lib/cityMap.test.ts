import { describe, expect, it } from "vitest";
import {
  CITY_MAP_EXAMPLE,
  MAX_CITY_MAP_SIZE,
  MAX_CITY_MAP_SOURCE_LENGTH,
  parseCityMap,
} from "./cityMap";

function table(width: number, height: number): string {
  return [
    `| | ${Array.from({ length: width }, (_, index) => String.fromCharCode(97 + index)).join(" | ")} |`,
    `| - | ${Array.from({ length: width }, () => "-").join(" | ")} |`,
    ...Array.from({ length: height }, (_, index) =>
      `| ${index + 1} | ${Array.from({ length: width }, (_, col) => `${col},${index}`).join(" | ")} |`
    ),
  ].join("\n");
}

describe("parseCityMap", () => {
  it("提示された8×8の都市、空欄、行商の位置を保持する", () => {
    const map = parseCityMap(CITY_MAP_EXAMPLE.replaceAll("|   |", "| \u00a0 |"));
    expect(map.columns).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(map.rows).toHaveLength(8);
    expect(map.rows.every((row) => row.cells.length === 8)).toBe(true);
    expect(map.rows[0]).toEqual({
      label: "1",
      cells: ["", "ア・コルニャ", "", "アストゥリアス", "ビルバオ", "バンブローナ", "ルルド", "トロサ"],
    });
    expect(map.rows[1].cells[2]).toBe("ラス・メデゥラス\n★行商");
    expect(map.rows[5].cells[3]).toBe("マラガ\n★行商");
    expect(map.rows[7].cells[5]).toBe("シディベルアベス");
    expect(map.rows[7].cells[7]).toBe("");
  });

  it("10×10を受け付け、最後の座標まで欠落なく保持する", () => {
    const map = parseCityMap(table(MAX_CITY_MAP_SIZE, MAX_CITY_MAP_SIZE));
    expect(map.columns[9]).toBe("j");
    expect(map.rows[9]).toEqual({
      label: "10",
      cells: Array.from({ length: 10 }, (_, index) => `${index},9`),
    });
  });

  it("都市が未記入の1×1も位置を保持する", () => {
    expect(parseCityMap("| | a |\n| - | - |\n| 1 | | ")).toEqual({
      columns: ["a"],
      rows: [{ label: "1", cells: [""] }],
    });
  });

  it.each(["```markdown", "```", "~~~md", "````text"])("%s のコードフェンスとCRLFを受け付ける", (opening) => {
    const closing = opening.match(/^[`~]+/)![0];
    const map = parseCityMap(`\r\n${opening}\r\n${table(2, 2).replaceAll("\n", "\r\n")}\r\n${closing}\r\n`);
    expect(map).toEqual(parseCityMap(table(2, 2)));
  });

  it("外側のパイプを省いた表、大文字の座標、配置指定、末尾の空欄に対応する", () => {
    expect(parseCityMap(" | A | B\n:--- | ---: | :---:\n1 | 京都 | 大阪\n2 | 神戸 | ")).toEqual({
      columns: ["a", "b"],
      rows: [
        { label: "1", cells: ["京都", "大阪"] },
        { label: "2", cells: ["神戸", ""] },
      ],
    });
  });

  it("エスケープしたパイプと文字参照をセル内に残し、改行表記を統一する", () => {
    expect(parseCityMap(String.raw`| | a | b |
| - | - | - |
| 1 | 港\|市場<br /> &nbsp;★行商<BR/>備考 | A&amp;B &lt;北&gt; &quot;城&quot; &#39;街&#39; &#x1F3F0; &#124; |
| 2 | &#160;&nbsp; | &unknown; &#0; &#xD800; &#1114112; |`).rows).toEqual([
      { label: "1", cells: ["港|市場\n★行商\n備考", 'A&B <北> "城" \'街\' 🏰 |'] },
      { label: "2", cells: ["", "&unknown; � � �"] },
    ]);
  });

  it("HTMLを実行可能な形式へ変換せず、テキストとして返す", () => {
    const content = '<script>alert(1)</script><img src=x onerror="alert(2)">';
    expect(parseCityMap(`| | a |\n| - | - |\n| 1 | ${content} |`).rows[0].cells).toEqual([content]);
  });

  it.each([
    ["空文字", ""],
    ["空白だけ", "\u00a0\n \t"],
    ["表以外", "地図の説明"],
    ["見出しだけ", "| | a |\n| - | - |"],
    ["都市列なし", "||\n|-|\n|1|"],
    ["データ行の不足", "| | a | b |\n| - | - | - |\n| 1 | 京都 |"],
    ["データ行の過剰", "| | a |\n| - | - |\n| 1 | 京都 | 大阪 |"],
    ["区切り行の列不足", "| | a | b |\n| - | - |\n| 1 | 京都 | 大阪 |"],
    ["区切り行の欠落", "| | a |\n| 1 | 京都 |\n| 2 | 大阪 |"],
    ["列見出しの重複", "| | a | a |\n| - | - | - |\n| 1 | 京都 | 大阪 |"],
    ["列見出しの欠番", "| | a | c |\n| - | - | - |\n| 1 | 京都 | 大阪 |"],
    ["行見出しの欠番", "| | a |\n| - | - |\n| 2 | 京都 |"],
    ["行見出しの重複", "| | a |\n| - | - |\n| 1 | 京都 |\n| 1 | 大阪 |"],
    ["コードフェンスが未完", "```markdown\n| | a |\n| - | - |\n| 1 | 京都 |"],
    ["別の種類で閉じたコードフェンス", "```markdown\n| | a |\n| - | - |\n| 1 | 京都 |\n~~~"],
    ["11列", table(11, 1)],
    ["11行", table(1, 11)],
  ])("%s を切り捨てずに拒否する", (_label, source) => {
    expect(() => parseCityMap(source)).toThrow(Error);
  });

  it("入力テキストの長さを、ちょうど上限まで受け付ける", () => {
    const source = table(1, 1);
    expect(parseCityMap(source.padEnd(MAX_CITY_MAP_SOURCE_LENGTH))).toEqual(parseCityMap(source));
    expect(() => parseCityMap(source.padEnd(MAX_CITY_MAP_SOURCE_LENGTH + 1))).toThrow("50,000文字以内");
  });
});
