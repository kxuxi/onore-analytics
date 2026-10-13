import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import {
  BODY_MUST_BE_OBJECT_ERROR,
  INVALID_JSON_BODY_ERROR,
  isObject,
  readJsonBody,
} from "@/lib/apiRequest";
import { getSessionUser } from "@/lib/authGuard";
import { MAX_CITY_MAP_SOURCE_LENGTH, parseCityMap } from "@/lib/cityMap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/city-map");

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function cityMapJson(body: unknown, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }));
}

function unauthorized(): NextResponse {
  return cityMapJson({ error: "認証が必要です" }, 401);
}

function accountMismatch(request: Request, accountId: number): NextResponse | null {
  const expectedId = request.headers.get("X-City-Map-Account-Id");
  if (expectedId !== null && expectedId !== String(accountId)) {
    return cityMapJson(
      { error: "ログイン中のアカウントが変わりました。ページを再読み込みしてください。" },
      409
    );
  }
  return null;
}

/** ログイン中のアカウントに保存された地図のみを返す。 */
export async function GET(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return unauthorized();
    const mismatch = accountMismatch(request, session.uid);
    if (mismatch) return mismatch;

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { cityMapSource: true },
    });
    if (!user) return unauthorized();
    return cityMapJson({ source: user.cityMapSource });
  } catch (error) {
    return withNoStore(errorResponse("GET", error));
  }
}

/** 地図の更新先は署名済みセッションから決め、リクエストのIDは使わない。 */
export async function PUT(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return unauthorized();
    const mismatch = accountMismatch(request, session.uid);
    if (mismatch) return mismatch;

    const body = await readJsonBody(request);
    if (!body.ok) {
      return cityMapJson({ error: INVALID_JSON_BODY_ERROR }, 400);
    }
    if (!isObject(body.value) || Array.isArray(body.value)) {
      return cityMapJson({ error: BODY_MUST_BE_OBJECT_ERROR }, 400);
    }
    const { source } = body.value;
    if (typeof source !== "string") {
      return cityMapJson({ error: "source は文字列である必要があります" }, 400);
    }
    if (source.length > MAX_CITY_MAP_SOURCE_LENGTH) {
      return cityMapJson(
        { error: `都市地図は${MAX_CITY_MAP_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内で入力してください` },
        400
      );
    }
    if (source !== "") {
      try {
        parseCityMap(source);
      } catch (error) {
        return cityMapJson(
          { error: error instanceof Error ? error.message : "都市地図の形式が不正です" },
          400
        );
      }
    }

    // updateMany は削除済みアカウントでも例外を投げず、安全に401を返せる。
    const updated = await prisma.user.updateMany({
      where: { id: session.uid },
      data: { cityMapSource: source },
    });
    if (updated.count === 0) return unauthorized();
    return cityMapJson({ source });
  } catch (error) {
    return withNoStore(errorResponse("PUT", error));
  }
}
