import { prisma } from "./lib/prisma";
import { parseBattleLine } from "./lib/parser";
import { mergeWarlords } from "./lib/storage";
import type { Warlord } from "./lib/types";

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });
  const incoming: Warlord[] = [];
  for (const r of battleRows as any[]) {
    const line: string = r.raw || r.line || "";
    for (const w of parseBattleLine(line)) incoming.push({ ...w, term: r.term });
  }
  const { map: derived } = mergeWarlords({}, incoming);

  const warlordRows = await prisma.warlord.findMany();
  const dbByName = new Map<string, any>();
  for (const r of warlordRows as any[]) dbByName.set(r.name, r);

  for (const who of ["ナナ🌟", "Sugi", "ルクレール"]) {
    const d = derived[who];
    const db = dbByName.get(who);
    console.log(`\n===== ${who} =====`);
    console.log(`  DB:       faction="${db?.faction ?? "(未登録)"}" battleAt="${db?.battleAt ?? ""}" term=${db?.term}`);
    console.log(`  derived:  faction="${d?.faction ?? "(なし)"}" battleAt="${d?.battleAt ?? ""}" term=${d?.term}`);
    // この名前で parseBattleLine が拾った全戦闘（term/在ゲーム年/国）を新しい順
    type Row = { term: number; ba: string; faction: string; go: number };
    const rows: Row[] = [];
    for (const r of battleRows as any[]) {
      const line: string = r.raw || r.line || "";
      if (!line.includes(who)) continue;
      for (const w of parseBattleLine(line)) {
        if (w.name === who) {
          const m = (w.battleAt ?? "").match(/(\d+)\s*年\s*(\d+)\s*月/);
          rows.push({ term: r.term, ba: w.battleAt ?? "", faction: w.faction ?? "(なし)", go: m ? Number(m[1]) * 12 + Number(m[2]) : -1 });
        }
      }
    }
    rows.sort((a, b) => (b.term - a.term) || (b.go - a.go));
    console.log(`  parseBattleLine 由来の最新5件:`);
    for (const r of rows.slice(0, 5)) console.log(`    term=${r.term} go=${r.go} 国=${r.faction} "${r.ba}"`);
    // faction 別の最大(term,go)
    const byFac = new Map<string, { term: number; go: number }>();
    for (const r of rows) {
      const c = byFac.get(r.faction);
      if (!c || r.term > c.term || (r.term === c.term && r.go > c.go)) byFac.set(r.faction, { term: r.term, go: r.go });
    }
    console.log(`  faction別の最新(term,go):`);
    for (const [f, v] of [...byFac.entries()].sort((a, b) => (b[1].term - a[1].term) || (b[1].go - a[1].go))) {
      console.log(`    ${f}: term=${v.term} go=${v.go}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
