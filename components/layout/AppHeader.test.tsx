import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("メニュー開閉ボタンと対象sidebarを関連付ける", () => {
    const html = renderToStaticMarkup(
      <AppHeader
        sidebarId="app-sidebar"
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        onSelectHome={vi.fn()}
        lastFetchedAt={null}
        resolvedTheme="light"
        onToggleTheme={vi.fn()}
        refreshing={false}
        hydrated
        onRefresh={vi.fn()}
        linkCopied={false}
        onShareLink={vi.fn()}
      />
    );

    expect(html).toContain('aria-controls="app-sidebar"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="メニューを開く"');
  });
});
