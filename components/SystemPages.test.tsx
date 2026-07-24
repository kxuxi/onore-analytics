import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";

describe("システムページの見出し階層", () => {
  it("エラー画面のページ見出しをh1で表示する", () => {
    const markup = renderToStaticMarkup(
      <ErrorPage error={new Error("test")} reset={vi.fn()} />
    );

    expect(markup).toContain(
      '<h1 class="page-state-title">問題が発生しました</h1>'
    );
    expect(markup).not.toContain("<h2");
  });

  it("404画面のページ見出しをh1で表示する", () => {
    const markup = renderToStaticMarkup(<NotFound />);

    expect(markup).toContain(
      '<h1 class="page-state-title">ページが見つかりません</h1>'
    );
    expect(markup).not.toContain("<h2");
  });
});
