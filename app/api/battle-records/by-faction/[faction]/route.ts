import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { requireAdmin } from "@/lib/authGuard";
import { parseBattleCard } from "@/lib/parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/battle-records/by-faction");

/**
 * 指定した国（勢力）を削除する（管理者のみ）。
 * - その国が左右どちらかで登場する戦闘記録をすべて削除する。
 *   両陣営で戦った記録なので、相手国の履歴からも消える点に注意。
 * - その国に所属する武将（DB 名簿）も削除し、国一覧から完全に消す。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { faction: string } }
) {
  const denied = requireAdmin();
  if (denied) return denied;

  try {
    const faction = decodeURIComponent(params.faction).trim();
    if (!faction) {
      return NextResponse.json(
        { error: "国名が指定されていません" },
        { status: 400 }
      );
    }

    const records = await prisma.battleRecord.findMany();
    const ids: number[] = [];
    for (const r of records) {
      const card = parseBattleCard(r.line);
      if (!card) continue;
      if (
        card.left.faction?.trim() === faction ||
        card.right.faction?.trim() === faction
      ) {
        ids.push(r.id);
      }
    }

    // その国に所属する武将（DB 名簿）も削除する。戦歴がない国も対象。
    const warlords = await prisma.warlord.findMany({
      select: { name: true, faction: true },
    });
    const warlordNames = warlords
      .filter((w) => w.faction?.trim() === faction)
      .map((w) => w.name);

    const [recordResult, warlordResult] = await prisma.$transaction([
      prisma.battleRecord.deleteMany({ where: { id: { in: ids } } }),
      prisma.warlord.deleteMany({ where: { name: { in: warlordNames } } }),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: recordResult.count,
      deletedWarlords: warlordResult.count,
    });
  } catch (err) {
    return errorResponse("DELETE", err);
  }
}
