import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { requireAdmin } from "@/lib/authGuard";
import {
  parseBattleCard,
  isSkewedSide,
  KNOWN_WARLORD_TYPES,
  KNOWN_BRANCHES,
} from "@/lib/parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/battle-records/cleanup-skewed");

/**
 * 項目ずれ（トークンずれ）を起こした戦闘記録と武将を削除する（管理者のみ）。
 * オリジナル兵名や装備名にスペースが混じって項目が 1 つずれ、
 * type に兵種名・branch に装備名が入り込んだデータを対象にする。
 * これらは parseBattleCard が成功してしまうため集計に誤って混入する。
 * 判定はパースした type/branch が既知の値でないこと（isSkewedSide）で行う。
 */
export async function DELETE(_req: NextRequest) {
  const denied = requireAdmin();
  if (denied) return denied;

  try {
    // ずれた戦闘記録の id を収集する。
    // line は重複排除キー（別フォーマット）になりうるため、元の行 raw を優先してパースする。
    const records = await prisma.battleRecord.findMany();
    const ids: number[] = [];
    for (const r of records) {
      const card = parseBattleCard(r.raw || r.line);
      if (!card) continue;
      if (isSkewedSide(card.left) || isSkewedSide(card.right)) {
        ids.push(r.id);
      }
    }

    // ずれて登録された武将も削除する。
    // (1) type/branch が空でなく既知でない（項目ずれ）。
    // (2) name が他武将の faction（＝国名）になっている（武将名の位置に国名が入り、
    //     faction に都市名などが入り込んだ誤り。国一覧に都市名が出る原因）。
    // ※ type/branch が空の武将は能力値ランキングのみの登録＝正常なので残す。
    const warlords = await prisma.warlord.findMany({
      select: { name: true, type: true, branch: true, faction: true },
    });
    // 他の武将の faction として使われている値（＝実在する国名）の集合。
    const factionSet = new Set(
      warlords.map((w) => w.faction?.trim()).filter((f): f is string => !!f)
    );
    const warlordNames = warlords
      .filter(
        (w) =>
          (w.type !== "" && !KNOWN_WARLORD_TYPES.has(w.type)) ||
          (w.branch !== "" && !KNOWN_BRANCHES.has(w.branch)) ||
          factionSet.has(w.name.trim())
      )
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
