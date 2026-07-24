import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  resolveSidebarOpen,
  SIDEBAR_DESKTOP_MIN_WIDTH,
  SIDEBAR_DESKTOP_QUERY,
  SIDEBAR_INIT_SCRIPT,
  SIDEBAR_STORAGE_KEY,
} from "./sidebarLayout";

const PREFERENCE_CASES: Array<{
  label: string;
  value: string | null;
  expected: boolean;
}> = [
  { label: "未保存", value: null, expected: true },
  { label: "1", value: "1", expected: true },
  { label: "0", value: "0", expected: false },
  { label: "不正値", value: "invalid", expected: false },
  { label: "空文字", value: "", expected: false },
  { label: "空白付き1", value: " 1 ", expected: false },
];

type MatchMediaMode =
  | "desktop"
  | "mobile"
  | "missing"
  | "throw"
  | "null"
  | "invalid";

function runInitScript({
  matchMediaMode,
  readPreference,
  viewportWidth,
}: {
  matchMediaMode: MatchMediaMode;
  readPreference: () => string | null;
  viewportWidth?: number;
}) {
  const dataset: Record<string, string> = {};
  const getItem = vi.fn(readPreference);
  const browserWindow: {
    localStorage: { getItem: typeof getItem };
    matchMedia?: ReturnType<typeof vi.fn>;
  } = {
    localStorage: { getItem },
    ...(viewportWidth == null ? {} : { innerWidth: viewportWidth }),
  };

  if (matchMediaMode !== "missing") {
    browserWindow.matchMedia = vi.fn((query: string) => {
      if (matchMediaMode === "throw") {
        throw new Error("matchMedia unavailable");
      }
      if (matchMediaMode === "null") return null;
      if (matchMediaMode === "invalid") return {};
      expect(query).toBe(SIDEBAR_DESKTOP_QUERY);
      return { matches: matchMediaMode === "desktop" };
    });
  }

  runInNewContext(SIDEBAR_INIT_SCRIPT, {
    window: browserWindow,
    document: { documentElement: { dataset } },
  });

  return {
    initial: dataset.sidebarInitial,
    getItem,
    matchMedia: browserWindow.matchMedia,
  };
}

describe("resolveSidebarOpen", () => {
  it.each(PREFERENCE_CASES)(
    "Desktopの$labelを既存契約どおり判定する",
    ({ value, expected }) => {
      const readPreference = vi.fn(() => value);

      expect(resolveSidebarOpen(true, readPreference)).toBe(expected);
      expect(readPreference).toHaveBeenCalledOnce();
    }
  );

  it("Desktopで保存値を読めない場合は開く", () => {
    const readPreference = vi.fn(() => {
      throw new Error("localStorage unavailable");
    });

    expect(resolveSidebarOpen(true, readPreference)).toBe(true);
    expect(readPreference).toHaveBeenCalledOnce();
  });

  it.each(PREFERENCE_CASES)(
    "Mobileでは$labelを読まず常に閉じる",
    ({ value }) => {
      const readPreference = vi.fn(() => value);

      expect(resolveSidebarOpen(false, readPreference)).toBe(false);
      expect(readPreference).not.toHaveBeenCalled();
    }
  );

  it("Mobileではreaderが例外を投げる場合も呼び出さない", () => {
    const readPreference = vi.fn(() => {
      throw new Error("呼び出されてはいけない");
    });

    expect(resolveSidebarOpen(false, readPreference)).toBe(false);
    expect(readPreference).not.toHaveBeenCalled();
  });
});

describe("SIDEBAR_INIT_SCRIPT", () => {
  it.each(PREFERENCE_CASES)(
    "Desktopの$labelをpure判定と同じdata属性へ反映する",
    ({ value, expected }) => {
      const result = runInitScript({
        matchMediaMode: "desktop",
        readPreference: () => value,
      });

      expect(result.initial).toBe(expected ? "open" : "closed");
      expect(result.getItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY);
      expect(result.getItem).toHaveBeenCalledOnce();
      expect(result.matchMedia).toHaveBeenCalledOnce();
    }
  );

  it("Desktopで保存値を読めない場合はopenにする", () => {
    const result = runInitScript({
      matchMediaMode: "desktop",
      readPreference: () => {
        throw new Error("localStorage unavailable");
      },
    });

    expect(result.initial).toBe("open");
    expect(result.getItem).toHaveBeenCalledOnce();
  });

  it.each(PREFERENCE_CASES)(
    "Mobileでは$labelを読まずclosedにする",
    ({ value }) => {
      const result = runInitScript({
        matchMediaMode: "mobile",
        readPreference: () => value,
      });

      expect(result.initial).toBe("closed");
      expect(result.getItem).not.toHaveBeenCalled();
    }
  );

  it("Mobileではreaderが例外を投げる場合も呼び出さない", () => {
    const result = runInitScript({
      matchMediaMode: "mobile",
      readPreference: () => {
        throw new Error("呼び出されてはいけない");
      },
    });

    expect(result.initial).toBe("closed");
    expect(result.getItem).not.toHaveBeenCalled();
  });

  it.each(["missing", "throw", "null", "invalid"] as const)(
    "matchMediaが%sで幅も不明な場合は保存値を読まずclosedへ収束する",
    (matchMediaMode) => {
      const result = runInitScript({
        matchMediaMode,
        readPreference: () => "1",
      });

      expect(result.initial).toBe("closed");
      expect(result.getItem).not.toHaveBeenCalled();
    }
  );

  it.each(["missing", "throw", "null", "invalid"] as const)(
    "matchMediaが%sでもinnerWidthでDesktopを判定する",
    (matchMediaMode) => {
      const result = runInitScript({
        matchMediaMode,
        viewportWidth: SIDEBAR_DESKTOP_MIN_WIDTH,
        readPreference: () => "1",
      });

      expect(result.initial).toBe("open");
      expect(result.getItem).toHaveBeenCalledOnce();
    }
  );
});

describe("サイドバー初期化の統合契約", () => {
  const root = process.cwd();
  const layoutSource = readFileSync(join(root, "app/layout.tsx"), "utf8");
  const pageSource = readFileSync(join(root, "app/page.tsx"), "utf8");
  const hookSource = readFileSync(
    join(root, "lib/useSidebarLayout.ts"),
    "utf8"
  );
  const shellCss = readFileSync(
    join(root, "app/styles/03-shell.css"),
    "utf8"
  );

  it("head scriptをhydration前に実行する", () => {
    expect(layoutSource).toContain("SIDEBAR_INIT_SCRIPT");
    expect(layoutSource).toContain(
      "dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }}"
    );
  });

  it("hookとpageがpure判定後にready状態を反映する", () => {
    expect(hookSource).toContain("resolveSidebarOpen(isDesktop");
    expect(hookSource).toContain("setSidebarLayoutReady(true)");
    expect(hookSource).toContain("if (!sidebarLayoutReady) return");
    expect(hookSource).toContain(
      'window.addEventListener("resize", applyViewportWidth)'
    );
    expect(pageSource).toContain(
      'sidebarLayoutReady ? " sidebar-layout-ready" : ""'
    );
  });

  it("Desktopの初回だけ幅を予約しながら内容を隠す", () => {
    expect(shellCss).toMatch(
      /@media \(min-width: 768px\)[\s\S]*\.app:not\(\.sidebar-layout-ready\) \.sidebar\s*\{[\s\S]*visibility: hidden;[\s\S]*transition: none;[\s\S]*html\[data-sidebar-initial="open"\][\s\S]*margin-left: 0;/
    );
  });
});
