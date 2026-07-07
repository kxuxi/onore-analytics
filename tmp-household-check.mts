import { prisma } from "./lib/prisma";

async function main() {
  const rows = await prisma.warlord.findMany();
  const target = "梅雨前線";

  // 梅雨前線所属の家督集合
  const houses = new Set<string>();
  for (const r of rows as any[]) {
    if (r.faction?.trim() === target && r.household?.trim()) {
      houses.add(r.household.trim());
    }
  }
  console.log("梅雨前線の家督:", [...houses]);

  // 同じ家督なのに faction が梅雨前線でない武将
  console.log("\n=== 梅雨前線の家督と同じ家督だが faction!=梅雨前線 ===");
  let count = 0;
  for (const r of rows as any[]) {
    const h = r.household?.trim();
    if (h && houses.has(h) && r.faction?.trim() !== target) {
      console.log(`  name="${r.name}" household="${h}" faction="${r.faction ?? ""}" battleAt="${r.battleAt ?? ""}"`);
      count++;
    }
  }
  console.log(`該当: ${count}人`);

  // 全 faction の人数分布（上位）
  const byFaction = new Map<string, number>();
  for (const r of rows as any[]) {
    const f = r.faction?.trim() || "(なし)";
    byFaction.set(f, (byFaction.get(f) ?? 0) + 1);
  }
  console.log("\n=== faction別 DB名簿人数（上位15）===");
  [...byFaction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([f, c]) => console.log(`  ${c}人  ${f}`));

  console.log(`\nDB総武将数: ${rows.length}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
