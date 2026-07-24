import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

function renderHeader(
  overrides: Partial<ComponentProps<typeof AppHeader>> = {}
): string {
  return renderToStaticMarkup(
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
      {...overrides}
    />
  );
}

function getFetchedSlot(html: string): string {
  const slot = html.match(
    /<span class="header-fetched[^"]*"[^>]*>[^<]*<\/span>/
  )?.[0];

  expect(slot).toBeDefined();
  return slot ?? "";
}

describe("AppHeader", () => {
  it("メニュー開閉ボタンと対象sidebarを関連付ける", () => {
    const closedHtml = renderHeader();
    const openHtml = renderHeader({ sidebarOpen: true });

    expect(closedHtml).toContain('aria-controls="app-sidebar"');
    expect(closedHtml).toContain('aria-expanded="false"');
    expect(closedHtml).toContain('aria-label="メニューを開く"');
    expect(openHtml).toContain('aria-controls="app-sidebar"');
    expect(openHtml).toContain('aria-expanded="true"');
    expect(openHtml).toContain('aria-label="メニューを閉じる"');
  });

  it("取得前も同寸の非表示slotを描画する", () => {
    const slot = getFetchedSlot(renderHeader());

    expect(slot).toContain('class="header-fetched muted is-pending"');
    expect(slot).toContain('aria-hidden="true"');
    expect(slot).not.toContain("title=");
    expect(slot).toContain("最終取得 00:00");
  });

  it("取得後は従来のtitleと時刻を表示する", () => {
    const fetchedAt = new Date(2026, 6, 24, 9, 7).getTime();
    const slot = getFetchedSlot(renderHeader({ lastFetchedAt: fetchedAt }));

    expect(slot).toContain('class="header-fetched muted"');
    expect(slot).not.toContain("is-pending");
    expect(slot).not.toContain("aria-hidden");
    expect(slot).toContain('title="共有DBを最後に取得した時刻"');
    expect(slot).toContain("最終取得 09:07");
  });
});
