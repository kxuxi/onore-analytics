import { prisma } from "./lib/prisma";
import { parseBattleLine } from "./lib/parser";
import { parseBattleCard } from "./lib/parser";

function go(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*年\s*(\d+)\s*月/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });
  for (const who of ["ナナ🌟", "Sugi", "ルクレール"]) {
    console.log(`\n===== ${who} =====`);
    type Row = { id: number; term: number; ba: string; faction: string; go: number | null; src: string };
    const rows: Row[] = [];
    for (const r of battleRows as any[]) {
      const line: string = r.raw || r.line || "";
      if (!line.includes(who)) continue;
      // parseBattleLine（heal が使う経路）
      for (const w of parseBattleLine(line)) {
        if (w.name === who) rows.push({ id: r.id, term: r.term, ba: w.battleAt ?? "", faction: w.faction ?? "(なし)", go: go(w.battleAt), src: "line" });
      }
      // parseBattleCard（scope が使う経路）
      const card = parseBattleCard(line);
      if (card) for (const side of ["left", "right"] as const) {
        const s = card[side];
        if (s.name?.trim() === who) rows.push({ id: r.id, term: r.term, ba: card.battleAt ?? "", faction: s.faction?.trim() || "(なし)", go: go(card.battleAt), src: "card." + side });
      }
    }
    const sorted = [...rows].sort((a, b) => (b.term - a.term) || ((b.go ?? -1) - (a.go ?? -1)) || (b.id - a.id));
    for (const r of sorted.slice(0, 8)) {
      console.log(`  [${r.src}] id=${r.id} term=${r.term} go=${r.go} 国=${r.faction} "${r.ba}"`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
