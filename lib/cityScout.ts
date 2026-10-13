export const MAX_CITY_SCOUT_SOURCE_LENGTH = 50_000;
export const MAX_CITY_SCOUT_REPORTS = 100;

export interface CityScoutCapacity {
  current: number;
  max: number;
}

export interface CityScoutForce {
  names: string;
  count: number | null;
}

export interface CityScoutReport {
  cityName: string;
  faction: string;
  cityType: string;
  year: number;
  month: number;
  population: number | null;
  publicOrder: number | null;
  agriculture: CityScoutCapacity | null;
  commerce: CityScoutCapacity | null;
  technology: CityScoutCapacity | null;
  wall: CityScoutCapacity | null;
  garrison: CityScoutCapacity | null;
  marketRate: number | null;
  facilities: string[] | null;
  funds: number | null;
  rice: number | null;
  defenders: CityScoutForce | null;
  patrol: CityScoutForce | null;
  navalDefenders: CityScoutForce | null;
  source: string;
}

/** 表記幅と余白だけを揃える。都市名の誤字や別名は推測しない。 */
export function normalizeCityScoutName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

const FIELD_NAMES = [
  "守備兵数", "海上守備", "都市資金", "都市兵糧", "人口", "治安", "農業", "商業",
  "技術", "城壁", "相場", "施設", "守備", "警備",
] as const;
type FieldName = (typeof FIELD_NAMES)[number];
const FIELD_PATTERN = new RegExp(`(?<!\\S)(${FIELD_NAMES.join("|")})\\s*:\\s*`, "g");

function invalidField(label: string): never {
  throw new Error(`${label}の値を読み取れませんでした。偵察結果の数値を確認してください。`);
}

function integer(value: string, label: string): number {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return invalidField(label);
  const parsed = Number(text.replace(/,/g, ""));
  if (!Number.isSafeInteger(parsed)) return invalidField(label);
  return parsed;
}

function optionalInteger(value: string, label: string): number | null {
  return value.trim() ? integer(value, label) : null;
}

function capacity(value: string, label: string): CityScoutCapacity | null {
  if (!value.trim()) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return invalidField(label);
  return { current: integer(parts[0], label), max: integer(parts[1], label) };
}

function force(value: string, label: string): CityScoutForce | null {
  if (!value.trim()) return null;
  const counted = value.match(/^(.*?)\s*\((.*?)人\)\s*$/);
  if (counted) return { names: counted[1].trim(), count: optionalInteger(counted[2], label) };
  // 括弧付き人数の不正を、人数不明として黙って受け付けない。
  if (/\([^()]*人\)?\s*$/.test(value)) return invalidField(label);
  return { names: value.trim(), count: null };
}

function assignField(report: CityScoutReport, label: FieldName, value: string): void {
  switch (label) {
    case "人口":
      report.population = optionalInteger(value.replace(/人\s*$/, ""), label);
      break;
    case "治安": report.publicOrder = optionalInteger(value, label); break;
    case "農業": report.agriculture = capacity(value, label); break;
    case "商業": report.commerce = capacity(value, label); break;
    case "技術": report.technology = capacity(value, label); break;
    case "城壁": report.wall = capacity(value, label); break;
    case "守備兵数": report.garrison = capacity(value, label); break;
    case "相場": {
      if (!value.trim()) { report.marketRate = null; break; }
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return invalidField(label);
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return invalidField(label);
      report.marketRate = parsed;
      break;
    }
    case "施設": report.facilities = value.trim() ? value.trim().split(/\s+/) : null; break;
    case "都市資金": report.funds = optionalInteger(value, label); break;
    case "都市兵糧": report.rice = optionalInteger(value, label); break;
    case "守備": report.defenders = force(value, label); break;
    case "警備": report.patrol = force(value, label); break;
    case "海上守備": report.navalDefenders = force(value, label); break;
  }
}

function unwrapSource(source: string): string[] {
  const lines = source.replace(/\r\n?/g, "\n").trim().split("\n");
  const fence = lines[0].trim().match(/^(`{3,}|~{3,})[^`~]*$/);
  if (!fence) return lines;
  const closingFence = new RegExp(`^${fence[1][0]}{${fence[1].length},}$`);
  if (lines.length < 2 || !closingFence.test(lines[lines.length - 1].trim())) {
    throw new Error("コードブロックの末尾がありません。偵察結果を最後まで貼り付けてください。");
  }
  return lines.slice(1, -1);
}

/** 一度の貼り付けに複数都市がある場合も、各都市の年月と原文を独立して保持する。 */
export function parseCityScoutReports(source: string): CityScoutReport[] {
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("ゲーム内年月と都市名を含む偵察結果を貼り付けてください。");
  }
  if (source.length > MAX_CITY_SCOUT_SOURCE_LENGTH) {
    throw new Error(`偵察結果は${MAX_CITY_SCOUT_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内で貼り付けてください。`);
  }

  const reports: CityScoutReport[] = [];
  let date: { year: number; month: number; source: string } | null = null;
  let pendingDate = false;
  let current: { report: CityScoutReport; lines: string[]; fields: Set<FieldName> } | null = null;

  const finishReport = () => {
    if (!current) return;
    current.report.source = current.lines.join("\n").trim();
    reports.push(current.report);
    if (reports.length > MAX_CITY_SCOUT_REPORTS) {
      throw new Error(`一度に貼り付けられる偵察結果は${MAX_CITY_SCOUT_REPORTS}都市までです。`);
    }
    current = null;
  };

  for (const rawLine of unwrapSource(source)) {
    const line = rawLine.normalize("NFKC").trim();
    const dateMatch = line.match(/^(.+?)\s*年\s*(.*?)\s*月$/);
    if (dateMatch) {
      if (pendingDate) throw new Error("年月の後に都市名がありません。偵察結果を確認してください。");
      finishReport();
      const year = integer(dateMatch[1], "ゲーム内の年");
      const month = integer(dateMatch[2], "ゲーム内の月");
      if (year < 1 || year > 9999 || month < 1 || month > 12) {
        throw new Error("ゲーム内年月は1〜9999年、1〜12月で指定してください。");
      }
      date = { year, month, source: rawLine.trim() };
      pendingDate = true;
      continue;
    }

    const header = line.match(/^(.*?)\s*\[(.*?)\]\s*:\s*(.*)$/);
    if (header) {
      finishReport();
      if (!date) throw new Error("都市情報の前にゲーム内年月（例: 1634年 9月）を付けてください。");
      const cityName = normalizeCityScoutName(header[1]);
      if (!cityName) throw new Error("偵察結果に都市名がありません。");
      current = {
        report: {
          cityName, faction: header[2].trim(), cityType: header[3].trim(),
          year: date.year, month: date.month,
          population: null, publicOrder: null, agriculture: null, commerce: null,
          technology: null, wall: null, garrison: null, marketRate: null,
          facilities: null, funds: null, rice: null, defenders: null, patrol: null,
          navalDefenders: null, source: "",
        },
        lines: [date.source, rawLine],
        fields: new Set<FieldName>(),
      };
      pendingDate = false;
      continue;
    }

    if (!current) continue;
    current.lines.push(rawLine);
    const fields = [...line.matchAll(FIELD_PATTERN)];
    if (fields[0]?.index !== 0) continue;
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index];
      const label = field[1] as FieldName;
      if (current.fields.has(label)) {
        throw new Error(`${current.report.cityName}の${label}が重複しています。偵察結果ごとに年月と都市名を付けてください。`);
      }
      current.fields.add(label);
      const value = line.slice(field.index! + field[0].length, fields[index + 1]?.index).trim();
      assignField(current.report, label, value);
    }
  }
  finishReport();
  if (pendingDate || !reports.length) {
    throw new Error("年月と「都市名 [所属] : 都市種別」を含む偵察結果を貼り付けてください。");
  }
  return reports;
}
