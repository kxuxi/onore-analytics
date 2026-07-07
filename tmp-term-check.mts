import { prisma } from "./lib/prisma";
import { parseBattleLine } from "./lib/parser";

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });

  // 実日付(MM/DD) -> 在ゲーム年 の対応を俯瞰（termリセット検出）
  console.log("=== 実日付(MM/DD) と 在ゲーム年 の対応（戦闘ログ全体・各MM/DDの最小/最大在ゲーム年）===");
  const byMmdd = new Map<string, { years: number[]; terms: Set<number> }>();
  for (const r of battleRows as any[]) {
    const line: string = r.raw || r.line || "";
    const ym = line.match(/(\d+)\s*年\s*(\d+)\s*月/);
    const md = line.match(/(\d{1,2})\/(\d{1,2})\s+\d{1,2}:\d{2}/);
    if (!ym || !md) continue;
    const gameYear = parseInt(ym[1], 10);
    const key = `${md[1].padStart(2, "0")}/${md[2].padStart(2, "0")}`;
    let e = byMmdd.get(key);
    if (!e) { e = { years: [], terms: new Set() }; byMmdd.set(key, e); }
    e.years.push(gameYear);
    if (r.term != null) e.terms.add(r.term);
  }
  const keys = [...byMmdd.keys()].sort();
  for (const k of keys) {
    const e = byMmdd.get(k)!;
    const min = Math.min(...e.years), max = Math.max(...e.years);
    console.log(`  ${k}: 在ゲーム年 ${min}〜${max}  term=${[...e.terms].join(",")}  件数${e.years.length}`);
  }

  // 今夜が山田 / ホロスケ の全戦闘（実日付・在ゲーム年・term・国）
  for (const who of ["今夜が山田", "ホロスケ", "かたつむり"]) {
    console.log(`\n=== ${who} の全戦闘 ===`);
    for (const r of battleRows as any[]) {
      const line: string = r.raw || r.line || "";
      if (!line.includes(who)) continue;
      const parsed = parseBattleLine(line, r.term ?? 145, r.time ?? undefined);
      for (const w of parsed?.warlords ?? []) {
        if (w.name === who) {
          console.log(`  在="${w.battleAt ?? ""}" term=${r.term} 国="${w.faction ?? ""}" 兵科=${w.branch ?? ""}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
