import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  wikiPage: {
    findMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/authGuard", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { wikiPage: mocks.wikiPage },
}));

import {
  GET as listPages,
  POST as createPage,
} from "@/app/api/wiki-pages/route";
import {
  DELETE as deletePage,
  GET as getPage,
  PUT as updatePage,
} from "@/app/api/wiki-pages/[id]/route";

const markdown =
  "# 管理手順\r\n\r\n- 末尾空白を保持  \n\n```ts\nconst enabled = true;\n```\n";
const createdAt = new Date("2026-07-27T01:02:03.000Z");
const updatedAt = new Date("2026-07-28T04:05:06.000Z");

function jsonRequest(
  path: string,
  method: "POST" | "PUT",
  body: unknown
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(method === "PUT"
        ? { "X-Wiki-Updated-At": updatedAt.toISOString() }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest(path: string, method: "POST" | "PUT"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(method === "PUT"
        ? { "X-Wiki-Updated-At": updatedAt.toISOString() }
        : {}),
    },
    body: "{",
  });
}

function context(id: string) {
  return { params: { id } };
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

function expectDatabaseNotCalled() {
  for (const operation of Object.values(mocks.wikiPage)) {
    expect(operation).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockReturnValue(null);
});

describe("Wiki API authorization", () => {
  it.each([
    ["GET /api/wiki-pages", () => listPages()],
    [
      "POST /api/wiki-pages",
      () =>
        createPage(
          jsonRequest("/api/wiki-pages", "POST", {
            title: "管理手順",
            content: markdown,
          })
        ),
    ],
    [
      "GET /api/wiki-pages/1",
      () =>
        getPage(new Request("http://localhost/api/wiki-pages/1"), context("1")),
    ],
    [
      "PUT /api/wiki-pages/1",
      () =>
        updatePage(
          jsonRequest("/api/wiki-pages/1", "PUT", {
            title: "管理手順",
            content: markdown,
          }),
          context("1")
        ),
    ],
    [
      "DELETE /api/wiki-pages/1",
      () =>
        deletePage(
          new Request("http://localhost/api/wiki-pages/1", {
            method: "DELETE",
          }),
          context("1")
        ),
    ],
  ])("%s は未認証時にDBへ触れず401を返す", async (_label, invoke) => {
    mocks.requireAdmin.mockImplementation(() =>
      NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    );

    const response = await invoke();

    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expectDatabaseNotCalled();
  });
});

describe("GET /api/wiki-pages", () => {
  it("本文を含まない更新日時順の一覧を返す", async () => {
    const pages = [
      {
        id: 2,
        title: "新しいページ",
        createdAt,
        updatedAt,
      },
      {
        id: 1,
        title: "古いページ",
        createdAt,
        updatedAt: createdAt,
      },
    ];
    mocks.wikiPage.findMany.mockResolvedValue(pages);

    const response = await listPages();

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    await expect(response.json()).resolves.toEqual([
      {
        id: 2,
        title: "新しいページ",
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
      {
        id: 1,
        title: "古いページ",
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      },
    ]);
  });
});

describe("POST /api/wiki-pages", () => {
  it("Markdown本文を変更せず保存し、作成したページを201で返す", async () => {
    const page = {
      id: 1,
      title: "管理手順",
      content: markdown,
      createdAt,
      updatedAt,
    };
    mocks.wikiPage.create.mockResolvedValue(page);

    const response = await createPage(
      jsonRequest("/api/wiki-pages", "POST", {
        title: "  管理手順  ",
        content: markdown,
      })
    );

    expect(response.status).toBe(201);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.create).toHaveBeenCalledWith({
      data: {
        title: "管理手順",
        content: markdown,
      },
    });
    await expect(response.json()).resolves.toEqual({
      ...page,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("不正な入力を400で拒否し、作成しない", async () => {
    const response = await createPage(
      jsonRequest("/api/wiki-pages", "POST", {
        title: "   ",
        content: markdown,
      })
    );

    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.create).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "タイトルは必須です",
    });
  });

  it("不正なJSONを400で拒否する", async () => {
    const response = await createPage(
      invalidJsonRequest("/api/wiki-pages", "POST")
    );

    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/wiki-pages/[id]", () => {
  it("指定ページのMarkdown本文を変更せず返す", async () => {
    const page = {
      id: 7,
      title: "管理手順",
      content: markdown,
      createdAt,
      updatedAt,
    };
    mocks.wikiPage.findUnique.mockResolvedValue(page);

    const response = await getPage(
      new Request("http://localhost/api/wiki-pages/7"),
      context("7")
    );

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    await expect(response.json()).resolves.toEqual({
      ...page,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("不正なIDを400で拒否してDBへ問い合わせない", async () => {
    const response = await getPage(
      new Request("http://localhost/api/wiki-pages/invalid"),
      context("invalid")
    );

    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.findUnique).not.toHaveBeenCalled();
  });

  it("存在しないページを404で返す", async () => {
    mocks.wikiPage.findUnique.mockResolvedValue(null);

    const response = await getPage(
      new Request("http://localhost/api/wiki-pages/99"),
      context("99")
    );

    expect(response.status).toBe(404);
    expectPrivateNoStore(response);
  });
});

describe("PUT /api/wiki-pages/[id]", () => {
  it("既存ページのタイトルとMarkdown本文を更新する", async () => {
    const page = {
      id: 7,
      title: "更新後",
      content: markdown,
      createdAt,
      updatedAt,
    };
    mocks.wikiPage.updateMany.mockResolvedValue({ count: 1 });
    mocks.wikiPage.findUnique.mockResolvedValue(page);

    const response = await updatePage(
      jsonRequest("/api/wiki-pages/7", "PUT", {
        title: " 更新後 ",
        content: markdown,
      }),
      context("7")
    );

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.updateMany).toHaveBeenCalledWith({
      where: { id: 7, updatedAt },
      data: {
        title: "更新後",
        content: markdown,
      },
    });
    expect(mocks.wikiPage.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    await expect(response.json()).resolves.toEqual({
      ...page,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("不正な入力を400で拒否し、検索も更新もしない", async () => {
    const response = await updatePage(
      jsonRequest("/api/wiki-pages/7", "PUT", {
        title: "",
        content: markdown,
      }),
      context("7")
    );

    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.findUnique).not.toHaveBeenCalled();
    expect(mocks.wikiPage.updateMany).not.toHaveBeenCalled();
  });

  it("存在しないページを404で返して更新しない", async () => {
    mocks.wikiPage.updateMany.mockResolvedValue({ count: 0 });
    mocks.wikiPage.findUnique.mockResolvedValue(null);

    const response = await updatePage(
      jsonRequest("/api/wiki-pages/99", "PUT", {
        title: "管理手順",
        content: markdown,
      }),
      context("99")
    );

    expect(response.status).toBe(404);
    expectPrivateNoStore(response);
  });

  it("別画面で更新済みなら409を返し、後勝ちで上書きしない", async () => {
    mocks.wikiPage.updateMany.mockResolvedValue({ count: 0 });
    mocks.wikiPage.findUnique.mockResolvedValue({ id: 7 });

    const response = await updatePage(
      jsonRequest("/api/wiki-pages/7", "PUT", {
        title: "競合する変更",
        content: markdown,
      }),
      context("7")
    );

    expect(response.status).toBe(409);
    expectPrivateNoStore(response);
    await expect(response.json()).resolves.toEqual({
      error:
        "このWikiページは別の画面で更新されています。再読み込みして変更内容を確認してください",
    });
  });

  it("更新日時ヘッダーがなければ400で拒否する", async () => {
    const request = jsonRequest("/api/wiki-pages/7", "PUT", {
      title: "管理手順",
      content: markdown,
    });
    request.headers.delete("X-Wiki-Updated-At");

    const response = await updatePage(request, context("7"));

    expect(response.status).toBe(400);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/wiki-pages/[id]", () => {
  it("指定ページを削除する", async () => {
    mocks.wikiPage.deleteMany.mockResolvedValue({ count: 1 });

    const response = await deletePage(
      new Request("http://localhost/api/wiki-pages/7", { method: "DELETE" }),
      context("7")
    );

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.wikiPage.deleteMany).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    await expect(response.json()).resolves.toEqual({ ok: true, id: 7 });
  });

  it("存在しないページを404で返す", async () => {
    mocks.wikiPage.deleteMany.mockResolvedValue({ count: 0 });

    const response = await deletePage(
      new Request("http://localhost/api/wiki-pages/99", { method: "DELETE" }),
      context("99")
    );

    expect(response.status).toBe(404);
    expectPrivateNoStore(response);
  });
});
