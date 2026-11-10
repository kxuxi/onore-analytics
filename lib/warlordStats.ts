import type { Warlord } from "./types";

/**
 * 武将ランキング表をコピー＆ペーストしたテキストから能力値を取り込むためのパーサ。
 *
 * ランキングページのテーブルをコピーすると、各行はタブ区切りで概ね次の 16 列になる:
 *   [0]順位 [1]自己PR [2]名前 [3]武力 [4]知力 [5]統率力 [6]政治力 [7]計略(pt)
 *   [8]資金 [9]兵糧 [10]年齢 [11]勝率(%) [12]仕官月数 [13]自己PR(再掲)
 *   [14]階級(例: 元帥(49101)) [15]国名
 *
 * 自己PR が [1] と [13] の 2 箇所に現れるなど環境差があるため、
 * 「名前の直後に 武力〜計略 の数値 5 列が並ぶ」構造から名前列を特定する。
 * 数字が区切りなしで連結された行（タブが失われたコピー）は分割不能のためスキップする。
 */
export interface WarlordStatImport {
  name: string;
  power?: number;
  intelligence?: number;
  leadership?: number;
  politics?: number;
  strategy?: number;
  selfPr?: string;
  /** 取り込み元の生行（未使用項目の保全用）。 */
  raw: string;
  /** 国名（新規作成時の faction 補完に使う）。 */
  faction?: string;
  /** アイコン画像URL（貼り付け時の HTML から補う）。 */
  iconUrl?: string;
}

export interface WarlordStatParseResult {
  /** 取り込めた武将の能力値。 */
  stats: WarlordStatImport[];
  /** 取り込めた行数。 */
  parsed: number;
  /** 区切りが認識できず取り込めなかった行数。 */
  skipped: number;
}

/** "102.5pt" → 102.5、"85pt" → 85。数値として解釈できなければ undefined。 */
function parseDecimal(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const m = token.replace(/[,\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/** "57" → 57。整数として解釈できなければ undefined。 */
function parseInteger(token: string | undefined): number | undefined {
  const n = parseDecimal(token);
  return n === undefined ? undefined : Math.trunc(n);
}

/** トークンが純粋な整数（武力〜政治力の候補）かどうか。 */
function isIntegerToken(token: string | undefined): boolean {
  return token !== undefined && /^\d+$/.test(token.trim());
}

/** トークンが計略の候補（整数/小数・"pt" 付き可）かどうか。 */
function isStrategyToken(token: string | undefined): boolean {
  return token !== undefined && /^\d+(?:\.\d+)?\s*pt?$/i.test(token.trim());
}

/** 1 行をタブ優先・無ければ 2 個以上の空白で列に分割する。 */
function splitColumns(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((s) => s.trim());
  }
  // タブが無い場合でも、2 個以上の空白（全角空白含む）で区切られていれば列とみなす。
  return line.split(/[ \u3000]{2,}/).map((s) => s.trim());
}

/**
 * 列配列から「名前列のインデックス」を推定する。
 * 名前の直後に [武力, 知力, 統率力, 政治力] の整数 4 列と [計略] が並ぶ位置を探す。
 * 先頭の順位列を考慮し、index 0〜2 の範囲で探索する。見つからなければ -1。
 */
function findNameIndex(cols: string[]): number {
  for (let i = 0; i <= 2 && i + 5 < cols.length; i++) {
    const name = cols[i]?.trim();
    if (!name) continue;
    // 名前自体が数値（順位など）なら名前ではない。
    if (/^\d+$/.test(name)) continue;
    if (
      isIntegerToken(cols[i + 1]) &&
      isIntegerToken(cols[i + 2]) &&
      isIntegerToken(cols[i + 3]) &&
      isIntegerToken(cols[i + 4]) &&
      isStrategyToken(cols[i + 5])
    ) {
      return i;
    }
  }
  return -1;
}

/** 能力値が並ばず、ヘッダー語を含む行（タイトル行）かどうか。 */
function isHeaderRow(cols: string[]): boolean {
  if (findNameIndex(cols) >= 0) return false;
  return /順位|武力|統率|政治|計略/.test(cols.join(""));
}

/**
 * ランキング表のテキストをパースして武将の能力値を取り出す。
 * 列がタブ（または 2 個以上の空白）で区切られた行のみ取り込む。
 */
export function parseWarlordStats(text: string): WarlordStatParseResult {
  const stats: WarlordStatImport[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = splitColumns(line);
    if (cols.length < 6) {
      // 列に分割できない（タブ等が無い）行は取り込めない。ヘッダー断片は数えない。
      if (!/^順位|^名前/.test(line)) skipped++;
      continue;
    }
    if (isHeaderRow(cols)) continue;

    const nameIdx = findNameIndex(cols);
    if (nameIdx < 0) {
      skipped++;
      continue;
    }
    const name = cols[nameIdx]?.trim();
    if (!name) {
      skipped++;
      continue;
    }
    const power = parseInteger(cols[nameIdx + 1]);
    const intelligence = parseInteger(cols[nameIdx + 2]);
    const leadership = parseInteger(cols[nameIdx + 3]);
    const politics = parseInteger(cols[nameIdx + 4]);
    const strategy = parseDecimal(cols[nameIdx + 5]);

    // 末尾 2 列を 階級・国名 とみなす。
    const lastIdx = cols.length - 1;
    const faction = cols[lastIdx]?.trim() || undefined;
    // 自己PR は「階級(例: 元帥(49101))」の直前列を優先（後半の再掲列）。
    // 階級列が "(数字)" を含む語であることを確認し、誤検出（勝率や数値）を防ぐ。
    let selfPr: string | undefined;
    const gradeIdx = lastIdx - 1;
    const looksLikeGrade = /.+\(\d+\)\s*$/.test(cols[gradeIdx]?.trim() ?? "");
    if (looksLikeGrade && gradeIdx - 1 > nameIdx + 5) {
      const cand = cols[gradeIdx - 1]?.trim();
      // 数値や百分率（勝率など）は自己PRではない。
      if (cand && !/^\d+(?:\.\d+)?%?$/.test(cand)) selfPr = cand;
    }
    // 後半に無ければ、名前の直前（順位の次）の自己PRを使う。
    if (!selfPr && nameIdx >= 1) {
      const cand = cols[nameIdx - 1]?.trim();
      if (cand && !/^\d+(?:\.\d+)?%?$/.test(cand)) selfPr = cand;
    }

    // 能力値が 1 つも取れない行は不正としてスキップ。
    if (
      power === undefined &&
      intelligence === undefined &&
      leadership === undefined &&
      politics === undefined &&
      strategy === undefined
    ) {
      skipped++;
      continue;
    }
    // 同名は後勝ち（最新の貼り付けを優先）。
    if (seen.has(name)) {
      const idx = stats.findIndex((s) => s.name === name);
      if (idx >= 0) stats.splice(idx, 1);
    }
    seen.add(name);
    stats.push({
      name,
      power,
      intelligence,
      leadership,
      politics,
      strategy,
      selfPr,
      faction,
      raw: rawLine,
    });
  }
  return { stats, parsed: stats.length, skipped };
}

/** Warlord に能力値があるか（表示判定用）。 */
export function hasWarlordStats(w: Warlord | undefined): boolean {
  if (!w) return false;
  return (
    w.power !== undefined ||
    w.intelligence !== undefined ||
    w.leadership !== undefined ||
    w.politics !== undefined ||
    w.strategy !== undefined ||
    (w.selfPr !== undefined && w.selfPr !== "")
  );
}

/** HTML の文字参照をよく使うものだけ復号する。 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 取り込めるアイコンURLか（http/https の絶対URLのみ。data: などは保存しない）。 */
export function isStorableIconUrl(url: string): boolean {
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) && url.length <= 2048;
}

/**
 * ランキング表をコピーしたときのクリップボード HTML から、武将名 → アイコン画像URL を取り出す。
 * 各行（<tr>）の最初の <img src> をアイコン、最初のリンク（<a>）の文字列を武将名とみなす。
 * テキスト貼り付けでは画像が失われるため、貼り付け時の text/html から補う。
 */
export function extractRankingIcons(html: string): Map<string, string> {
  const icons = new Map<string, string>();
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const src = row.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    let url = decodeEntities(src.trim());
    if (url.startsWith("//")) url = `https:${url}`;
    if (!isStorableIconUrl(url)) continue;
    for (const m of Array.from(row.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi))) {
      const name = decodeEntities(m[1].replace(/<[^>]*>/g, "")).trim();
      if (name) {
        icons.set(name, url);
        break;
      }
    }
  }
  return icons;
}
