import { prisma } from "./lib/prisma";
import { readFileSync } from "node:fs";

async function main() {
  const backup: { name: string; faction: string | null }[] = JSON.parse(
    readFileSync("/tmp/onore-warlord-profile-backup-1782617165193.json", "utf8")
  );
  const beforeFac = new Map<string, string>();
  for (const b of backup) beforeFac.set(b.name, (b.faction ?? "").trim());

  const rows = await prisma.warlord.findMany();
  const afterFac = new Map<string, string>();
  for (const r of rows as any[]) afterFac.set(r.name, (r.faction ?? "").trim());

  const target = "梅雨前線";

  const beforeMembers = [...beforeFac.entries()].filter(([, f]) => f === target).map(([n]) => n);
  const afterMembers = [...afterFac.entries()].filter(([, f]) => f === target).map(([n]) => n);
  console.log(`修復前の梅雨前線所属: ${beforeMembers.length}人`, beforeMembers);
  console.log(`修復後の梅雨前線所属: ${afterMembers.length}人`, afterMembers);

  const afterSet = new Set(afterMembers);
  const movedOut = beforeMembers.filter((n) => !afterSet.has(n));
  console.log(`\n修復で梅雨前線から外れた武将: ${movedOut.length}人`);
  for (const n of movedOut) {
    console.log(`  "${n}": ${beforeFac.get(n)} -> ${afterFac.get(n)}`);
  }

  const beforeSet = new Set(beforeMembers);
  const movedIn = afterMembers.filter((n) => !beforeSet.has(n));
  console.log(`\n修復で梅雨前線に入った武将: ${movedIn.length}人`);
  for (const n of movedIn) console.log(`  "${n}": ${beforeFac.get(n)} -> ${afterFac.get(n)}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
