import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readCookieValue,
  getMyWarlord,
  setMyWarlord,
  clearMyWarlord,
  MY_WARLORD_COOKIE,
} from "./myWarlord";

describe("readCookieValue", () => {
  it("指定キーの値を取り出す", () => {
    expect(
      readCookieValue("a=1; onore_my_warlord=foo; b=2", MY_WARLORD_COOKIE)
    ).toBe("foo");
  });

  it("前後の空白を無視する", () => {
    expect(readCookieValue(" onore_my_warlord=bar ", MY_WARLORD_COOKIE)).toBe(
      "bar"
    );
  });

  it("該当キーが無ければ null", () => {
    expect(readCookieValue("a=1; b=2", MY_WARLORD_COOKIE)).toBeNull();
  });

  it("空文字なら null", () => {
    expect(readCookieValue("", MY_WARLORD_COOKIE)).toBeNull();
  });
});

describe("getMyWarlord / setMyWarlord / clearMyWarlord", () => {
  beforeEach(() => {
    // 単一クッキー前提の簡易エミュレーション（set は先頭の name=value のみ保持）。
    let store = "";
    vi.stubGlobal("document", {
      get cookie() {
        return store;
      },
      set cookie(v: string) {
        store = v.split(";")[0];
      },
    });
  });

  it("保存した武将名を取得できる（URLエンコード往復・日本語）", () => {
    setMyWarlord("最終兵器ルイズちゃん");
    expect(getMyWarlord()).toBe("最終兵器ルイズちゃん");
  });

  it("未設定なら null", () => {
    expect(getMyWarlord()).toBeNull();
  });

  it("クリアすると null になる", () => {
    setMyWarlord("信長");
    expect(getMyWarlord()).toBe("信長");
    clearMyWarlord();
    expect(getMyWarlord()).toBeNull();
  });
});
