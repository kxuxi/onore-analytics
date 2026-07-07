import { prisma } from "./lib/prisma";

function codePoints(s: string): string {
  return [...s].map((ch) => "U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

async function main() {
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });
  const warlordRows = await prisma.warlord.findMany();

  // 戦闘ログ生データから「梅雨前線」を含むトークンを集める（カード内の各 [ ... V.S. ... ] を分解）
  const factionTokens = new Map<string, number>(); // 国位置に現れた「梅雨前線」系トークン
  const nameAfter = new Map<string, number>(); // 梅雨前線 の直後に来た武将名

  for (const r of battleRows as any[]) {
    const line: string = r.raw || r.line || "";
    // [ ... V.S. ... ] を抜き出す
    const m = line.match(/\[([^\]]*)\]/);
    if (!m) continue;
    const inner = m[1];
    const sides = inner.split(/\s+V\.S\.\s+/);
    for (const side of sides) {
      const tokens = side.trim().split(/\s+/);
      if (tokens.length === 0) continue;
      const faction = tokens[0];
      if (faction.includes("梅雨") || faction.includes("前線")) {
        factionTokens.set(faction, (factionTokens.get(faction) ?? 0) + 1);
        if (tokens[1]) nameAfter.set(tokens[1], (nameAfter.get(tokens[1]) ?? 0) + 1);
      }
    }
  }

  console.log("=== 戦闘ログの国位置に現れた『梅雨前線』系トークン（コードポイント付き）===");
  for (const [tok, c] of factionTokens) {
    const exact = tok === "梅雨前線";
    console.log(`  ${c}回  "${tok}"  exact=${exact}  [${codePoints(tok)}]`);
  }

  console.log("\n=== 梅雨前線 直後の武将名（戦闘ログ・出現回数）===");
  [...nameAfter.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, c]) =>
    console.log(`  ${c}回  "${n}"  [${codePoints(n)}]`)
  );
  console.log(`\n戦闘ログ由来の梅雨前線 distinct 武将名: ${nameAfter.size}人`);

  // DB名簿側の faction で「梅雨前線」系を含むものをコードポイント表示
  console.log("\n=== DB名簿 faction に『梅雨前線』系を含むもの（コードポイント付き）===");
  const dbFac = new Map<string, number>();
  for (const r of warlordRows as any[]) {
    const f = (r.faction ?? "").trim();
    if (f.includes("梅雨") || f.includes("前線")) dbFac.set(f, (dbFac.get(f) ?? 0) + 1);
  }
  for (const [f, c] of dbFac) {
    console.log(`  ${c}人  "${f}"  exact=${f === "梅雨前線"}  [${codePoints(f)}]`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
