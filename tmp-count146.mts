import { prisma } from "./lib/prisma";
import { parseBattleCard } from "./lib/parser";

function gameOrder(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*年\s*(\d+)\s*月/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });

  // 各武将の (term, gameOrder) 最大の戦闘＝真の現プロフィールを求める
  type Best = { term: number; go: number; faction: string; ba: string };
  const best = new Map<string, Best>();
  // 各 term の faction 別参加者
  const termFactionMembers = new Map<number, Map<string, Set<string>>>();

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
      // 真の現プロフィール候補
      const cur = best.get(name);
      if (!cur || term > cur.term || (term === cur.term && go > cur.go)) {
        best.set(name, { term, go, faction, ba: card.battleAt ?? "" });
      }
      // term別 faction別 参加者
      if (faction) {
        let fm = termFactionMembers.get(term);
        if (!fm) { fm = new Map(); termFactionMembers.set(term, fm); }
        let set = fm.get(faction);
        if (!set) { set = new Set(); fm.set(faction, set); }
        set.add(name);
      }
    }
  }

  const target = "梅雨前線";
  for (const term of [...termFactionMembers.keys()].sort((a, b) => a - b)) {
    const set = termFactionMembers.get(term)!.get(target);
    console.log(`term=${term}: 梅雨前線 旗で戦った武将 ${set?.size ?? 0}人  ${set ? [...set].join(", ") : ""}`);
  }

  // term優先で「現所属＝梅雨前線」になる武将
  const correctMembers = [...best.entries()].filter(([, b]) => b.faction === target).map(([n]) => n);
  console.log(`\n【term優先】現所属が梅雨前線の武将: ${correctMembers.length}人`);
  console.log("  " + correctMembers.join(", "));

  // term146 で梅雨前線旗で戦った武将のうち、真の現所属が梅雨前線でない者（=途中で抜けた）
  const t146 = termFactionMembers.get(146)?.get(target) ?? new Set<string>();
  const leftDuringT146 = [...t146].filter((n) => best.get(n)?.faction !== target);
  console.log(`\nterm146で梅雨前線旗だが、term146内での最終所属は別国: ${leftDuringT146.length}人`);
  for (const n of leftDuringT146) console.log(`  ${n} -> ${best.get(n)?.faction} ("${best.get(n)?.ba}")`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
