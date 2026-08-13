import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { requireAdmin } from "@/lib/authGuard";
import {
  BODY_MUST_BE_OBJECT_ERROR,
  INVALID_JSON_BODY_ERROR,
  isObject,
  readJsonBody,
} from "@/lib/apiRequest";
import {
  warlordCoreRowToDto,
  type WarlordCoreRow,
} from "@/lib/warlordDto";
import type { Warlord, WarlordMap } from "@/lib/types";

export const dynamic = "force-dynamic";

type WarlordRow = WarlordCoreRow;

function rowToWarlord(r: WarlordRow): Warlord {
  return warlordCoreRowToDto(r);
}

async function loadMap(): Promise<WarlordMap> {
  const rows = (await prisma.warlord.findMany()) as WarlordRow[];
  const map: WarlordMap = {};
  for (const r of rows) map[r.name] = rowToWarlord(r);
  return map;
}

const errorResponse = makeErrorResponse("api/warlord-stats");

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

interface StatInput {
  name: string;
  power?: number;
  intelligence?: number;
  leadership?: number;
  politics?: number;
  strategy?: number;
  selfPr?: string;
  maxTroops?: number;
  faction?: string;
  raw?: string;
}

/** 取り込み能力値の入力を境界で検証する。 */
function parseBody(body: unknown): { stats: StatInput[] } | { error: string } {
  if (!isObject(body)) return { error: BODY_MUST_BE_OBJECT_ERROR };
  const stats = body.stats;
  if (!Array.isArray(stats)) return { error: "stats は配列である必要があります" };
  const optionalNumber = (v: unknown) => v === undefined || typeof v === "number";
  for (const s of stats) {
    if (!isObject(s) || typeof s.name !== "string" || !s.name.trim()) {
      return { error: "stats の各要素には name（非空文字列）が必要です" };
    }
    if (
      !optionalNumber(s.power) ||
      !optionalNumber(s.intelligence) ||
      !optionalNumber(s.leadership) ||
      !optionalNumber(s.politics) ||
      !optionalNumber(s.strategy) ||
      !optionalNumber(s.maxTroops)
    ) {
      return { error: "能力値は数値である必要があります" };
    }
  }
  return { stats: stats as StatInput[] };
}

export async function POST(req: Request) {
  try {
    const denied = requireAdmin();
    if (denied) return denied;
    const bodyResult = await readJsonBody(req);
    if (!bodyResult.ok) {
      return badRequest(INVALID_JSON_BODY_ERROR);
    }
    const parsed = parseBody(bodyResult.value);
    if ("error" in parsed) return badRequest(parsed.error);
    const { stats } = parsed;

    const now = Date.now();
    let updated = 0;
    let created = 0;

    if (stats.length > 0) {
      const existing = await prisma.warlord.findMany({
        where: { name: { in: stats.map((s) => s.name) } },
        select: { name: true },
      });
      const existingNames = new Set(existing.map((e) => e.name));

      await prisma.$transaction(
        stats.map((s) => {
          const statFields = {
            power: s.power ?? null,
            intelligence: s.intelligence ?? null,
            leadership: s.leadership ?? null,
            politics: s.politics ?? null,
            strategy: s.strategy ?? null,
            selfPr: s.selfPr ?? null,
            maxTroops: s.maxTroops ?? null,
            statsRaw: s.raw ?? null,
          };
          if (existingNames.has(s.name)) updated++;
          else created++;
          return prisma.warlord.upsert({
            where: { name: s.name },
            // 既存武将は能力値・自己PRのみ更新（国・兵種など戦闘由来の情報は保持）。
            update: statFields,
            // 新規武将はランキングの国名を faction に補完して作成。
            create: {
              name: s.name,
              faction: s.faction ?? null,
              type: "",
              branch: "",
              updatedAt: BigInt(now),
              ...statFields,
            },
          });
        })
      );
    }

    const db = await loadMap();
    return NextResponse.json({ db, updated, created });
  } catch (err) {
    return errorResponse("POST", err);
  }
}
