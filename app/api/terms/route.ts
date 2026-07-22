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
    const rows = await prisma.battleRecord.findMany({
      distinct: ["term"],
      select: { term: true },
      orderBy: { term: "desc" },
    });
    return NextResponse.json(rows.map((r) => r.term));
  } catch (err) {
    return errorResponse("GET", err);
  }
}
