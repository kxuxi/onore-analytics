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
      latestUpdatedAt={null}
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

function getUpdatedSlot(html: string): string {
  const slot = html.match(
    /<span class="header-updated[^"]*"[^>]*>[^<]*<\/span>/
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

  it("未取得時も同寸の非表示slotを描画する", () => {
    const slot = getUpdatedSlot(renderHeader());

    expect(slot).toContain('class="header-updated muted is-pending"');
    expect(slot).toContain('aria-hidden="true"');
    expect(slot).not.toContain("title=");
    expect(slot).toContain("最終更新 00/00/00 00:00");
  });

  it("登録日時があればtitleと最終更新日時を表示する", () => {
    const updatedAt = new Date(2026, 6, 24, 9, 7).getTime();
    const slot = getUpdatedSlot(renderHeader({ latestUpdatedAt: updatedAt }));

    expect(slot).toContain('class="header-updated muted"');
    expect(slot).not.toContain("is-pending");
    expect(slot).not.toContain("aria-hidden");
    expect(slot).toContain('title="管理者が最後にデータを登録した日時"');
    expect(slot).toContain("最終更新 26/07/24 09:07");
  });
});
