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

  const target = "梅雨前線";

  console.log("=== DB名簿で faction==='梅雨前線' ===");
  for (const w of Object.values(db)) {
    if (w.faction?.trim() === target) {
      console.log(`  name="${w.name}" household="${w.household ?? ""}" battleAt="${w.battleAt ?? ""}"`);
    }
  }

  console.log("\n=== household/name に '梅雨前線' を含むDB名簿（faction不問）===");
  for (const w of Object.values(db)) {
    if (w.household?.includes("梅雨前線") || w.name.includes("梅雨前線")) {
      console.log(`  name="${w.name}" household="${w.household ?? ""}" faction="${w.faction ?? ""}"`);
    }
  }

  console.log("\n=== factionMemberStats（戦闘ログ由来）詳細 ===");
  for (const s of factionMemberStats(log, target)) {
    const w = db[s.name];
    console.log(`  name="${s.name}" battles=${s.battles} DBfaction="${w?.faction ?? "(DB未登録)"}" DBhousehold="${w?.household ?? ""}"`);
  }

  console.log("\n=== 戦闘ログ生データ中の '梅雨前線' を含む行（最大12件）===");
  let shown = 0;
  for (const r of log) {
    if (r.line.includes("梅雨前線") && shown < 12) {
      console.log("  [" + r.id + "] " + r.line.replace(/\n/g, " / ").slice(0, 240));
      shown++;
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
