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
import {
  MAX_CITY_SCOUT_SOURCE_LENGTH,
  MAX_CITY_SCOUT_REPORTS,
  normalizeCityScoutName,
  parseCityScoutReports,
  type CityScoutReport,
} from "@/lib/cityScout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/city-map/scouts");

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function scoutsJson(body: unknown, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }));
}

function unauthorized(): NextResponse {
  return scoutsJson({ error: "認証が必要です" }, 401);
}

function accountMismatch(request: Request, accountId: number): NextResponse | null {
  const expectedId = request.headers.get("X-City-Map-Account-Id");
  if (expectedId !== null && expectedId !== String(accountId)) {
    return scoutsJson(
      { error: "ログイン中のアカウントが変わりました。ページを再読み込みしてください。" },
      409
    );
  }
  return null;
}

function restoreReports(rows: { source: string }[]): CityScoutReport[] {
  return rows.flatMap((row) => parseCityScoutReports(row.source));
}

export async function GET(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return unauthorized();
    const mismatch = accountMismatch(request, session.uid);
    if (mismatch) return mismatch;

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true },
    });
    if (!user) return unauthorized();
    const rows = await prisma.$queryRaw<{ source: string }[]>(Prisma.sql`
      SELECT "source" FROM "CityScoutReport" WHERE "userId" = ${session.uid} ORDER BY "cityName" ASC
    `);
    return scoutsJson({ reports: restoreReports(rows) });
  } catch (error) {
    return withNoStore(errorResponse("GET", error));
  }
}

/** 同じ都市はゲーム内の最新年月だけを残し、同年月なら今回の偵察結果を採用する。 */
export async function POST(request: Request) {
  try {
    const session = getSessionUser();
    if (!session) return unauthorized();
    const mismatch = accountMismatch(request, session.uid);
    if (mismatch) return mismatch;

    const body = await readJsonBody(request);
    if (!body.ok) return scoutsJson({ error: INVALID_JSON_BODY_ERROR }, 400);
    if (!isObject(body.value) || Array.isArray(body.value)) {
      return scoutsJson({ error: BODY_MUST_BE_OBJECT_ERROR }, 400);
    }
    if (typeof body.value.source !== "string") {
      return scoutsJson({ error: "偵察結果をテキストで貼り付けてください。" }, 400);
    }
    if (body.value.source.length > MAX_CITY_SCOUT_SOURCE_LENGTH) {
      return scoutsJson({ error: `偵察結果は${MAX_CITY_SCOUT_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内で貼り付けてください。` }, 400);
    }

    let reports: CityScoutReport[];
    try {
      reports = parseCityScoutReports(body.value.source);
      if (reports.length < 1 || reports.length > MAX_CITY_SCOUT_REPORTS) {
        throw new Error(`一度に保存できる偵察結果は1〜${MAX_CITY_SCOUT_REPORTS}件です。`);
      }
    } catch (error) {
      return scoutsJson({ error: error instanceof Error ? error.message : "偵察結果を読み取れませんでした。" }, 400);
    }

    const latest = new Map<string, CityScoutReport>();
    for (const report of reports) {
      const key = normalizeCityScoutName(report.cityName);
      const previous = latest.get(key);
      if (!previous || report.year * 12 + report.month >= previous.year * 12 + previous.month) {
        latest.set(key, report);
      }
    }
    // 複数リクエストで同じ都市を更新しても同じ順序でロックを取得する。
    const entries = [...latest.entries()].sort(([a], [b]) => a.localeCompare(b));
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: session.uid }, select: { id: true } });
      if (!user) return null;

      // DB側で年月を比較するため、別タブや同時通信でも古い結果に巻き戻らない。
      const saved = await tx.$queryRaw<{ cityName: string }[]>(Prisma.sql`
        INSERT INTO "CityScoutReport" ("userId", "cityName", "year", "month", "source", "updatedAt")
        VALUES ${Prisma.join(entries.map(([cityName, report]) => Prisma.sql`
          (${session.uid}, ${cityName}, ${report.year}, ${report.month}, ${report.source}, NOW())
        `))}
        ON CONFLICT ("userId", "cityName") DO UPDATE
        SET "year" = EXCLUDED."year", "month" = EXCLUDED."month",
            "source" = EXCLUDED."source", "updatedAt" = EXCLUDED."updatedAt"
        WHERE ("CityScoutReport"."year", "CityScoutReport"."month") <= (EXCLUDED."year", EXCLUDED."month")
        RETURNING "cityName"
      `);
      const savedKeys = new Set(saved.map((row) => row.cityName));
      const rows = await tx.$queryRaw<{ source: string }[]>(Prisma.sql`
        SELECT "source" FROM "CityScoutReport" WHERE "userId" = ${session.uid} ORDER BY "cityName" ASC
      `);
      return {
        reports: restoreReports(rows),
        savedCityNames: entries.filter(([key]) => savedKeys.has(key)).map(([, report]) => report.cityName),
        skippedCityNames: entries.filter(([key]) => !savedKeys.has(key)).map(([, report]) => report.cityName),
      };
    });
    return result === null ? unauthorized() : scoutsJson(result);
  } catch (error) {
    return withNoStore(errorResponse("POST", error));
  }
}
