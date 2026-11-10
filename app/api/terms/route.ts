import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const errorResponse = makeErrorResponse("api/terms");

/**
 * 戦闘履歴に存在する期番号の一覧（新しい順）を返す軽量エンドポイント。
 * 期セレクタの選択肢を、全戦闘履歴（数万件・数十MB）を転送せずに構築するために使う。
 */
export async function GET() {
  try {
    // term の索引を「最大値 → それより小さい最大値 → …」と辿り、期の数だけの
    // 索引参照で一覧を作る（DISTINCT だと全戦闘履歴を走査してしまう）。
    const rows = await prisma.$queryRaw<{ term: number }[]>`
      WITH RECURSIVE t AS (
        SELECT MAX("term") AS term FROM "BattleRecord"
        UNION ALL
        SELECT (SELECT MAX("term") FROM "BattleRecord" WHERE "term" < t.term)
        FROM t WHERE t.term IS NOT NULL
      )
      SELECT term FROM t WHERE term IS NOT NULL ORDER BY term DESC
    `;
    return NextResponse.json(rows.map((r) => Number(r.term)));
  } catch (err) {
    return errorResponse("GET", err);
  }
}
