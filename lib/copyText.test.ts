import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copyText";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("navigator.clipboard が使える場合は writeText でコピーして true を返す", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("writeText が拒否された場合は execCommand にフォールバックする", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ta = { style: {} as Record<string, string>, value: "", select: vi.fn() };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(ta),
      body: { appendChild, removeChild },
      execCommand,
    });

    await expect(copyText("コピー本文")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("コピー本文");
    expect(ta.value).toBe("コピー本文");
    expect(ta.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appendChild).toHaveBeenCalledWith(ta);
    expect(removeChild).toHaveBeenCalledWith(ta);
  });

  it("execCommand が失敗した場合は false を返す", async () => {
    vi.stubGlobal("navigator", {});
    const ta = { style: {} as Record<string, string>, value: "", select: vi.fn() };
    const execCommand = vi.fn().mockReturnValue(false);
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(ta),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand,
    });

    await expect(copyText("x")).resolves.toBe(false);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("clipboard もフォールバック用DOMも使えない場合は false を返す", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    vi.stubGlobal("document", {
      createElement: () => {
        throw new Error("no dom");
      },
    });

    await expect(copyText("x")).resolves.toBe(false);
  });
});
