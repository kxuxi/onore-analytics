import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import {
  BODY_MUST_BE_OBJECT_ERROR,
  INVALID_JSON_BODY_ERROR,
} from "@/lib/apiRequest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/auth/login");

// ユーザーが存在しない場合もパスワード検証と同等の時間をかけ、
// 応答時間の差からユーザー名を推測されないようにする（タイミング攻撃対策）。
const DUMMY_HASH = hashPassword("timing-attack-dummy-password");

export async function POST(req: Request) {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: INVALID_JSON_BODY_ERROR },
        { status: 400 }
      );
    }
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json(
        { error: BODY_MUST_BE_OBJECT_ERROR },
        { status: 400 }
      );
    }
    const body = raw as { username?: unknown; password?: unknown };
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "ユーザー名とパスワードを入力してください" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });
    const ok = user
      ? verifyPassword(password, user.passwordHash)
      : (verifyPassword(password, DUMMY_HASH), false);
    // ユーザー名の有無を区別しない一律メッセージ（ユーザー列挙の防止）。
    if (!user || !ok) {
      return NextResponse.json(
        { error: "ユーザー名またはパスワードが違います" },
        { status: 401 }
      );
    }

    const token = createSessionToken({ id: user.id, username: user.username });
    cookies().set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(SESSION_TTL_SECONDS)
    );
    return NextResponse.json({
      user: { id: user.id, username: user.username },
    });
  } catch (err) {
    return errorResponse("POST", err);
  }
}
