import type { UnitType } from "./types";

/** 兵種フォームの初期値（新規追加用） */
export const EMPTY_UNIT: UnitType = {
  name: "",
  category: "",
  goodAgainst: "",
  attack: 0,
  defense: 0,
  cost: "",
  tech: "",
  years: "",
  reqStats: "",
  facility: "",
  special: "",
  bonus: "",
};

/** 必要能力値セレクタの基本候補 */
export const BASE_STAT_OPTIONS = ["統率", "武力", "知力", "政治"];

/** 雇用コストの通貨候補（金 / 米） */
export const COST_CURRENCIES = ["金", "米"];

/** "弓兵:壁:" のような区切り文字列を ["弓兵", "壁"] に分解 */
export function splitGoodAgainst(value: string): string[] {
  return value
    .split(/[:：]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "武力:40" を { stat: "武力", num: "40" } に分解 */
export function parseReqStats(value: string): { stat: string; num: string } {
  const m = value.match(/^\s*([^:：]+)[:：]\s*(.*)$/);
  if (m) return { stat: m[1].trim(), num: m[2].trim() };
  return { stat: value.trim(), num: "" };
}

/** ステータス名と数値を "武力:40" 形式に再構成 */
export function composeReqStats(stat: string, num: string): string {
  const s = stat.trim();
  if (!s) return "";
  return `${s}:${num.trim()}`;
}

/** "金:600" を { currency: "金", amount: "600" } に分解（区切りが無ければ金額のみ扱い） */
export function parseCost(value: string): { currency: string; amount: string } {
  const m = value.match(/^\s*([^:：\d-]+)[:：]\s*(.*)$/);
  if (m) return { currency: m[1].trim(), amount: m[2].trim() };
  return { currency: COST_CURRENCIES[0], amount: value.trim() };
}

/** 通貨と金額を "金:600" 形式に再構成（金額が空なら空文字） */
export function composeCost(currency: string, amount: string): string {
  const a = amount.trim();
  if (!a) return "";
  const c = (currency || COST_CURRENCIES[0]).trim();
  return `${c}:${a}`;
}

/** "36年" から数値部分 "36" を取り出す */
export function parseYears(value: string): string {
  const m = value.match(/(\d+)/);
  return m ? m[1] : "";
}

/** 数値を "36年" 形式に再構成（空なら空文字） */
export function composeYears(num: string): string {
  const n = num.trim();
  if (!n) return "";
  return `${n}年`;
}

/* ---------- 兵種一覧の一括取り込み（TSV パース） ---------- */

/** ヘッダー行に現れる語（兵種名としては存在しないので無視する） */
const UNIT_HEADER_TOKENS = new Set(["名前", "種類", "兵種", "[%]", "能力値"]);

/** 一括取り込み用に必要な最小列数（兵種名/種類/得意兵種/攻撃/防御）。
 *  これ未満の行はタブ区切りでない貼り付けとみなしてスキップする。 */
const UNIT_MIN_COLUMNS = 5;

export interface ParsedUnitTypes {
  /** 取り込む兵種（同名は後勝ち＝最後に出てきた行で上書き） */
  units: UnitType[];
  /** 取り込む兵種数（= units.length） */
  parsed: number;
  /** データ行に見えるが取り込めなかった行数（列不足・攻撃が非数値など） */
  skipped: number;
}

/** 兵種一覧の貼り付けテキスト（TSV）を UnitType[] に変換する。
 *  列順は seed-unit-types.tsv と同じ：
 *  兵種名 / 種類 / 得意兵種 / 攻撃 / 防御 / 雇用金 / 技術 / 年数 / 必要能力値 / 施設・国宝 / 特殊攻撃 / ボーナス。
 *  ヘッダー行・空行は無視し、同名は後勝ちで 1 件にまとめる。 */
export function parseUnitTypesTsv(text: string): ParsedUnitTypes {
  const byName = new Map<string, UnitType>();
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const name = (cols[0] ?? "").trim();
    // ヘッダー語・空名の行は静かに無視する。
    if (!name || UNIT_HEADER_TOKENS.has(name)) continue;
    // タブ区切りでない（列が少なすぎる）行はスキップして数える。
    if (cols.length < UNIT_MIN_COLUMNS) {
      skipped += 1;
      continue;
    }
    // 攻撃列が数値でなければ不正なデータ行とみなしてスキップ。
    const attackRaw = (cols[3] ?? "").trim();
    if (attackRaw !== "" && Number.isNaN(Number(attackRaw))) {
      skipped += 1;
      continue;
    }
    byName.set(name, {
      name,
      category: (cols[1] ?? "").trim(),
      goodAgainst: (cols[2] ?? "").trim(),
      attack: Number(cols[3] ?? 0) || 0,
      defense: Number(cols[4] ?? 0) || 0,
      cost: (cols[5] ?? "").trim(),
      tech: (cols[6] ?? "").trim(),
      years: (cols[7] ?? "").trim(),
      reqStats: (cols[8] ?? "").trim(),
      facility: (cols[9] ?? "").trim(),
      special: (cols[10] ?? "").trim(),
      bonus: (cols[11] ?? "").trim(),
    });
  }
  const units = Array.from(byName.values());
  return { units, parsed: units.length, skipped };
}
