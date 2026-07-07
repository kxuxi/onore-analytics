import { prisma } from "./lib/prisma";
import { parseBattleLine } from "./lib/parser";

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });

  console.log("=== 実日付(MM/DD) と 在ゲーム年 の対応（各MM/DDの最小〜最大在ゲーム年・term）===");
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
  for (const k of [...byMmdd.keys()].sort()) {
    const e = byMmdd.get(k)!;
    console.log(`  ${k}: 在ゲーム年 ${Math.min(...e.years)}〜${Math.max(...e.years)}  term=${[...e.terms].join(",")}  件数${e.years.length}`);
  }

  for (const who of ["今夜が山田", "ホロスケ", "かたつむり", "湿舌"]) {
    console.log(`\n=== ${who} の全戦闘（登録ID順）===`);
    for (const r of battleRows as any[]) {
      const line: string = r.raw || r.line || "";
      if (!line.includes(who)) continue;
      for (const w of parseBattleLine(line)) {
        if (w.name === who) {
          console.log(`  id=${r.id} 在="${w.battleAt ?? ""}" term=${r.term} 国="${w.faction ?? ""}"`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
