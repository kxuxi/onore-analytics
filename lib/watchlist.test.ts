import { describe, it, expect, afterEach, vi } from "vitest";
import {
  parseWatchlist,
  isWatched,
  toggleWatched,
  getWatchlist,
  saveWatchlist,
  MAX_WATCHLIST,
} from "./watchlist";

describe("parseWatchlist", () => {
  it("JSON 配列の文字列だけを採用する", () => {
    expect(parseWatchlist('["信長","秀吉"]')).toEqual(["信長", "秀吉"]);
  });

  it("null・空・不正 JSON・非配列は空配列", () => {
    expect(parseWatchlist(null)).toEqual([]);
    expect(parseWatchlist("")).toEqual([]);
    expect(parseWatchlist("{not json")).toEqual([]);
    expect(parseWatchlist('"文字列"')).toEqual([]);
    expect(parseWatchlist("123")).toEqual([]);
  });

  it("空白のみ・重複・非文字列要素を除く", () => {
    expect(parseWatchlist('["信長","  ","信長",123,"秀吉"]')).toEqual([
      "信長",
      "秀吉",
    ]);
  });

  it("前後の空白はトリムする", () => {
    expect(parseWatchlist('[" 信長 "]')).toEqual(["信長"]);
  });

  it("上限を超える分は切り捨てる", () => {
    const many = Array.from({ length: MAX_WATCHLIST + 10 }, (_, i) => `武将${i}`);
    expect(parseWatchlist(JSON.stringify(many))).toHaveLength(MAX_WATCHLIST);
  });
});

describe("isWatched", () => {
  it("含まれていれば true", () => {
    expect(isWatched(["信長"], "信長")).toBe(true);
    expect(isWatched(["信長"], "秀吉")).toBe(false);
  });

  it("前後の空白を無視して判定する", () => {
    expect(isWatched(["信長"], " 信長 ")).toBe(true);
  });
});

describe("toggleWatched", () => {
  it("未登録は先頭に追加する", () => {
    expect(toggleWatched(["信長"], "秀吉")).toEqual(["秀吉", "信長"]);
  });

  it("登録済みは取り除く", () => {
    expect(toggleWatched(["秀吉", "信長"], "信長")).toEqual(["秀吉"]);
  });

  it("空名は無視して元の配列を返す", () => {
    expect(toggleWatched(["信長"], "  ")).toEqual(["信長"]);
  });

  it("追加時に上限を超えたら末尾を切る", () => {
    const full = Array.from({ length: MAX_WATCHLIST }, (_, i) => `武将${i}`);
    const next = toggleWatched(full, "新規");
    expect(next).toHaveLength(MAX_WATCHLIST);
    expect(next[0]).toBe("新規");
  });
});

describe("getWatchlist / saveWatchlist", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("保存した内容を読み戻せる", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    saveWatchlist(["信長", "秀吉"]);
    expect(getWatchlist()).toEqual(["信長", "秀吉"]);
  });

  it("未設定なら空配列", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    });
    expect(getWatchlist()).toEqual([]);
  });
});
