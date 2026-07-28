import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { readJsonBody } from "@/lib/apiRequest";
import { requireAdmin } from "@/lib/authGuard";
import {
  parseWikiPageId,
  parseWikiPageInput,
  parseWikiPageUpdatedAt,
} from "@/lib/wiki";
import { wikiJson, withWikiNoStore } from "@/lib/wikiApiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/wiki-pages/[id]");
type RouteContext = { params: { id: string } };

function validPageId(context: RouteContext): number | null {
  return parseWikiPageId(context.params.id);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const denied = requireAdmin();
    if (denied) return withWikiNoStore(denied);

    const id = validPageId(context);
    if (id === null) {
      return wikiJson({ error: "WikiページIDが不正です" }, { status: 400 });
    }

    const page = await prisma.wikiPage.findUnique({ where: { id } });
    if (!page) {
      return wikiJson(
        { error: "Wikiページが見つかりません" },
        { status: 404 }
      );
    }
    return wikiJson(page);
  } catch (error) {
    return withWikiNoStore(errorResponse("GET", error));
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const denied = requireAdmin();
    if (denied) return withWikiNoStore(denied);

    const id = validPageId(context);
    if (id === null) {
      return wikiJson({ error: "WikiページIDが不正です" }, { status: 400 });
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
      return wikiJson(
        { error: "リクエストボディが不正なJSONです" },
        { status: 400 }
      );
    }
    const input = parseWikiPageInput(body.value);
    if (!input.ok) {
      return wikiJson({ error: input.error }, { status: 400 });
    }

    const expectedUpdatedAt = parseWikiPageUpdatedAt(
      request.headers.get("X-Wiki-Updated-At")
    );
    if (!expectedUpdatedAt) {
      return wikiJson(
        { error: "更新前のWikiページ日時が不正です" },
        { status: 400 }
      );
    }

    const updateResult = await prisma.wikiPage.updateMany({
      where: { id, updatedAt: expectedUpdatedAt },
      data: input.value,
    });
    if (updateResult.count === 0) {
      const existingPage = await prisma.wikiPage.findUnique({
        where: { id },
        select: { id: true },
      });
      return wikiJson(
        existingPage
          ? {
              error:
                "このWikiページは別の画面で更新されています。再読み込みして変更内容を確認してください",
            }
          : { error: "Wikiページが見つかりません" },
        { status: existingPage ? 409 : 404 }
      );
    }

    const page = await prisma.wikiPage.findUnique({ where: { id } });
    if (!page) {
      return wikiJson(
        { error: "Wikiページが見つかりません" },
        { status: 404 }
      );
    }
    return wikiJson(page);
  } catch (error) {
    return withWikiNoStore(errorResponse("PUT", error));
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = requireAdmin();
    if (denied) return withWikiNoStore(denied);

    const id = validPageId(context);
    if (id === null) {
      return wikiJson({ error: "WikiページIDが不正です" }, { status: 400 });
    }

    const result = await prisma.wikiPage.deleteMany({ where: { id } });
    if (result.count === 0) {
      return wikiJson(
        { error: "Wikiページが見つかりません" },
        { status: 404 }
      );
    }
    return wikiJson({ ok: true, id });
  } catch (error) {
    return withWikiNoStore(errorResponse("DELETE", error));
  }
}
