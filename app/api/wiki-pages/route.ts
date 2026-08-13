import { prisma } from "@/lib/prisma";
import { makeErrorResponse } from "@/lib/apiError";
import { INVALID_JSON_BODY_ERROR, readJsonBody } from "@/lib/apiRequest";
import { requireAdmin } from "@/lib/authGuard";
import { parseWikiPageInput } from "@/lib/wiki";
import { wikiJson, withWikiNoStore } from "@/lib/wikiApiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = makeErrorResponse("api/wiki-pages");

export async function GET() {
  try {
    const denied = requireAdmin();
    if (denied) return withWikiNoStore(denied);

    const pages = await prisma.wikiPage.findMany({
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return wikiJson(pages);
  } catch (error) {
    return withWikiNoStore(errorResponse("GET", error));
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin();
    if (denied) return withWikiNoStore(denied);

    const body = await readJsonBody(request);
    if (!body.ok) {
      return wikiJson(
        { error: INVALID_JSON_BODY_ERROR },
        { status: 400 }
      );
    }
    const input = parseWikiPageInput(body.value);
    if (!input.ok) {
      return wikiJson({ error: input.error }, { status: 400 });
    }

    const page = await prisma.wikiPage.create({ data: input.value });
    return wikiJson(page, { status: 201 });
  } catch (error) {
    return withWikiNoStore(errorResponse("POST", error));
  }
}
