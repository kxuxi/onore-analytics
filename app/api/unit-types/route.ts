import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { requireAdmin } from "@/lib/authGuard";
import type { UnitType } from "@/lib/types";

export const dynamic = "force-dynamic";

const errorResponse = makeErrorResponse("api/unit-types");

function normalize(body: Partial<UnitType>): Omit<UnitType, "name"> {
  return {
    category: (body.category ?? "").toString(),
    goodAgainst: (body.goodAgainst ?? "").toString(),
    attack: Number(body.attack ?? 0) || 0,
    defense: Number(body.defense ?? 0) || 0,
    cost: (body.cost ?? "").toString(),
    tech: (body.tech ?? "").toString(),
    years: (body.years ?? "").toString(),
    reqStats: (body.reqStats ?? "").toString(),
    facility: (body.facility ?? "").toString(),
    special: (body.special ?? "").toString(),
    bonus: (body.bonus ?? "").toString(),
  };
}

export async function GET() {
  try {
    const rows = await prisma.unitType.findMany({
      orderBy: { id: "asc" },
    });
    const list: UnitType[] = rows.map((r) => ({
      name: r.name,
      category: r.category,
      goodAgainst: r.goodAgainst,
      attack: r.attack,
      defense: r.defense,
      cost: r.cost,
      tech: r.tech,
      years: r.years,
      reqStats: r.reqStats,
      facility: r.facility,
      special: r.special,
      bonus: r.bonus,
    }));
    return NextResponse.json(list);
  } catch (err) {
    return errorResponse("GET", err);
  }
}

// 兵種を upsert（名前が被ったら上書き、無ければ追加）
export async function POST(req: Request) {
  try {
    const denied = requireAdmin();
    if (denied) return denied;
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: "リクエストボディが不正な JSON です" },
        { status: 400 }
      );
    }
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json(
        { error: "リクエストボディはオブジェクトである必要があります" },
        { status: 400 }
      );
    }
    const body = raw as Partial<UnitType>;
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "name は必須です" }, { status: 400 });
    }
    const data = normalize(body);
    const row = await prisma.unitType.upsert({
      where: { name },
      create: { name, ...data },
      update: data,
    });
    return NextResponse.json(row);
  } catch (err) {
    return errorResponse("POST", err);
  }
}

// 一度に取り込める兵種の上限（貼り付けミスでの大量書き込みを防ぐ）
const BULK_MAX_UNITS = 2000;

// 兵種を一括 upsert（貼り付け取り込み用）。
// 名前が一致する兵種は上書き、無ければ追加する。一覧に無い既存の兵種は削除しない。
export async function PUT(req: Request) {
  try {
    const denied = requireAdmin();
    if (denied) return denied;
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: "リクエストボディが不正な JSON です" },
        { status: 400 }
      );
    }
    // 生の配列 or { units: [...] } のどちらでも受け付ける。
    const list = Array.isArray(raw)
      ? raw
      : raw &&
          typeof raw === "object" &&
          Array.isArray((raw as { units?: unknown }).units)
        ? (raw as { units: unknown[] }).units
        : null;
    if (!list) {
      return NextResponse.json(
        { error: "units 配列が必要です" },
        { status: 400 }
      );
    }
    if (list.length === 0) {
      return NextResponse.json(
        { error: "取り込む兵種がありません" },
        { status: 400 }
      );
    }
    if (list.length > BULK_MAX_UNITS) {
      return NextResponse.json(
        { error: `一度に取り込める兵種は${BULK_MAX_UNITS}件までです` },
        { status: 400 }
      );
    }
    const seen = new Set<string>();
    const ops = [];
    for (const item of list) {
      if (typeof item !== "object" || item === null) {
        return NextResponse.json(
          { error: "各兵種はオブジェクトである必要があります" },
          { status: 400 }
        );
      }
      const body = item as Partial<UnitType>;
      const name = (body.name ?? "").toString().trim();
      if (!name) {
        return NextResponse.json(
          { error: "name が空の兵種があります" },
          { status: 400 }
        );
      }
      // 同名が複数あれば最初の 1 件のみ（同一トランザクション内の重複更新を避ける）。
      if (seen.has(name)) continue;
      seen.add(name);
      const data = normalize(body);
      ops.push(
        prisma.unitType.upsert({
          where: { name },
          create: { name, ...data },
          update: data,
        })
      );
    }
    await prisma.$transaction(ops);
    return NextResponse.json({ ok: true, count: ops.length });
  } catch (err) {
    return errorResponse("PUT", err);
  }
}
