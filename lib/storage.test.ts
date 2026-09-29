import { describe, expect, it } from "vitest";
import {
  latestWarlordsByName,
  mergeWarlords,
  normalizationMap,
  warlordKey,
  warlordsForTerm,
} from "./storage";
import type { Warlord, WarlordMap } from "./types";

/** 必須項目のみ埋めた Warlord を作る簡易ファクトリー。 */
function wl(partial: Partial<Warlord> & { name: string }): Warlord {
  return {
    type: "武特",
    branch: "騎兵",
    updatedAt: 0,
    ...partial,
  };
}

/** (name, term) のマップキーを作るショートハンド。 */
const k = (name: string, term?: number) => warlordKey(name, term);

describe("mergeWarlords", () => {
  it("新規武将を追加し added を数える", () => {
    const { map, added, updated } = mergeWarlords({}, [wl({ name: "織田信長" })]);
    expect(added).toBe(1);
    expect(updated).toBe(0);
    expect(map[k("織田信長")]).toBeDefined();
  });

  it("既存武将（同一の名前・期）は上書きし updated を数える", () => {
    const existing: WarlordMap = {
      [k("織田信長")]: wl({ name: "織田信長", type: "武特", updatedAt: 100 }),
    };
    const { added, updated, map } = mergeWarlords(existing, [
      wl({ name: "織田信長", type: "知特", updatedAt: 200 }),
    ]);
    expect(added).toBe(0);
    expect(updated).toBe(1);
    expect(map[k("織田信長")].type).toBe("知特");
  });

  it("updatedAt は新旧の最大値を採用する", () => {
    const existing: WarlordMap = { [k("A")]: wl({ name: "A", updatedAt: 300 }) };
    const { map } = mergeWarlords(existing, [wl({ name: "A", updatedAt: 100 })]);
    expect(map[k("A")].updatedAt).toBe(300);
  });

  it("戦闘登録で渡らない能力値・自己PRは既存値を保持する", () => {
    const existing: WarlordMap = {
      [k("A")]: wl({ name: "A", power: 50, selfPr: "天下布武", updatedAt: 100 }),
    };
    const { map } = mergeWarlords(existing, [wl({ name: "A", updatedAt: 200 })]);
    expect(map[k("A")].power).toBe(50);
    expect(map[k("A")].selfPr).toBe("天下布武");
  });

  it("元の DB を破壊的に変更しない", () => {
    const existing: WarlordMap = { [k("A")]: wl({ name: "A", updatedAt: 100 }) };
    mergeWarlords(existing, [wl({ name: "B", updatedAt: 100 })]);
    expect(existing[k("B")]).toBeUndefined();
  });

  it("守備の lastActionAt が出兵 actions より新しければ lastActionAt を更新する", () => {
    // 既存: 出兵時刻 10:00 が actions に記録済み
    const existing: WarlordMap = {
      [k("A")]: wl({
        name: "A",
        actions: ["06/15 10:00"],
        lastActionAt: "06/15 10:00",
        updatedAt: 100,
      }),
    };
    // 新規: 守備（actions なし）で lastActionAt だけ 11:00
    const { map } = mergeWarlords(existing, [
      wl({ name: "A", lastActionAt: "06/15 11:00", updatedAt: 200 }),
    ]);
    expect(map[k("A")].lastActionAt).toBe("06/15 11:00");
    // actions（出兵履歴）はそのまま保持される
    expect(map[k("A")].actions).toEqual(["06/15 10:00"]);
  });

  it("新しい守備時刻の後に古い守備を取り込んでも lastActionAt を戻さない", () => {
    const { map } = mergeWarlords(
      {
        [k("A")]: wl({
          name: "A",
          actions: ["06/15 10:00"],
          lastActionAt: "06/15 12:00",
          updatedAt: 200,
        }),
      },
      [wl({ name: "A", lastActionAt: "06/15 11:00", updatedAt: 300 })]
    );

    expect(map[k("A")].lastActionAt).toBe("06/15 12:00");
    expect(map[k("A")].actions).toEqual(["06/15 10:00"]);
  });
});

describe("mergeWarlords のプロフィール採用（在ゲーム年月での新旧判定）", () => {
  it("在ゲームで新しい戦闘のプロフィールを採用する（守備でも反映）", () => {
    // 旧: 在ゲーム 1700年、実時刻 06/18（遅い MM/DD）
    const existing: WarlordMap = {
      [k("A")]: wl({
        name: "A",
        type: "武特",
        branch: "鉄砲",
        unit: "鉄砲隊",
        battleAt: "1700年1月 06/18 12:00",
        updatedAt: 100,
      }),
    };
    // 新: 在ゲーム 1705年だが実時刻 05/10（早い MM/DD）。
    // 実時刻だけで比べると旧より「古い」と誤判定されるが、在ゲーム年月では新しい。
    const { map } = mergeWarlords(existing, [
      wl({
        name: "A",
        type: "統特",
        branch: "騎兵",
        unit: "騎馬隊",
        battleAt: "1705年1月 05/10 09:00",
        updatedAt: 200,
      }),
    ]);
    expect(map[k("A")].unit).toBe("騎馬隊");
    expect(map[k("A")].branch).toBe("騎兵");
    expect(map[k("A")].battleAt).toBe("1705年1月 05/10 09:00");
  });

  it("在ゲームで古い戦闘を後から登録しても新しいプロフィールを上書きしない", () => {
    // 既存は在ゲーム 1705年（新しい）
    const existing: WarlordMap = {
      [k("A")]: wl({
        name: "A",
        branch: "騎兵",
        unit: "騎馬隊",
        battleAt: "1705年1月 05/10 09:00",
        updatedAt: 100,
      }),
    };
    // 在ゲーム 1700年（古い）を後から再登録（実時刻 06/18 は遅いが在ゲームは古い）
    const { map } = mergeWarlords(existing, [
      wl({
        name: "A",
        branch: "鉄砲",
        unit: "鉄砲隊",
        battleAt: "1700年1月 06/18 12:00",
        updatedAt: 200,
      }),
    ]);
    expect(map[k("A")].unit).toBe("騎馬隊");
    expect(map[k("A")].branch).toBe("騎兵");
    expect(map[k("A")].battleAt).toBe("1705年1月 05/10 09:00");
  });

  it("同じ在ゲーム年月なら実時刻が新しい方を採用する", () => {
    const existing: WarlordMap = {
      [k("A")]: wl({
        name: "A",
        unit: "鉄砲隊",
        battleAt: "1700年5月 06/15 09:00",
        updatedAt: 100,
      }),
    };
    const { map } = mergeWarlords(existing, [
      wl({
        name: "A",
        unit: "騎馬隊",
        battleAt: "1700年5月 06/15 10:00",
        updatedAt: 200,
      }),
    ]);
    expect(map[k("A")].unit).toBe("騎馬隊");
  });

  it("在ゲーム年月が取れない場合は実時刻で判定する", () => {
    const existing: WarlordMap = {
      [k("A")]: wl({
        name: "A",
        unit: "鉄砲隊",
        battleAt: "06/15 09:00",
        updatedAt: 100,
      }),
    };
    const { map } = mergeWarlords(existing, [
      wl({
        name: "A",
        unit: "騎馬隊",
        battleAt: "06/15 10:00",
        updatedAt: 200,
      }),
    ]);
    expect(map[k("A")].unit).toBe("騎馬隊");
  });
});

describe("mergeWarlords の期ごとのレコード保持（同名でも期が違えば別レコード）", () => {
  it("新しい期の登録は別レコードになり、古い期の所属国を上書きしない", () => {
    const existing: WarlordMap = {
      [k("A", 145)]: wl({
        name: "A",
        faction: "けつなあな確定",
        branch: "万能",
        unit: "タクチキ混成隊",
        battleAt: "1706年3月 06/18 12:45",
        term: 145,
        updatedAt: 100,
      }),
    };
    const { map, added, updated } = mergeWarlords(existing, [
      wl({
        name: "A",
        faction: "梅雨前線",
        branch: "万能",
        unit: "南蛮傭兵",
        battleAt: "1609年9月 06/28 10:51",
        term: 146,
        updatedAt: 200,
      }),
    ]);
    expect(added).toBe(1);
    expect(updated).toBe(0);
    // 新しい期は新しい国で登録される。
    expect(map[k("A", 146)].faction).toBe("梅雨前線");
    expect(map[k("A", 146)].unit).toBe("南蛮傭兵");
    // 古い期のレコードは当時の所属国のまま残る（過去の期の情報を書き換えない）。
    expect(map[k("A", 145)].faction).toBe("けつなあな確定");
    expect(map[k("A", 145)].unit).toBe("タクチキ混成隊");
  });

  it("古い期の戦闘を後から登録しても、新しい期のレコードに影響しない", () => {
    const existing: WarlordMap = {
      [k("A", 146)]: wl({
        name: "A",
        faction: "梅雨前線",
        branch: "万能",
        unit: "南蛮傭兵",
        battleAt: "1609年9月 06/28 10:51",
        term: 146,
        updatedAt: 100,
      }),
    };
    const { map } = mergeWarlords(existing, [
      wl({
        name: "A",
        faction: "けつなあな確定",
        branch: "万能",
        unit: "タクチキ混成隊",
        battleAt: "1706年3月 06/18 12:45",
        term: 145,
        updatedAt: 200,
      }),
    ]);
    expect(map[k("A", 146)].faction).toBe("梅雨前線");
    expect(map[k("A", 146)].unit).toBe("南蛮傭兵");
    expect(map[k("A", 145)].faction).toBe("けつなあな確定");
  });

  it("同じ期なら在ゲーム年月で判定する", () => {
    const existing: WarlordMap = {
      [k("A", 145)]: wl({
        name: "A",
        unit: "鉄砲隊",
        battleAt: "1700年1月 06/18 12:00",
        term: 145,
        updatedAt: 100,
      }),
    };
    const { map } = mergeWarlords(existing, [
      wl({
        name: "A",
        unit: "騎馬隊",
        battleAt: "1705年1月 05/10 09:00",
        term: 145,
        updatedAt: 200,
      }),
    ]);
    expect(map[k("A", 145)].unit).toBe("騎馬隊");
  });
});

describe("warlordsForTerm / latestWarlordsByName（期別ビュー）", () => {
  const db: WarlordMap = {
    [k("A", 145)]: wl({
      name: "A",
      faction: "けつなあな確定",
      term: 145,
      battleAt: "1706年3月 06/18 12:45",
      updatedAt: 100,
    }),
    [k("A", 146)]: wl({
      name: "A",
      faction: "梅雨前線",
      term: 146,
      battleAt: "1609年9月 06/28 10:51",
      updatedAt: 200,
    }),
    [k("B", 145)]: wl({
      name: "B",
      faction: "甲国",
      term: 145,
      updatedAt: 100,
    }),
  };

  it("warlordsForTerm はその期の武将だけを名前キーで返す（その期の所属国を保持）", () => {
    const t145 = warlordsForTerm(db, 145);
    expect(Object.keys(t145).sort()).toEqual(["A", "B"]);
    expect(t145["A"].faction).toBe("けつなあな確定");
    const t146 = warlordsForTerm(db, 146);
    expect(Object.keys(t146)).toEqual(["A"]);
    expect(t146["A"].faction).toBe("梅雨前線");
  });

  it("latestWarlordsByName は各名前の最新期のプロフィールを採用する", () => {
    const latest = latestWarlordsByName(db);
    expect(Object.keys(latest).sort()).toEqual(["A", "B"]);
    expect(latest["A"].term).toBe(146);
    expect(latest["A"].faction).toBe("梅雨前線");
    expect(latest["B"].faction).toBe("甲国");
  });
});

describe("normalizationMap（改名した同一武将の代表名）", () => {
  it("同じ household では在ゲーム年月が新しい戦闘の名前を代表にする", () => {
    // 旧名は updatedAt が新しい（後から登録）が、在ゲーム年月は古い。
    // 実際のケロロ軍曹のケース（146期の改名）。
    const map: WarlordMap = {
      ケロロ軍曹: wl({
        name: "ケロロ軍曹",
        household: "ケロロ家",
        term: 146,
        battleAt: "1642年11月 07/03 23:39",
        updatedAt: 200,
      }),
      ケロロ軍曹であります: wl({
        name: "ケロロ軍曹であります",
        household: "ケロロ家",
        term: 146,
        battleAt: "1720年1月 07/16 20:07",
        updatedAt: 100,
      }),
    };
    const norm = normalizationMap(map);
    expect(norm["ケロロ軍曹"]).toBe("ケロロ軍曹であります");
    expect(norm["ケロロ軍曹であります"]).toBe("ケロロ軍曹であります");
  });

  it("新しい期（term）の名前を優先する（在ゲーム年月より優先）", () => {
    const map: WarlordMap = {
      旧名: wl({
        name: "旧名",
        household: "家",
        term: 145,
        battleAt: "1800年1月 01/01 00:00",
        updatedAt: 100,
      }),
      新名: wl({
        name: "新名",
        household: "家",
        term: 146,
        battleAt: "1600年1月 01/01 00:00",
        updatedAt: 100,
      }),
    };
    const norm = normalizationMap(map);
    expect(norm["旧名"]).toBe("新名");
    expect(norm["新名"]).toBe("新名");
  });

  it("household が異なれば別人としてそれぞれの名前を返す", () => {
    const map: WarlordMap = {
      A: wl({ name: "A", household: "甲家", updatedAt: 100 }),
      B: wl({ name: "B", household: "乙家", updatedAt: 200 }),
    };
    const norm = normalizationMap(map);
    expect(norm["A"]).toBe("A");
    expect(norm["B"]).toBe("B");
  });

  it("household が空の武将は名寄せせず各自の名前を返す（誤統合しない）", () => {
    const map: WarlordMap = {
      甲: wl({ name: "甲", household: undefined, updatedAt: 100 }),
      乙: wl({ name: "乙", household: undefined, updatedAt: 300 }),
      丙: wl({ name: "丙", household: "", updatedAt: 200 }),
    };
    const norm = normalizationMap(map);
    expect(norm["甲"]).toBe("甲");
    expect(norm["乙"]).toBe("乙");
    expect(norm["丙"]).toBe("丙");
  });
});
