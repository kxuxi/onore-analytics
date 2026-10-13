export const MAX_CITY_MAP_SIZE = 10;
export const MAX_CITY_MAP_SOURCE_LENGTH = 50_000;

export type CityMap = {
  columns: string[];
  rows: { label: string; cells: string[] }[];
};

export const CITY_MAP_EXAMPLE = `|   | a | b | c | d | e | f | g | h |
| - | - | - | - | - | - | - | - | - |
| 1 |   | ア・コルニャ<br> |   | アストゥリアス<br> | ビルバオ<br> | バンブローナ<br> | ルルド<br> | トロサ<br> |
| 2 |   | ポルト<br> | ラス・メデゥラス<br>★行商 | レオン<br> | ブルゴス<br> | サラゴサ<br> |   | バルセロナ<br> |
| 3 |   | ファティマ<br> | サマランカ<br> | マドリード<br> |   | テルエル<br> | タラゴナ<br> |   |
| 4 | リスボン<br> | バタホス<br> | メリダ<br> |   | クエンカ<br> | バレンシア<br> |   | パルマ<br> |
| 5 |   | ファロ<br> | セビリア<br> |   | グラナダ<br> | ムルシア<br> | イビサ<br> |   |
| 6 |   |   | ジブラルタル<br> | マラガ<br>★行商 | アルメリア<br> |   | シェルシェル<br> | アルジェ<br> |
| 7 |   |   | セウタ<br> |   | ナドール<br> | オラン<br> | シュレフ<br> | ブリダ<br> |
| 8 |   | カサブランカ<br> | フェス<br> | ウジュダ<br> | トレムセン<br> | シディベルアベス<br> | ティアレ<br> |   |`;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

function normalizeCell(value: string): string {
  return value
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (!code.startsWith("#")) {
        return Object.hasOwn(ENTITIES, code.toLowerCase())
          ? ENTITIES[code.toLowerCase()]
          : entity;
      }
      const isHex = code[1].toLowerCase() === "x";
      const point = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : "\uFFFD";
    })
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Split before decoding entities so &#124; and escaped pipes stay inside a cell. */
function splitRow(line: string, expectedWidth?: number): string[] {
  const value = line.trim();
  const cells = [""];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "\\" && (value[index + 1] === "|" || value[index + 1] === "\\")) {
      cells[cells.length - 1] += value[++index];
    } else if (char === "|") {
      cells.push("");
    } else {
      cells[cells.length - 1] += char;
    }
  }

  const leadingBorder = value.startsWith("|");
  const trailingBorder = cells.length > 1 && cells[cells.length - 1] === "";
  if (leadingBorder) cells.shift();
  if (trailingBorder) {
    cells.pop();
    // Without an opening border, the final pipe may introduce an empty last cell.
    if (!leadingBorder && expectedWidth && cells.length === expectedWidth - 1) {
      cells.push("");
    }
  }
  return cells.map(normalizeCell);
}

/** コピーした表の空白マスを残し、外側のコードフェンスだけを取り除く。 */
function sourceLines(source: string): string[] {
  let lines = source.replace(/\r\n?/g, "\n").split("\n");
  const firstContent = lines.findIndex((line) => line.trim());
  lines = lines.slice(firstContent);
  const fence = lines[0].trim().match(/^(`{3,}|~{3,})[^`~]*$/);
  if (fence) {
    let lastContent = lines.length - 1;
    while (lastContent > 0 && !lines[lastContent].trim()) lastContent--;
    const closingFence = new RegExp(`^${fence[1][0]}{${fence[1].length},}$`);
    if (lastContent === 0 || !closingFence.test(lines[lastContent].trim())) {
      throw new Error("コードブロックの末尾がありません。地図の表を最後まで貼り付けてください。");
    }
    lines = lines.slice(1, lastContent);
    // フェンス直後の空行だけはマスではなく表の前の余白。
    while (lines.length && !lines[0].trim()) lines.shift();
  } else if (lines[lines.length - 1] === "") {
    // 最後の改行で生じた要素だけを除く。末尾のタブや空白行は空きマス。
    lines.pop();
  }
  return lines;
}

function readColumns(header: string[]): string[] {
  // 左上の空欄が省略された見出しも受け付ける。
  if (header[0]?.toLowerCase() === "a") header.unshift("");
  const columns = header.slice(1).map((label) => label.toLowerCase());
  if (columns.length < 1) {
    throw new Error("地図には1列以上の都市マスが必要です。");
  }
  if (columns.length > MAX_CITY_MAP_SIZE) {
    throw new Error(`地図は最大${MAX_CITY_MAP_SIZE}列 × ${MAX_CITY_MAP_SIZE}行です。`);
  }
  if (header[0] !== "" || columns.some((label, index) => label !== String.fromCharCode(97 + index))) {
    throw new Error("列見出しは左上を空欄にし、a から j まで順番に指定してください。");
  }
  return columns;
}

/** タブはマス境界。改行直後の★注記だけは直前の都市へ結合する。 */
function copiedRowCells(lines: string[]): string[] {
  const parts = lines.join("\n").split(/([\t\n])/);
  const cells: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const cell = normalizeCell(parts[index]);
    if (parts[index - 1] === "\n" && /^[★☆]/.test(cell)) {
      const previous = cells.length - 1;
      if (previous < 0 || !cells[previous]) {
        throw new Error("注記の前に都市名がありません。コピーした表の内容を確認してください。");
      }
      cells[previous] += `\n${cell}`;
    } else {
      cells.push(cell);
    }
  }
  return cells;
}

function parseCopiedCityMap(lines: string[]): CityMap {
  const columns = readColumns(lines[0].split("\t").map(normalizeCell));
  const rows: CityMap["rows"] = [];
  let rowLines: string[] = [];
  let rowLabel = "";

  const finishRow = () => {
    if (!rowLabel) return;
    const cells = copiedRowCells(rowLines);
    if (cells.length !== columns.length) {
      throw new Error(`${rowLabel}行目のマス数が見出しと一致しません。空白マスも含めて表全体をコピーしてください。`);
    }
    rows.push({ label: rowLabel, cells });
  };

  for (const line of lines.slice(1)) {
    const numberedRow = line.match(/^[^\S\t]*(\d+)\t(.*)$/);
    if (numberedRow) {
      finishRow();
      if (rows.length >= MAX_CITY_MAP_SIZE) {
        throw new Error(`地図は最大${MAX_CITY_MAP_SIZE}列 × ${MAX_CITY_MAP_SIZE}行です。`);
      }
      rowLabel = numberedRow[1];
      if (rowLabel !== String(rows.length + 1)) {
        throw new Error("行見出しは 1 から 10 まで順番に指定してください。");
      }
      rowLines = [numberedRow[2]];
    } else if (rowLabel) {
      rowLines.push(line);
    } else {
      throw new Error("行番号と都市を含む表を貼り付けてください。");
    }
  }
  finishRow();
  if (!rows.length) {
    throw new Error("行番号と都市を含む表を貼り付けてください。");
  }
  return { columns, rows };
}

function parseMarkdownCityMap(lines: string[]): CityMap {
  lines = lines.filter((line) => line.trim());
  if (lines.length < 3) {
    throw new Error("列見出し、区切り行、1行以上の都市を含む表を貼り付けてください。");
  }
  const columns = readColumns(splitRow(lines[0]));
  if (lines.length - 2 > MAX_CITY_MAP_SIZE) {
    throw new Error(`地図は最大${MAX_CITY_MAP_SIZE}列 × ${MAX_CITY_MAP_SIZE}行です。`);
  }

  const width = columns.length + 1;
  const separator = splitRow(lines[1]);
  if (separator.length !== width || separator.some((cell) => !/^:?-+:?$/.test(cell))) {
    throw new Error("見出しの下には、各列を - で区切る行が必要です。");
  }

  const rows = lines.slice(2).map((line, index) => {
    const row = splitRow(line, width);
    if (row.length !== width) {
      throw new Error(`${index + 1}行目のマス数が見出しと一致しません。空のマスも | で区切ってください。`);
    }
    if (row[0] !== String(index + 1)) {
      throw new Error("行見出しは 1 から 10 まで順番に指定してください。");
    }
    return { label: row[0], cells: row.slice(1) };
  });

  return { columns, rows };
}

/**
 * Read a Markdown table or copied game table with tab/newline cell boundaries.
 * Columns start at a and rows at 1. Empty cells and city notes retain their positions.
 * Returned markup is plain text and must be rendered as text.
 */
export function parseCityMap(source: string): CityMap {
  if (source.length > MAX_CITY_MAP_SOURCE_LENGTH) {
    throw new Error(`地図のテキストは${MAX_CITY_MAP_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内で入力してください。`);
  }
  if (!source.trim()) {
    throw new Error("地図の表を貼り付けてください。");
  }
  const lines = sourceLines(source);
  return lines[0]?.includes("\t") && !lines[0].includes("|")
    ? parseCopiedCityMap(lines)
    : parseMarkdownCityMap(lines);
}
