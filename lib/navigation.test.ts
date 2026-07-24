import { describe, it, expect } from "vitest";
import {
  buildPath,
  navStateFromSearch,
  navStateFromPath,
  navStateFromLocation,
  type DetailView,
} from "./navigation";

const DETAIL_ROUTE_CASES = [
  {
    label: "武将",
    kind: "warlord",
    segment: "warlord",
    name: "最終兵器ルイズちゃん",
  },
  {
    label: "兵種",
    kind: "unit",
    segment: "unit",
    name: "南蛮象騎兵",
  },
  {
    label: "武器",
    kind: "weapon",
    segment: "weapon",
    name: "カルバリン砲",
  },
  {
    label: "品物",
    kind: "item",
    segment: "item",
    name: "金の腕輪",
  },
  {
    label: "国",
    kind: "faction",
    segment: "nation",
    name: "けつなあな確定",
  },
] satisfies Array<{
  label: string;
  kind: DetailView["kind"];
  segment: string;
  name: string;
}>;

const CONTEXT_ROUTE_CASES = [
  {
    label: "武将ランキング",
    tab: "metrics",
    kind: "warlord",
    basePath: "/ranking",
    name: "織田 信長",
  },
  {
    label: "兵種図鑑",
    tab: "units",
    kind: "unit",
    basePath: "/encyclopedia/units",
    name: "南蛮象騎兵",
  },
  {
    label: "武器図鑑",
    tab: "weapons",
    kind: "weapon",
    basePath: "/encyclopedia/weapons",
    name: "カルバリン砲",
  },
  {
    label: "品物図鑑",
    tab: "items",
    kind: "item",
    basePath: "/encyclopedia/items",
    name: "金の腕輪",
  },
  {
    label: "国一覧",
    tab: "nations",
    kind: "faction",
    basePath: "/nations",
    name: "けつなあな確定",
  },
] satisfies Array<{
  label: string;
  tab: Parameters<typeof buildPath>[0];
  kind: DetailView["kind"];
  basePath: string;
  name: string;
}>;

const LEGACY_DETAIL_CASES = [
  { label: "武将", param: "w", kind: "warlord", name: "織田 信長" },
  { label: "兵種", param: "u", kind: "unit", name: "南蛮象騎兵" },
  { label: "武器", param: "wp", kind: "weapon", name: "カルバリン砲" },
  { label: "品物", param: "it", kind: "item", name: "金の腕輪" },
  { label: "国", param: "f", kind: "faction", name: "某国" },
] satisfies Array<{
  label: string;
  param: string;
  kind: DetailView["kind"];
  name: string;
}>;

const HISTORY_EQUIPMENT_ROUTE_CASES = [
  {
    label: "武器",
    detail: { kind: "weapon", name: "マジックワンド" },
  },
  {
    label: "品物",
    detail: { kind: "item", name: "ヘヴンズ・キー" },
  },
] satisfies Array<{
  label: string;
  detail: DetailView;
}>;

describe("buildPath", () => {
  it("ホーム（既定タブ）はルート、戦闘履歴は /history になる", () => {
    expect(buildPath("home", null)).toBe("/");
    expect(buildPath("history", null)).toBe("/history");
  });

  it("入れ子グループのタブはグループ階層を含む", () => {
    expect(buildPath("damage", null)).toBe("/warlords/damage");
    expect(buildPath("units", null)).toBe("/encyclopedia/units");
    expect(buildPath("metrics", null)).toBe("/ranking");
  });

  it.each(DETAIL_ROUTE_CASES)(
    "$label 詳細は単数形スラッグ＋エンコード名で公開し、パスから復元できる",
    ({ kind, segment, name }) => {
      const detail: DetailView = { kind, name };
      const path = `/${segment}/${encodeURIComponent(name)}`;

      expect(buildPath("home", detail)).toBe(path);
      expect(navStateFromPath(path)).toEqual({
        tab: "home",
        detailStack: [detail],
      });
    }
  );

  it.each(CONTEXT_ROUTE_CASES)(
    "$label から開いた詳細は元タブの文脈をパス往復で保持する",
    ({ tab, kind, basePath, name }) => {
      const detail: DetailView = { kind, name };
      const path = `${basePath}/${DETAIL_ROUTE_CASES.find(
        (entry) => entry.kind === kind
      )!.segment}/${encodeURIComponent(name)}`;

      expect(buildPath(tab, detail)).toBe(path);
      expect(navStateFromPath(path)).toEqual({
        tab,
        detailStack: [detail],
      });
    }
  );

  it.each(HISTORY_EQUIPMENT_ROUTE_CASES)(
    "戦闘履歴から開く $label の日本語名をURLで安全に往復できる",
    ({ detail }) => {
      const path = buildPath("history", detail);

      expect(path).toBe(
        `/history/${detail.kind}/${encodeURIComponent(detail.name)}`
      );
      expect(navStateFromPath(path)).toEqual({
        tab: "history",
        detailStack: [detail],
      });
    }
  );
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
      tab: "metrics",
      detailStack: [],
    });
    expect(navStateFromPath("/metrics")).toEqual({
      tab: "metrics",
      detailStack: [],
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

  it("旧 swi タブは統合後の武将ランキングへ寄せる", () => {
    expect(navStateFromSearch("?tab=swi")).toEqual({
      tab: "metrics",
      detailStack: [],
    });
  });

  it.each(LEGACY_DETAIL_CASES)(
    "旧クエリの $param= は $label 詳細として復元する",
    ({ param, kind, name }) => {
      expect(
        navStateFromSearch(`?tab=home&${param}=${encodeURIComponent(name)}`)
      ).toEqual({
        tab: "home",
        detailStack: [{ kind, name }],
      });
    }
  );

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
