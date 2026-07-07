import { describe, it, expect } from "vitest";
import {
  buildPath,
  navStateFromSearch,
  navStateFromPath,
  navStateFromLocation,
  type DetailView,
} from "./navigation";

describe("buildPath", () => {
  it("ホーム（既定タブ）はルート、戦闘履歴は /history になる", () => {
    expect(buildPath("home", null)).toBe("/");
    expect(buildPath("history", null)).toBe("/history");
  });

  it("入れ子グループのタブはグループ階層を含む", () => {
    expect(buildPath("damage", null)).toBe("/warlords/damage");
    expect(buildPath("units", null)).toBe("/encyclopedia/units");
    expect(buildPath("swi", null)).toBe("/ranking");
  });

  it("詳細ページは単数形スラッグ＋エンコード名を付ける", () => {
    const detail: DetailView = { kind: "warlord", name: "最終兵器ルイズちゃん" };
    expect(buildPath("home", detail)).toBe(
      "/warlord/" + encodeURIComponent("最終兵器ルイズちゃん")
    );
  });

  it("国の詳細スラッグは nation（タブの nations と衝突しない）", () => {
    const detail: DetailView = { kind: "faction", name: "けつなあな確定" };
    expect(buildPath("nations", detail)).toBe(
      "/nations/nation/" + encodeURIComponent("けつなあな確定")
    );
  });
});

describe("navStateFromPath", () => {
  it("ルートはホーム・詳細なし", () => {
    expect(navStateFromPath("/")).toEqual({ tab: "home", detailStack: [] });
  });

  it("入れ子タブパスを TabKey に戻す", () => {
    expect(navStateFromPath("/history")).toEqual({
      tab: "history",
      detailStack: [],
    });
    expect(navStateFromPath("/warlords/damage")).toEqual({
      tab: "damage",
      detailStack: [],
    });
    expect(navStateFromPath("/ranking")).toEqual({
      tab: "swi",
      detailStack: [],
    });
  });

  it("末尾の詳細スラッグ＋名前を詳細として取り出す", () => {
    const name = "最終兵器ルイズちゃん";
    expect(
      navStateFromPath("/warlord/" + encodeURIComponent(name))
    ).toEqual({
      tab: "home",
      detailStack: [{ kind: "warlord", name }],
    });
  });

  it("タブ文脈付きの国詳細はタブも復元する", () => {
    const name = "けつなあな確定";
    expect(
      navStateFromPath("/nations/nation/" + encodeURIComponent(name))
    ).toEqual({
      tab: "nations",
      detailStack: [{ kind: "faction", name }],
    });
  });

  it("不明なパスはホームにフォールバックする", () => {
    expect(navStateFromPath("/totally/unknown")).toEqual({
      tab: "home",
      detailStack: [],
    });
  });
});

describe("navStateFromSearch（旧クエリ後方互換）", () => {
  it("?tab= のリーフ値を復元する", () => {
    expect(navStateFromSearch("?tab=damage")).toEqual({
      tab: "damage",
      detailStack: [],
    });
  });

  it("旧 equips タブは武器図鑑へ寄せる", () => {
    expect(navStateFromSearch("?tab=equips")).toEqual({
      tab: "weapons",
      detailStack: [],
    });
  });

  it("?w= は武将詳細として復元する", () => {
    expect(navStateFromSearch("?tab=nations&f=" + encodeURIComponent("某国"))).toEqual({
      tab: "nations",
      detailStack: [{ kind: "faction", name: "某国" }],
    });
  });

  it("未知の tab はホームにフォールバックする", () => {
    expect(navStateFromSearch("?tab=nope")).toEqual({
      tab: "home",
      detailStack: [],
    });
  });
});

describe("navStateFromLocation（パス優先・旧クエリ救済）", () => {
  it("パスが具体的ならパスを優先する", () => {
    expect(
      navStateFromLocation({ pathname: "/warlords/damage", search: "?tab=units" })
    ).toEqual({ tab: "damage", detailStack: [] });
  });

  it("ルート＋旧クエリのみのときはクエリで救済する", () => {
    expect(
      navStateFromLocation({ pathname: "/", search: "?tab=db" })
    ).toEqual({ tab: "db", detailStack: [] });
  });

  it("ルート＋クエリ無しはホーム", () => {
    expect(navStateFromLocation({ pathname: "/", search: "" })).toEqual({
      tab: "home",
      detailStack: [],
    });
  });
});
