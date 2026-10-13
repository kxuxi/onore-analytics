import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { getSessionUser } from "@/lib/authGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/city-map/reset");

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function resetJson(body: unknown, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }));
}

/** 都市地図の個人データだけを、同じアカウントの一括操作として消去する。 */
export async function POST(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return resetJson({ error: "認証が必要です" }, 401);

    // 破棄操作では表示中のアカウントを必ず確認し、ログイン切替後の古い画面を拒否する。
    const expectedId = request.headers.get("X-City-Map-Account-Id");
    if (expectedId === null) {
      return resetJson({ error: "リセットするアカウントを確認できません。ページを再読み込みしてください。" }, 400);
    }
    if (expectedId !== String(session.uid)) {
      return resetJson({ error: "ログイン中のアカウントが変わりました。ページを再読み込みしてください。" }, 409);
    }

    const reset = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: session.uid },
        data: { cityMapSource: "", cityMapMerchantSettings: Prisma.DbNull },
      });
      if (updated.count === 0) return false;

      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "CityScoutReport" WHERE "userId" = ${session.uid}
      `);
      return true;
    });
    if (!reset) return resetJson({ error: "認証が必要です" }, 401);
    return resetJson({ ok: true });
  } catch (error) {
    return withNoStore(errorResponse("POST", error));
  }
}
