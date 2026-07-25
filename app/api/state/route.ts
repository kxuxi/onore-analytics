import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { requireAdmin } from "@/lib/authGuard";
import { mergeWarlords } from "@/lib/storage";
import { battleKey } from "@/lib/parser";
import { isObject, readJsonBody } from "@/lib/apiRequest";
import {
  warlordCoreRowToDto,
  type WarlordCoreRow,
} from "@/lib/warlordDto";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";

export const dynamic = "force-dynamic";

type WarlordRow = WarlordCoreRow & {
  household: string | null;
  term: number;
};

function rowToWarlord(r: WarlordRow): Warlord {
  return {
    ...warlordCoreRowToDto(r),
    household: r.household ?? undefined,
    term: r.term,
  };
}

function warlordToRow(w: Warlord) {
  return {
    name: w.name,
    household: w.household ?? null,
    faction: w.faction ?? null,
    type: w.type,
    branch: w.branch,
    unit: w.unit ?? null,
    battleAt: w.battleAt ?? null,
    lastActionAt: w.lastActionAt ?? null,
    actions: w.actions ?? [],
    term: w.term ?? 145,
    updatedAt: BigInt(w.updatedAt),
    // 能力値・自己PRは戦闘登録では変更しないが、既存値を保持するため書き戻す。
    power: w.power ?? null,
    intelligence: w.intelligence ?? null,
    leadership: w.leadership ?? null,
    politics: w.politics ?? null,
    strategy: w.strategy ?? null,
    selfPr: w.selfPr ?? null,
    statsRaw: w.statsRaw ?? null,
  };
}

async function loadMap(names?: ReadonlySet<string>): Promise<WarlordMap> {
  if (names?.size === 0) return {};
  const rows = names
    ? await prisma.warlord.findMany({
        where: { name: { in: Array.from(names) } },
      })
    : await prisma.warlord.findMany();
  const map: WarlordMap = {};
  for (const r of rows as WarlordRow[]) map[r.name] = rowToWarlord(r);
  return map;
}

async function loadLog(term?: number): Promise<BattleRecord[]> {
  const rows = await prisma.battleRecord.findMany({
    where: term != null ? { term } : undefined,
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    line: r.raw || r.line,
    time: r.time ?? undefined,
    term: r.term,
    savedAt: Number(r.savedAt),
  }));
}

const errorResponse = makeErrorResponse("api/state");

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * POST ボディを境界で検証する。受信 JSON の形を信頼せず、配列・必須フィールドを
 * 確認して不正なら 400 を返せるようにする（実行時例外による 500 を防ぐ）。
 */
function parseStateBody(
  body: unknown
): { warlords: Warlord[]; records: BattleRecord[] } | { error: string } {
  if (!isObject(body)) return { error: "リクエストボディはオブジェクトである必要があります" };
  const warlords = body.warlords ?? [];
  const records = body.records ?? [];
  if (!Array.isArray(warlords)) return { error: "warlords は配列である必要があります" };
  if (!Array.isArray(records)) return { error: "records は配列である必要があります" };
  for (const w of warlords) {
    if (
      !isObject(w) ||
      typeof w.name !== "string" ||
      typeof w.type !== "string" ||
      typeof w.branch !== "string" ||
      typeof w.updatedAt !== "number"
    ) {
      return {
        error: "warlords の各要素には name/type/branch（文字列）と updatedAt（数値）が必要です",
      };
    }
  }
  for (const r of records) {
    if (!isObject(r) || typeof r.line !== "string") {
      return { error: "records の各要素には line（文字列）が必要です" };
    }
  }
  return { warlords: warlords as Warlord[], records: records as BattleRecord[] };
}

/**
 * ?term=N クエリを検証して返す。正の整数のときのみその期で絞り込み、
 * 未指定・"all"・不正値は undefined（全期間）を返す（既存 client との後方互換）。
 */
function parseTermParam(req: Request): number | undefined {
  const raw = new URL(req.url).searchParams.get("term");
  if (!raw || raw === "all") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function GET(req: Request) {
  try {
    const term = parseTermParam(req);
    const [db, log] = await Promise.all([loadMap(), loadLog(term)]);
    return NextResponse.json({ db, log });
  } catch (err) {
    return errorResponse("GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const denied = requireAdmin();
    if (denied) return denied;
    const responseTerm = parseTermParam(req);
    const bodyResult = await readJsonBody(req);
    if (!bodyResult.ok) {
      return badRequest("リクエストボディが不正な JSON です");
    }
    const parsed = parseStateBody(bodyResult.value);
    if ("error" in parsed) return badRequest(parsed.error);
    const { warlords, records } = parsed;

    const changedNames = new Set(warlords.map((w) => w.name));
    // マージが参照するのは入力と同名の武将だけ。登録前の全件読み込みを避ける。
    const existing = await loadMap(changedNames);
    const { map, added, updated } = mergeWarlords(existing, warlords);

    await prisma.$transaction(
      Array.from(changedNames).map((name) => {
        const row = warlordToRow(map[name]);
        const { name: _n, ...rest } = row;
        return prisma.warlord.upsert({
          where: { name },
          create: row,
          update: rest,
        });
      })
    );

    // 戦闘履歴に含まれる兵種名を兵種マスタへ自動登録（既存エントリは上書きしない）。
    const newUnitNames = Array.from(
      new Set(warlords.map((w) => w.unit).filter((u): u is string => !!u))
    );
    if (newUnitNames.length > 0) {
      await prisma.unitType.createMany({
        data: newUnitNames.map((name) => ({ name })),
        skipDuplicates: true,
      });
    }

    // 戦闘履歴の追加（戦闘の同一性キーをユニークキーにして重複排除）
    let logAdded = 0;
    let skipped = 0;
    if (records.length > 0) {
      const now = Date.now();
      // 入力内の重複もまとめる（ターン数・URL の有無だけが違う同一戦闘も集約）
      const byKey = new Map<string, { raw: string; time?: string; term: number }>();
      for (const r of records) {
        const key = battleKey(r.line);
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, { raw: r.line, time: r.time, term: r.term });
      }
      const data = Array.from(byKey.entries()).map(([key, v]) => ({
        line: key,
        raw: v.raw,
        time: v.time ?? null,
        term: v.term,
        savedAt: BigInt(now),
      }));
      const result = await prisma.battleRecord.createMany({
        data,
        skipDuplicates: true,
      });
      logAdded = result.count;
      skipped = data.length - logAdded;
    }

    // term 未指定時は従来どおり全期間を返す。登録画面は登録先の期を指定し、
    // 数万件の無関係な履歴を再送しない。
    const [db, log] = await Promise.all([loadMap(), loadLog(responseTerm)]);
    return NextResponse.json({ db, log, added, updated, logAdded, skipped });
  } catch (err) {
    return errorResponse("POST", err);
  }
}

export async function DELETE() {
  try {
    const denied = requireAdmin();
    if (denied) return denied;
    await prisma.battleRecord.deleteMany();
    await prisma.warlord.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse("DELETE", err);
  }
}
