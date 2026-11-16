import { describe, expect, it } from "vitest";
import type { BattleRecord, Warlord, WarlordMap } from "./types";
import {
  WAR_CONDITIONS,
  conditionLabel,
  conditionValue,
  detectWarFactions,
  evaluateCondition,
  warlordsOfFactions,
} from "./warConditions";
import type { LatestEquipment } from "./latestEquipment";

const warlord = (name: string, extra: Partial<Warlord> = {}): Warlord => ({
  name,
  type: "武特",
  branch: "騎兵",
  updatedAt: 0,
  term: 1,
  ...extra,
});

const find = (key: string) => WAR_CONDITIONS.find((c) => c.key === key)!;

describe("WAR_CONDITIONS", () => {
  it("ゲーム画面と同じ表記・並びになる（戦闘力は対象外）", () => {
    expect(WAR_CONDITIONS.map(conditionLabel)).toEqual([
      "知力、敵以上 ×0.9",
      "武力、敵以上 ×0.9",
      "統率、敵以上 ×0.9",
      "政治、敵以上 ×0.9",
      "武力＋統率、敵以上 ×0.9",
      "統率＋知力、敵以上 ×0.9",
      "知力＋武力、敵以上 ×0.9",
      "計略ポイント、敵以下 ×0.8",
    ]);
  });
});

describe("evaluateCondition", () => {
  const me = warlord("自分", {
    power: 80,
    intelligence: 90,
    leadership: 70,
    strategy: 100.5,
  });

  it("敵以上は同値でも該当、下回れば非該当", () => {
    const rows = evaluateCondition(find("intelligence:gte"), me, [
      warlord("同値", { intelligence: 90 }),
      warlord("格上", { intelligence: 91 }),
    ]);
    expect(rows.map((r) => [r.met, r.diff])).toEqual([
      [true, 0],
      [false, -1],
    ]);
  });

  it("合計の条件は両方の能力値を足して比べる", () => {
    const [row] = evaluateCondition(find("power+leadership:gte"), me, [
      warlord("敵", { power: 100, leadership: 49 }),
    ]);
    expect(row).toMatchObject({ theirs: 149, diff: 1, met: true });
  });

  it("計略ポイントは自分が敵以下で該当", () => {
    const rows = evaluateCondition(find("strategy:lte"), me, [
      warlord("多い", { strategy: 120 }),
      warlord("少ない", { strategy: 100 }),
    ]);
    expect(rows.map((r) => r.met)).toEqual([true, false]);
  });

  it("能力値が未取得なら判定しない", () => {
    const [enemyMissing] = evaluateCondition(find("power:gte"), me, [
      warlord("未取得"),
    ]);
    expect(enemyMissing).toMatchObject({ theirs: null, met: null });
    const [mineMissing] = evaluateCondition(find("politics:gte"), me, [
      warlord("敵", { politics: 50 }),
    ]);
    expect(mineMissing).toMatchObject({ theirs: 50, met: null });
  });
});

describe("装備品を含む条件判定", () => {
  const me = warlord("自分", { intelligence: 80, power: 40, leadership: 30, strategy: 100 });
  const enemy = warlord("相手", { intelligence: 75, power: 50, leadership: 45, strategy: 110 });
  const observation = (name: string, item: string | null, term = 1): LatestEquipment => ({
    item, term, observedName: name,
  });
  const latestByWarlord = new Map([
    [me.name, observation(me.name, "銀の宝珠")],
    [enemy.name, observation(enemy.name, "金の宝珠")],
  ]);

  it("既定では双方の品物補正を加え、素の能力値での結果から逆転する", () => {
    const [row] = evaluateCondition(find("intelligence:gte"), me, [enemy], { latestByWarlord });
    expect(conditionValue(find("intelligence:gte"), me, { latestByWarlord })).toBe(100);
    expect(row).toMatchObject({ theirs: 105, diff: -5, met: false });
    expect(evaluateCondition(find("intelligence:gte"), me, [enemy])[0].met).toBe(true);
    expect(me.intelligence).toBe(80);
    expect(enemy.intelligence).toBe(75);
  });

  it("全体で外すと双方が素の能力値へ戻る", () => {
    const [row] = evaluateCondition(find("intelligence:gte"), me, [enemy], {
      latestByWarlord, enabled: false,
    });
    expect(row).toMatchObject({ theirs: 75, diff: 5, met: true });
  });

  it("個別に外した武将だけの補正を除外する", () => {
    const [withoutEnemy] = evaluateCondition(find("intelligence:gte"), me, [enemy], {
      latestByWarlord, excludedNames: new Set([enemy.name]),
    });
    expect(withoutEnemy).toMatchObject({ theirs: 75, diff: 25, met: true });
    const [withoutMe] = evaluateCondition(find("intelligence:gte"), me, [enemy], {
      latestByWarlord, excludedNames: new Set([me.name]),
    });
    expect(withoutMe).toMatchObject({ theirs: 105, diff: -25, met: false });
  });

  it("複数能力の条件にはそれぞれの能力補正を加算し、計略Pには加算しない", () => {
    const [combined] = evaluateCondition(find("intelligence+power:gte"), me, [enemy], { latestByWarlord });
    expect(combined).toMatchObject({ theirs: 155, diff: -15, met: false });
    const [strategy] = evaluateCondition(find("strategy:lte"), me, [enemy], { latestByWarlord });
    expect(strategy).toMatchObject({ theirs: 110, diff: -10, met: true });
  });

  it("明示的な装備なしは補正ゼロ、未観測・未知の品物・別期は判定保留", () => {
    const knownNone = { latestByWarlord: new Map([[me.name, observation(me.name, null)]]) };
    expect(conditionValue(find("intelligence:gte"), me, knownNone)).toBe(80);
    for (const observed of [undefined, observation(me.name, "未確認の品物"), observation(me.name, "銀の宝珠", 0)]) {
      const options = { latestByWarlord: new Map(observed ? [[me.name, observed]] : []) };
      expect(conditionValue(find("intelligence:gte"), me, options)).toBeNull();
      expect(conditionValue(find("intelligence:gte"), me, { ...options, enabled: false })).toBe(80);
      expect(conditionValue(find("strategy:lte"), me, options)).toBe(100);
    }
  });

  it("品物が分かっていても基礎能力が不明なら判定しない", () => {
    expect(conditionValue(find("politics:gte"), me, { latestByWarlord })).toBeNull();
  });
});

function battle(time: string, left: string, right: string): BattleRecord {
  return {
    line:
      `【1戦目】 1583年4月 ${time} 京都 ${left} 甲 甲家 武特 騎馬隊 騎兵 槍 鎧 ` +
      `V.S. ${right} 乙 乙家 統特 騎馬隊 騎兵 馬 旗 甲の勝利 12`,
    time: `1583年4月 ${time}`,
    term: 1,
    savedAt: 0,
  };
}

describe("detectWarFactions", () => {
  it("自国の最後の戦闘から24時間以内に戦った国を交戦中とみなす", () => {
    const now = new Date(2026, 6, 26, 12, 0);
    const log = [
      battle("07/20 10:00", "織田", "上杉"), // 古い戦争
      battle("07/25 09:00", "武田", "織田"), // 守備側でも対象
      battle("07/25 20:00", "織田", "北条"),
      battle("07/25 21:00", "武田", "北条"), // 自国が関わらない
    ];
    expect(detectWarFactions(log, "織田", now)).toEqual({
      current: ["武田", "北条"].sort((a, b) => a.localeCompare(b, "ja")),
      all: ["上杉", "武田", "北条"].sort((a, b) => a.localeCompare(b, "ja")),
    });
  });

  it("戦闘が無ければ空", () => {
    expect(detectWarFactions([], "織田")).toEqual({ current: [], all: [] });
  });
});

describe("warlordsOfFactions", () => {
  it("指定国の、自分と同じ期の武将だけを返す", () => {
    const db: WarlordMap = {
      自分: warlord("自分", { faction: "織田" }),
      敵A: warlord("敵A", { faction: "武田" }),
      旧期: warlord("旧期", { faction: "武田", term: 0 }),
      他国: warlord("他国", { faction: "上杉" }),
    };
    expect(
      warlordsOfFactions(db, ["武田"], db["自分"]).map((w) => w.name)
    ).toEqual(["敵A"]);
  });
});
