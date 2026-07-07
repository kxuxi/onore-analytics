import { prisma } from "./lib/prisma";
import { parseBattleCard } from "./lib/parser";

function gameOrder(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*年\s*(\d+)\s*月/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });
  const warlordRows = await prisma.warlord.findMany();
  const dbFac = new Map<string, string>();
  for (const r of warlordRows as any[]) dbFac.set(r.name, (r.faction ?? "").trim());

  // term優先の真の現プロフィール
  type Best = { term: number; go: number; faction: string };
  const best = new Map<string, Best>();
  for (const r of battleRows as any[]) {
    const line: string = r.raw || r.line || "";
    const card = parseBattleCard(line);
    if (!card) continue;
    const term: number = r.term;
    const go = gameOrder(card.battleAt) ?? -1;
    for (const side of ["left", "right"] as const) {
      const s = card[side];
      const name = s.name?.trim();
      if (!name) continue;
      const faction = s.faction?.trim() ?? "";
      const cur = best.get(name);
      if (!cur || term > cur.term || (term === cur.term && go > cur.go)) {
        best.set(name, { term, go, faction });
      }
    }
  }

  // 現DB faction（=Phase3結果）と term優先の正しい faction を比較
  let mismatch = 0;
  const examples: string[] = [];
  for (const [name, b] of best) {
    const db = dbFac.get(name);
    if (db === undefined) continue; // DB未登録は対象外
    if ((b.faction || "") !== (db || "")) {
      mismatch++;
      if (examples.length < 25) examples.push(`  ${name}: DB(Phase3)="${db}" → 正しい(term優先)="${b.faction}"`);
    }
  }
  console.log(`DB登録があり、現DB faction が term優先の正しい現所属と食い違う武将: ${mismatch}人`);
  console.log(examples.join("\n"));

  // 影響を受ける「正しい現所属」別の集計（どの国にメンバーが戻るか）
  const gained = new Map<string, number>();
  for (const [name, b] of best) {
    const db = dbFac.get(name);
    if (db === undefined) continue;
    if ((b.faction || "") !== (db || "") && b.faction) {
      gained.set(b.faction, (gained.get(b.faction) ?? 0) + 1);
    }
  }
  console.log("\n=== 修正で正しい現所属に戻る人数（国別・上位15）===");
  [...gained.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([f, c]) => console.log(`  +${c}  ${f}`));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
