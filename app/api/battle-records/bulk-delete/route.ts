import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { requireAdmin } from "@/lib/authGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/battle-records/bulk-delete");

/** 1 リクエストで受け付ける ID 数の上限（過大な削除の抑止）。 */
const MAX_BULK_DELETE = 50000;
/** deleteMany 1 回あたりの ID 数（DB のバインド変数上限対策で分割する）。 */
const DELETE_CHUNK = 5000;

/**
 * 戦闘記録を ID の配列でまとめて削除する（管理者のみ）。
 * 「戦闘履歴」タブの表示中（絞り込み結果）の一括削除に使う。
 * 集計・戦績は battleLog から動的算出されるため、クライアント側の state 更新で反映される。
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    const rawIds: unknown = body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json(
        { error: "削除対象の戦闘記録IDがありません" },
        { status: 400 }
      );
    }
    if (rawIds.length > MAX_BULK_DELETE) {
      return NextResponse.json(
        { error: `一度に削除できるのは${MAX_BULK_DELETE}件までです` },
        { status: 400 }
      );
    }
    // 整数のみ・重複除去。
    const ids = Array.from(
      new Set(rawIds.filter((v): v is number => Number.isInteger(v)))
    );
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "有効な戦闘記録IDがありません" },
        { status: 400 }
      );
    }

    let deleted = 0;
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
      const chunk = ids.slice(i, i + DELETE_CHUNK);
      const result = await prisma.battleRecord.deleteMany({
        where: { id: { in: chunk } },
      });
      deleted += result.count;
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return errorResponse("POST", err);
  }
}
