import { Prisma } from "@prisma/client";
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
import { parseMerchantSettings, type MerchantSettings } from "@/lib/cityMapMerchants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/city-map/merchant-settings");

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function settingsJson(body: unknown, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }));
}

function unauthorized(): NextResponse {
  return settingsJson({ error: "認証が必要です" }, 401);
}

function accountMismatch(request: Request, accountId: number): NextResponse | null {
  const expectedId = request.headers.get("X-City-Map-Account-Id");
  if (expectedId !== null && expectedId !== String(accountId)) {
    return settingsJson(
      { error: "ログイン中のアカウントが変わりました。ページを再読み込みしてください。" },
      409
    );
  }
  return null;
}

/** 行商予測の年月はログイン中のアカウントだけから読み出す。 */
export async function GET(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return unauthorized();
    const mismatch = accountMismatch(request, session.uid);
    if (mismatch) return mismatch;

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { cityMapMerchantSettings: true },
    });
    if (!user) return unauthorized();
    const settings = user.cityMapMerchantSettings === null
      ? null
      : parseMerchantSettings(user.cityMapMerchantSettings);
    return settingsJson({ settings });
  } catch (error) {
    return withNoStore(errorResponse("GET", error));
  }
}

/** セッションのアカウントへ検証済みの予測年月を保存する。 */
export async function PUT(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return unauthorized();
    const mismatch = accountMismatch(request, session.uid);
    if (mismatch) return mismatch;

    const body = await readJsonBody(request);
    if (!body.ok) return settingsJson({ error: INVALID_JSON_BODY_ERROR }, 400);
    if (!isObject(body.value) || Array.isArray(body.value)) {
      return settingsJson({ error: BODY_MUST_BE_OBJECT_ERROR }, 400);
    }
    let settings: MerchantSettings | null;
    try {
      settings = body.value.settings === null ? null : parseMerchantSettings(body.value.settings);
    } catch (error) {
      return settingsJson(
        { error: error instanceof Error ? error.message : "行商予測の年月が不正です" },
        400
      );
    }

    const updated = await prisma.user.updateMany({
      where: { id: session.uid },
      data: { cityMapMerchantSettings: settings === null ? Prisma.DbNull : { ...settings } },
    });
    if (updated.count === 0) return unauthorized();
    return settingsJson({ settings });
  } catch (error) {
    return withNoStore(errorResponse("PUT", error));
  }
}
