import { prisma } from "./lib/prisma";
import type { BattleRecord, WarlordMap, Warlord } from "./lib/types";
import { factionMemberStats } from "./lib/stats";

async function main() {
  const warlordRows = await prisma.warlord.findMany();
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });

  const db: WarlordMap = {};
  for (const r of warlordRows as any[]) {
    db[r.name] = {
      name: r.name,
      household: r.household ?? undefined,
      faction: r.faction ?? undefined,
      type: r.type,
      branch: r.branch,
      unit: r.unit ?? undefined,
      battleAt: r.battleAt ?? undefined,
      term: r.term,
      updatedAt: Number(r.updatedAt),
    } as Warlord;
  }

  const log: BattleRecord[] = (battleRows as any[]).map((r) => ({
    id: r.id,
    line: r.raw || r.line,
    time: r.time ?? undefined,
    term: r.term,
    savedAt: Number(r.savedAt),
  }));

  // すべての faction 名を列挙（DB名簿 + 戦闘ログ）
  const allFactions = new Map<string, number>();
  for (const w of Object.values(db)) {
    const f = w.faction?.trim();
    if (f) allFactions.set(f, (allFactions.get(f) ?? 0) + 1);
  }
  console.log("=== DB名簿の faction 一覧（梅雨/前線を含むもの）===");
  for (const [f, c] of allFactions) {
    if (f.includes("梅雨") || f.includes("前線")) {
      console.log(`  "${f}": DB名簿 ${c}人`);
    }
  }

  const target = "梅雨前線";
  console.log(`\n=== target="${target}" ===`);
  const dbMembers = Object.values(db)
    .filter((w) => w.faction?.trim() === target)
    .map((w) => w.name.trim());
  console.log(`DB名簿で faction==="${target}" の武将: ${dbMembers.length}人`);

  const statMembers = factionMemberStats(log, target).map((s) => s.name);
  console.log(`factionMemberStats（戦闘ログ由来）: ${statMembers.length}人`);

  const dbSet = new Set(dbMembers);
  const statSet = new Set(statMembers);

  const inDbNotInStats = dbMembers.filter((n) => !statSet.has(n));
  const inStatsNotInDb = statMembers.filter((n) => !dbSet.has(n));

  console.log(`\nDB名簿にいるが戦闘ログ由来メンバーに出てこない（=表示されない現所属武将）: ${inDbNotInStats.length}人`);
  console.log(inDbNotInStats);

  console.log(`\n戦闘ログ由来メンバーにいるがDB名簿の現所属ではない（=過去在籍など）: ${inStatsNotInDb.length}人`);
  console.log(inStatsNotInDb);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
