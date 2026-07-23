import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseUnitTypesTsv } from "../lib/unitTypeForm";

const prisma = new PrismaClient();

async function main() {
  const raw = readFileSync(
    join(process.cwd(), "prisma", "seed-unit-types.tsv"),
    "utf8"
  );
  const { units } = parseUnitTypesTsv(raw);
  for (const { name, ...data } of units) {
    await prisma.unitType.upsert({
      where: { name },
      create: { name, ...data },
      update: data,
    });
  }

  console.log(`Seeded ${units.length} unit types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
