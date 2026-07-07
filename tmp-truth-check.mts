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

  for (const who of ["各務原池", "今夜が山田", "ホロスケ"]) {
    console.log(`\n===== ${who} （現在のDB faction="${dbFac.get(who) ?? "(未登録)"}"） =====`);
    type Row = { id: number; term: number; ba: string; faction: string; unit: string; branch: string; side: string; go: number | null };
    const rows: Row[] = [];
    for (const r of battleRows as any[]) {
      const line: string = r.raw || r.line || "";
      if (!line.includes(who)) continue;
      const card = parseBattleCard(line);
      if (!card) continue;
      for (const side of ["left", "right"] as const) {
        const s = card[side];
        if (s.name?.trim() === who) {
          rows.push({
            id: r.id, term: r.term, ba: card.battleAt ?? "",
            faction: s.faction?.trim() ?? "", unit: s.unit?.trim() ?? "", branch: s.branch?.trim() ?? "",
            side: side === "left" ? "攻" : "守", go: gameOrder(card.battleAt),
          });
        }
      }
    }
    // 期×在ゲーム年で並べ替え（真の最新を見る）
    const sorted = [...rows].sort((a, b) => (b.term - a.term) || ((b.go ?? -1) - (a.go ?? -1)));
    console.log("--- term DESC, 在ゲーム年 DESC（真の最新が先頭）---");
    for (const r of sorted.slice(0, 6)) {
      console.log(`  term=${r.term} ${r.side} "${r.ba}" 国=${r.faction} 兵科=${r.branch} 兵種=${r.unit}`);
    }
    // Phase3ロジック（在ゲーム年のみ DESC）でのトップ
    const byGameYear = [...rows].sort((a, b) => ((b.go ?? -1) - (a.go ?? -1)));
    const p3 = byGameYear[0];
    const truth = sorted[0];
    console.log(`  >> Phase3採用(在年のみ): term=${p3?.term} 国=${p3?.faction} 兵科=${p3?.branch} 兵種=${p3?.unit}  ("${p3?.ba}")`);
    console.log(`  >> 正しい採用(期優先):   term=${truth?.term} 国=${truth?.faction} 兵科=${truth?.branch} 兵種=${truth?.unit}  ("${truth?.ba}")`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
