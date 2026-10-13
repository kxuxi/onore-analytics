import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CITY_MAP_EXAMPLE, MAX_CITY_MAP_SIZE, parseCityMap } from "./cityMap";

const copiedMap = readFileSync(new URL("./fixtures/city-map-copied.txt", import.meta.url), "utf8");

function copiedTable(width: number, height: number, multiline = false): string {
  return [
    `\t${Array.from({ length: width }, (_, index) => String.fromCharCode(97 + index)).join("\t")}`,
    ...Array.from({ length: height }, (_, row) =>
      `${row + 1}\t${Array.from({ length: width }, (_, col) => `${col},${row}`).join(multiline ? "\n" : "\t")}`
    ),
  ].join("\n");
}

describe("parseCityMap copied table text", () => {
  it("報告されたコピー文字列の全64マスを元のMarkdown表と同じ座標に復元する", () => {
    expect(parseCityMap(copiedMap)).toEqual(parseCityMap(CITY_MAP_EXAMPLE));
  });

  it("cssのコードフェンスで囲まれたコピー文字列を読み込む", () => {
    expect(parseCityMap(`\`\`\`css\n${copiedMap}\`\`\``)).toEqual(parseCityMap(CITY_MAP_EXAMPLE));
  });

  it("CRLFのコピー文字列でも空欄と行商を保持する", () => {
    expect(parseCityMap(copiedMap.replaceAll("\n", "\r\n"))).toEqual(parseCityMap(CITY_MAP_EXAMPLE));
  });

  it("通常のタブ区切り表の先頭、途中、末尾の空欄を保持する", () => {
    expect(parseCityMap("\ta\tb\tc\n1\t\t京都\t\n2\t大阪\t\t")).toEqual({
      columns: ["a", "b", "c"],
      rows: [
        { label: "1", cells: ["", "京都", ""] },
        { label: "2", cells: ["大阪", "", ""] },
      ],
    });
  });

  it("タブと改行が混在しても行商は直前の都市の注記として残す", () => {
    expect(parseCityMap("\ta\tb\n1\tマラガ\n★行商\tアルメリア\n2\tリスボン\nポルト")).toEqual({
      columns: ["a", "b"],
      rows: [
        { label: "1", cells: ["マラガ\n★行商", "アルメリア"] },
        { label: "2", cells: ["リスボン", "ポルト"] },
      ],
    });
  });

  it.each(["★", "☆"])("タブの後にある%sで始まるマスを直前の都市に結合しない", (marker) => {
    expect(parseCityMap(`\ta\tb\n1\tマラガ\t${marker}行商`)).toEqual({
      columns: ["a", "b"],
      rows: [{ label: "1", cells: ["マラガ", `${marker}行商`] }],
    });
  });

  it("都市名がないマスに続く注記を別の都市へ移さず拒否する", () => {
    expect(() => parseCityMap("\ta\tb\n1\tマラガ\t \n★行商")).toThrow("注記の前に都市名がありません");
  });

  it("フェンスで囲まれた1×1の空きマスを保持する", () => {
    expect(parseCityMap("```css\n\ta\n1\t\n```")).toEqual({
      columns: ["a"],
      rows: [{ label: "1", cells: [""] }],
    });
  });

  it("コピー元の空きマスがNBSPでも全64マスの座標を保持する", () => {
    expect(parseCityMap(copiedMap.replaceAll(" ", "\u00a0"))).toEqual(parseCityMap(CITY_MAP_EXAMPLE));
  });

  it("見出しにタブの余白がある既存のMarkdown表を読み込む", () => {
    expect(parseCityMap("a\t| b\n- | - | -\n1 | 京都 | 大阪")).toEqual({
      columns: ["a", "b"],
      rows: [{ label: "1", cells: ["京都", "大阪"] }],
    });
  });

  it.each([false, true])("10×10のコピー表を最後の座標まで読み込む（都市間の改行: %s）", (multiline) => {
    const map = parseCityMap(copiedTable(MAX_CITY_MAP_SIZE, MAX_CITY_MAP_SIZE, multiline));
    expect(map.columns).toHaveLength(10);
    expect(map.columns[9]).toBe("j");
    expect(map.rows).toHaveLength(10);
    expect(map.rows.every((row) => row.cells.length === 10)).toBe(true);
    expect(map.rows[9]).toEqual({
      label: "10",
      cells: Array.from({ length: 10 }, (_, col) => `${col},9`),
    });
  });

  it.each([
    ["タブ区切りの都市不足", "\ta\tb\n1\t京都"],
    ["タブ区切りの都市過剰", "\ta\tb\n1\t京都\t大阪\t神戸"],
    ["改行区切りの都市不足", "\ta\tb\tc\n1\t京都\n大阪"],
    ["改行区切りの都市過剰", "\ta\tb\n1\t京都\n大阪\n神戸"],
    ["先頭行の欠番", "\ta\tb\n2\t京都\n大阪"],
    ["途中行の欠番", "\ta\tb\n1\t京都\n大阪\n3\t神戸\n奈良"],
    ["行番号の重複", "\ta\tb\n1\t京都\n大阪\n1\t神戸\n奈良"],
    ["行番号以外の見出し", "\ta\tb\n一\t京都\n大阪"],
    ["11列のタブ区切り表", copiedTable(11, 1)],
    ["11行のタブ区切り表", copiedTable(1, 11)],
    ["11列の改行区切り表", copiedTable(11, 1, true)],
    ["11行の改行区切り表", copiedTable(2, 11, true)],
  ])("%s を切り捨てずに拒否する", (_label, source) => {
    expect(() => parseCityMap(source)).toThrow(Error);
  });
});
