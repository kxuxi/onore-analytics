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
import { warlordKey } from "@/lib/storage";

export const dynamic = "force-dynamic";

type WarlordRow = WarlordCoreRow & { term: number };

function rowToWarlord(r: WarlordRow): Warlord {
  return { ...warlordCoreRowToDto(r), term: r.term };
}

async function loadMap(): Promise<WarlordMap> {
  const rows = (await prisma.warlord.findMany()) as WarlordRow[];
  const map: WarlordMap = {};
  for (const r of rows) map[warlordKey(r.name, r.term)] = rowToWarlord(r);
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
      // 能力値は「現在の期」の武将へ反映する。既存武将は最新期の行を更新し、
      // 未登録の武将は戦闘履歴上の最新期で新規作成する。
      const latestLogTerm =
        (await prisma.battleRecord.aggregate({ _max: { term: true } }))._max
          .term ?? 145;
      const existing = await prisma.warlord.findMany({
        where: { name: { in: stats.map((s) => s.name) } },
        select: { name: true, term: true },
      });
      const latestTermByName = new Map<string, number>();
      for (const e of existing) {
        const prev = latestTermByName.get(e.name);
        if (prev === undefined || e.term > prev) latestTermByName.set(e.name, e.term);
      }

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
          const term = latestTermByName.get(s.name);
          if (term !== undefined) updated++;
          else created++;
          return prisma.warlord.upsert({
            where: {
              name_term: { name: s.name, term: term ?? latestLogTerm },
            },
            // 既存武将は能力値・自己PRのみ更新（国・兵種など戦闘由来の情報は保持）。
            update: statFields,
            // 新規武将はランキングの国名を faction に補完して作成。
            create: {
              name: s.name,
              term: term ?? latestLogTerm,
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
