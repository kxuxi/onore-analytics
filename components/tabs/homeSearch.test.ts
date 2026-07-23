import { describe, expect, it } from "vitest";
import {
  HOME_WARLORD_SUGGESTION_LIMIT,
  filterHomeWarlordSuggestions,
  moveHomeSuggestionIndex,
} from "./homeSearch";

describe("filterHomeWarlordSuggestions", () => {
  const names = ["Akechi", "織田信長", "織田信忠", "豊臣秀吉"];

  it("空白だけの検索では候補を返さない", () => {
    expect(filterHomeWarlordSuggestions(names, "   ")).toEqual([]);
  });

  it("前後の空白と英字の大小文字を無視して部分一致する", () => {
    expect(filterHomeWarlordSuggestions(names, "  KEc ")).toEqual(["Akechi"]);
  });

  it("呼び出し元の並び順を保って日本語名を部分一致する", () => {
    expect(filterHomeWarlordSuggestions(names, "織田")).toEqual([
      "織田信長",
      "織田信忠",
    ]);
  });

  it("既存仕様どおり候補を最大12件に制限する", () => {
    const manyNames = Array.from(
      { length: HOME_WARLORD_SUGGESTION_LIMIT + 3 },
      (_, index) => `武将${index}`
    );

    expect(filterHomeWarlordSuggestions(manyNames, "武将")).toHaveLength(
      HOME_WARLORD_SUGGESTION_LIMIT
    );
  });
});

describe("moveHomeSuggestionIndex", () => {
  it("候補がない場合は未選択を返す", () => {
    expect(moveHomeSuggestionIndex(0, 0, "next")).toBe(-1);
  });

  it("未選択から前後へ移動できる", () => {
    expect(moveHomeSuggestionIndex(-1, 3, "next")).toBe(0);
    expect(moveHomeSuggestionIndex(-1, 3, "previous")).toBe(2);
  });

  it("先頭と末尾で循環する", () => {
    expect(moveHomeSuggestionIndex(2, 3, "next")).toBe(0);
    expect(moveHomeSuggestionIndex(0, 3, "previous")).toBe(2);
  });

  it("HomeとEndに相当する位置へ移動する", () => {
    expect(moveHomeSuggestionIndex(1, 3, "first")).toBe(0);
    expect(moveHomeSuggestionIndex(1, 3, "last")).toBe(2);
  });
});
