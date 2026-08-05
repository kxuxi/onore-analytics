import { describe, it, expect } from "vitest";
import {
  TAB_GROUPS,
  GROUP_OF_TAB,
  ALL_TAB_KEYS,
  PUBLIC_TAB_GROUPS,
  PUBLIC_TAB_KEYS,
  isPublicGroup,
  isPublicTab,
} from "./tabs";
import type { TabKey } from "./types";

describe("TAB_GROUPS の導出", () => {
  it("ALL_TAB_KEYS は全グループのリーフを重複なく含む", () => {
    const flat = TAB_GROUPS.flatMap((g) => g.tabs);
    expect(ALL_TAB_KEYS).toEqual(flat);
    expect(new Set(ALL_TAB_KEYS).size).toBe(ALL_TAB_KEYS.length);
  });

  it("GROUP_OF_TAB は各リーフを正しいグループへ逆引きする", () => {
    for (const g of TAB_GROUPS) {
      for (const t of g.tabs) {
        expect(GROUP_OF_TAB[t]).toBe(g.key);
      }
    }
  });

  it("武将ランキングはランキンググループへ統合されている", () => {
    expect(GROUP_OF_TAB.metrics).toBe("ranking");
  });
});

describe("公開範囲（認可の境界）", () => {
  it("PUBLIC_TAB_KEYS は公開グループのリーフだけを含む", () => {
    const expected = TAB_GROUPS.filter((g) =>
      PUBLIC_TAB_GROUPS.includes(g.key)
    ).flatMap((g) => g.tabs);
    expect(PUBLIC_TAB_KEYS).toEqual(expected);
  });

  it("管理者専用タブ（偵察・被弾表・DB確認・管理Wiki・環境設定）は公開されていない", () => {
    const adminOnly: TabKey[] = [
      "scout",
      "damage",
      "db",
      "wiki",
      "factions",
    ];
    for (const t of adminOnly) {
      expect(isPublicTab(t)).toBe(false);
    }
    // 武将グループ（書き込み系導線を含む）と環境設定グループは非公開。
    expect(isPublicGroup("warlords")).toBe(false);
    expect(isPublicGroup("wiki")).toBe(false);
    expect(isPublicGroup("settings")).toBe(false);
  });

  it("閲覧公開タブ（ホーム・戦闘履歴・ランキング・メタ・図鑑・国）は公開されている", () => {
    const publicTabs: TabKey[] = [
      "home",
      "history",
      "unitrank",
      "weaponrank",
      "itemrank",
      "metrics",
      "matrix",
      "metaenv",
      "synergy",
      "units",
      "weapons",
      "items",
      "nations",
    ];
    for (const t of publicTabs) {
      expect(isPublicTab(t)).toBe(true);
    }
  });

  it("全リーフタブは公開か管理者専用のいずれかに必ず分類される", () => {
    for (const t of ALL_TAB_KEYS) {
      expect(typeof isPublicTab(t)).toBe("boolean");
    }
  });
});
