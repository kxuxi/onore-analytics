import { prisma } from "./lib/prisma";
import { parseBattleLine } from "./lib/parser";
import { mergeWarlords } from "./lib/storage";
import type { Warlord, WarlordMap } from "./lib/types";
import { writeFileSync } from "node:fs";

const PROFILE_KEYS = ["faction", "type", "branch", "unit", "battleAt"] as const;

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const battleRows = await prisma.battleRecord.findMany({ orderBy: { id: "asc" } });
  const warlordRows = await prisma.warlord.findMany();

  // 1. 全戦闘ログを修正後ロジックで再マージ（各武将に term を注入）。
  const incoming: Warlord[] = [];
  for (const r of battleRows as any[]) {
    const line: string = r.raw || r.line || "";
    for (const w of parseBattleLine(line)) {
      incoming.push({ ...w, term: r.term });
    }
  }
  const { map: derived }: { map: WarlordMap } = mergeWarlords({}, incoming);

  // 2. 既存 DB 行のうち、プロフィール5列が再導出結果と食い違うものを抽出。
  type Change = { name: string; before: Record<string, unknown>; after: Record<string, unknown> };
  const changes: Change[] = [];
  const backup: Record<string, unknown>[] = [];

  for (const r of warlordRows as any[]) {
    backup.push({
      name: r.name,
      faction: r.faction ?? null,
      type: r.type,
      branch: r.branch,
      unit: r.unit ?? null,
      battleAt: r.battleAt ?? null,
    });

    const d = derived[r.name];
    if (!d) continue; // 戦闘ログに出てこない武将は触らない

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let differs = false;
    for (const k of PROFILE_KEYS) {
      const cur = (r as any)[k] ?? null;
      const next = (d as any)[k] ?? null;
      if ((cur ?? "") !== (next ?? "")) {
        differs = true;
        before[k] = cur;
        after[k] = next;
      }
    }
    if (differs) changes.push({ name: r.name, before, after });
  }

  console.log(`再導出で更新が必要な武将: ${changes.length}人 / DB総数 ${warlordRows.length}`);
  // faction が変わるものだけ抜粋表示
  const facChanges = changes.filter((c) => "faction" in c.before);
  console.log(`うち faction が変わる: ${facChanges.length}人`);
  for (const c of facChanges.slice(0, 40)) {
    console.log(`  ${c.name}: faction "${c.before.faction}" -> "${c.after.faction}"`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] --apply を付けると更新を実行します。変更はしていません。");
    await prisma.$disconnect();
    return;
  }

  // 3. バックアップ保存
  const backupPath = `/tmp/onore-warlord-profile-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(backup), "utf8");
  console.log(`\nバックアップ保存: ${backupPath}（${backup.length}件）`);

  // 4. プロフィール5列のみ更新（stats/actions/lastActionAt/household/term/updatedAt は保持）
  let applied = 0;
  for (const c of changes) {
    const d = derived[c.name]!;
    await prisma.warlord.update({
      where: { name: c.name },
      data: {
        faction: d.faction ?? null,
        type: d.type,
        branch: d.branch,
        unit: d.unit ?? null,
        battleAt: d.battleAt ?? null,
      },
    });
    applied++;
  }
  console.log(`更新完了: ${applied}件`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
