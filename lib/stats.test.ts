import { describe, it, expect } from "vitest";
import {
  collectWarlordBattles,
  collectUnitBattles,
  opponentStats,
  matchupRanking,
  branchStats,
  selfUnitStats,
  opponentTraitStats,
  weeklyWinRateTrend,
  winHeatmap,
  factionTimeline,
  collectFactionBattles,
  factionSummaries,
  factionMemberStats,
  latestUnitsByBranch,
  factionMemberUnitTrends,
  unitMatchupRanking,
  userWinRates,
  unitUsageTrend,
  unitBranchLabel,
  breakthroughRanking,
  pontaPointRanking,
  warlordRanking,
  weaponStats,
  itemStats,
  unitStats,
  rankingPeriods,
  latestGameYear,
  RANKING_LAST10_KEY,
  equipSynergy,
  collectEquipBattles,
  traitMatchupMatrix,
  collectTraitMatchupBattles,
  MATCHUP_TRAITS,
  metaOverview,
  metaTier,
  META_PERIODS,
  formatWinRate,
  parseGameYear,
  yearBucketFor,
  yearBucketWinRankings,
  warlordYearRankTags,
  YEAR_BUCKETS,
  antiContactRanking,
  buildAntiIndex,
  unitCountersBranch,
  assetMetricRanking,
  factionsInYearRange,
} from "./stats";
import type { BattleRecord, UnitType, WarlordMap } from "./types";
import { EMPTY_UNIT } from "./unitTypeForm";

/**
 * テスト用の戦闘行を組み立てる。
 * 注目武将を「織田 信長（兵種指定可）」とし、相手・勝敗・日時を差し替える。
 */
function makeLine(opts: {
  year: number;
  time: string; // "MM/DD HH:mm"
  selfFaction: string;
  selfBranch: string;
  opponent: string;
  oppFaction: string;
  result: string; // "信長の勝利" | "<相手>の勝利" | "撤退" など
}): string {
  const { year, time, selfFaction, selfBranch, opponent, oppFaction, result } =
    opts;
  return `【1戦目】 ${year}年4月 ${time} 京都 ${selfFaction} 信長 織田家 武特 騎馬隊 ${selfBranch} 槍 鎧 V.S. ${oppFaction} ${opponent} 某家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`;
}

function rec(line: string, savedAt = 0): BattleRecord {
  return { line, time: line.match(/\d+年\d+月\s+\d+\/\d+\s+\d+:\d+/)?.[0], term: 145, savedAt };
}

describe("opponentStats / matchupRanking / rivalry", () => {
  const log: BattleRecord[] = [
    rec(
      makeLine({
        year: 1600,
        time: "04/10 10:00",
        selfFaction: "織田",
        selfBranch: "騎兵",
        opponent: "勝頼",
        oppFaction: "武田",
        result: "信長の勝利",
      }),
      1
    ),
    rec(
      makeLine({
        year: 1601,
        time: "04/11 10:00",
        selfFaction: "織田",
        selfBranch: "歩兵",
        opponent: "勝頼",
        oppFaction: "武田",
        result: "勝頼の勝利",
      }),
      2
    ),
    rec(
      makeLine({
        year: 1602,
        time: "04/12 10:00",
        selfFaction: "織田",
        selfBranch: "騎兵",
        opponent: "謙信",
        oppFaction: "上杉",
        result: "謙信の勝利",
      }),
      3
    ),
  ];
  const outcomes = collectWarlordBattles(log, "信長");

  it("対戦相手ごとに勝敗を集計する", () => {
    const stats = opponentStats(outcomes);
    const katsuyori = stats.find((s) => s.name === "勝頼")!;
    expect(katsuyori.battles).toBe(2);
    expect(katsuyori.wins).toBe(1);
    expect(katsuyori.losses).toBe(1);
    expect(katsuyori.winRate).toBeCloseTo(0.5);
  });

  it("相性ランキングは勝ち越し/負け越しで分け、五分は除外する", () => {
    const ranking = matchupRanking(outcomes);
    // 勝頼(1勝1敗=50%)は五分なのでどちらにも入らない。
    // 謙信(0勝1敗=0%)は負け越しなので苦手な相手。
    expect(ranking.best).toHaveLength(0);
    expect(ranking.worst.map((s) => s.name)).toEqual(["謙信"]);
  });

  it("良い相手と苦手な相手に同じ相手は出ない（重複しない）", () => {
    // 相手5人・勝率まちまちでも、良い相手(>50%)と苦手な相手(<50%)は
    // 勝率で排他的に分かれるため重複しない。
    const lines: BattleRecord[] = [];
    let n = 0;
    const add = (opp: string, selfWins: number, oppWins: number) => {
      for (let i = 0; i < selfWins; i++)
        lines.push(
          rec(
            makeLine({
              year: 1600 + n,
              time: `04/10 1${n % 10}:00`,
              selfFaction: "織田",
              selfBranch: "騎兵",
              opponent: opp,
              oppFaction: "敵",
              result: "信長の勝利",
            }),
            n++
          )
        );
      for (let i = 0; i < oppWins; i++)
        lines.push(
          rec(
            makeLine({
              year: 1600 + n,
              time: `04/10 1${n % 10}:00`,
              selfFaction: "織田",
              selfBranch: "騎兵",
              opponent: opp,
              oppFaction: "敵",
              result: `${opp}の勝利`,
            }),
            n++
          )
        );
    };
    add("Aカモ", 3, 0); // 100%
    add("B得意", 2, 1); // 約67%
    add("C五分", 1, 1); // 50%（除外）
    add("D苦手", 1, 2); // 約33%
    add("Eカモられ", 0, 3); // 0%
    const oc = collectWarlordBattles(lines, "信長");
    const r = matchupRanking(oc);
    const bestNames = r.best.map((s) => s.name);
    const worstNames = r.worst.map((s) => s.name);
    // 重複なし
    expect(bestNames.filter((x) => worstNames.includes(x))).toHaveLength(0);
    // 良い相手は勝ち越しのみ・勝率降順
    expect(bestNames).toEqual(["Aカモ", "B得意"]);
    // 苦手な相手は負け越しのみ・勝率昇順（一番苦手が先頭）
    expect(worstNames).toEqual(["Eカモられ", "D苦手"]);
    // 五分(C)はどちらにも出ない
    expect(bestNames).not.toContain("C五分");
    expect(worstNames).not.toContain("C五分");
  });
});

describe("branchStats", () => {
  it("兵種ごとに勝率を出し戦闘数の多い順に並べる", () => {
    const log: BattleRecord[] = [
      rec(
        makeLine({
          year: 1600,
          time: "04/10 10:00",
          selfFaction: "織田",
          selfBranch: "騎兵",
          opponent: "A",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        1
      ),
      rec(
        makeLine({
          year: 1600,
          time: "04/11 11:00",
          selfFaction: "織田",
          selfBranch: "騎兵",
          opponent: "B",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        2
      ),
      rec(
        makeLine({
          year: 1600,
          time: "04/12 12:00",
          selfFaction: "織田",
          selfBranch: "万能",
          opponent: "C",
          oppFaction: "X",
          result: "Cの勝利",
        }),
        3
      ),
    ];
    const outcomes = collectWarlordBattles(log, "信長");
    const stats = branchStats(outcomes);
    expect(stats[0].branch).toBe("騎兵"); // 2戦で最多
    expect(stats[0].winRate).toBeCloseTo(1);
    const banno = stats.find((s) => s.branch === "万能")!;
    expect(banno.winRate).toBeCloseTo(0);
  });
});

describe("winHeatmap", () => {
  it("曜日×時間帯に振り分けて勝率を計算する", () => {
    const log: BattleRecord[] = [
      rec(
        makeLine({
          year: 1600,
          time: "04/10 10:00",
          selfFaction: "織田",
          selfBranch: "騎兵",
          opponent: "A",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        1
      ),
    ];
    const outcomes = collectWarlordBattles(log, "信長");
    const hm = winHeatmap(outcomes);
    expect(hm.dated).toBe(1);
    // 10時 → バケット 3（9〜12時）に 1 件入る
    const total = hm.cells.flat().reduce((s, c) => s + c.battles, 0);
    expect(total).toBe(1);
  });
});

describe("factionTimeline", () => {
  it("渡り歩いた国を時系列の区間にまとめ、出戻りを検出する", () => {
    const log: BattleRecord[] = [
      rec(
        makeLine({
          year: 1600,
          time: "04/10 10:00",
          selfFaction: "織田",
          selfBranch: "騎兵",
          opponent: "A",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        1
      ),
      rec(
        makeLine({
          year: 1605,
          time: "04/11 10:00",
          selfFaction: "豊臣",
          selfBranch: "騎兵",
          opponent: "B",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        2
      ),
      rec(
        makeLine({
          year: 1610,
          time: "04/12 10:00",
          selfFaction: "織田",
          selfBranch: "騎兵",
          opponent: "C",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        3
      ),
    ];
    const outcomes = collectWarlordBattles(log, "信長");
    const stints = factionTimeline(outcomes);
    expect(stints.map((s) => s.faction)).toEqual(["織田", "豊臣", "織田"]);
    expect(stints[0].startYear).toBe(1600);
    expect(stints[2].returning).toBe(true); // 織田への出戻り
    expect(stints[0].returning).toBe(false);
  });

  it("実時刻(MM/DD)がゲーム内年と逆順でもゲーム内年で並べる", () => {
    // 1606年の戦闘は実時刻が遅く(12/31)、1607年は実時刻が早い(01/01)。
    // 実時刻で並べると順序が逆転するが、所属遍歴はゲーム内年で並ぶべき。
    const log: BattleRecord[] = [
      rec(
        makeLine({
          year: 1606,
          time: "12/31 23:00",
          selfFaction: "大空",
          selfBranch: "騎兵",
          opponent: "A",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        1
      ),
      rec(
        makeLine({
          year: 1607,
          time: "01/01 00:00",
          selfFaction: "己鯖電機",
          selfBranch: "騎兵",
          opponent: "B",
          oppFaction: "X",
          result: "信長の勝利",
        }),
        2
      ),
    ];
    const outcomes = collectWarlordBattles(log, "信長");
    const stints = factionTimeline(outcomes);
    expect(stints.map((s) => s.faction)).toEqual(["大空", "己鯖電機"]);
    expect(stints.every((s) => !s.returning)).toBe(true);
  });
});

describe("collectFactionBattles", () => {
  const fw = (
    year: number,
    opp: string,
    oppFaction: string,
    result: string,
    savedAt: number
  ) =>
    rec(
      makeLine({
        year,
        time: `04/10 1${savedAt % 10}:00`,
        selfFaction: "織田",
        selfBranch: "騎兵",
        opponent: opp,
        oppFaction,
        result,
      }),
      savedAt
    );
  const log: BattleRecord[] = [
    fw(1600, "信玄", "武田", "信長の勝利", 1),
    fw(1601, "勝頼", "武田", "信長の勝利", 2),
    fw(1602, "謙信", "上杉", "謙信の勝利", 3),
    fw(1603, "景勝", "上杉", "景勝の勝利", 4),
    fw(1604, "氏康", "北条", "信長の勝利", 5),
    fw(1605, "氏政", "北条", "氏政の勝利", 6),
  ];
  const outcomes = collectFactionBattles(log, "織田");

  it("指定した国が参戦した戦闘を国視点で集める", () => {
    expect(outcomes).toHaveLength(6);
    expect(outcomes.every((o) => o.self.faction === "織田")).toBe(true);
  });
});

describe("factionMemberStats", () => {
  // 武将名・兵種名・兵種タイプ・所属国・勝敗を制御できる戦闘行ビルダー。
  // 並び順は savedAt（大きいほど新しい）で決まるよう、時刻は固定にする。
  const line = (opts: {
    self: string;
    faction: string;
    unit: string;
    branch: string;
    opp: string;
    result: string;
  }) =>
    `【1戦目】 1600年4月 04/10 10:00 京都 ${opts.faction} ${opts.self} 某家 武特 ${opts.unit} ${opts.branch} 槍 鎧 V.S. 敵国 ${opts.opp} 敵家 統特 騎馬隊 騎兵 馬 旗 ${opts.result} 12`;

  it("現在の在籍区間のみ集計し、出戻り前の古い在籍ぶんは除外する", () => {
    // 渡辺: 織田(勝) → 武田 → 織田(勝) → 織田(負) と渡り歩いた出戻り武将。
    // 現在の在籍区間は最後の織田2戦のみ（古い織田1戦は除外）。
    const log: BattleRecord[] = [
      rec(line({ self: "渡辺", faction: "織田", unit: "母衣衆", branch: "騎兵", opp: "A", result: "渡辺の勝利" }), 1),
      rec(line({ self: "渡辺", faction: "武田", unit: "母衣衆", branch: "騎兵", opp: "B", result: "渡辺の勝利" }), 2),
      rec(line({ self: "渡辺", faction: "織田", unit: "南蛮象騎兵", branch: "騎兵", opp: "C", result: "渡辺の勝利" }), 3),
      rec(line({ self: "渡辺", faction: "織田", unit: "南蛮象騎兵", branch: "騎兵", opp: "D", result: "Dの勝利" }), 4),
      // 山田: ずっと織田。弓兵ロングボウ。最新は savedAt=7。
      rec(line({ self: "山田", faction: "織田", unit: "丸木弓足軽", branch: "弓兵", opp: "E", result: "山田の勝利" }), 5),
      rec(line({ self: "山田", faction: "織田", unit: "丸木弓足軽", branch: "弓兵", opp: "F", result: "Fの勝利" }), 6),
      rec(line({ self: "山田", faction: "織田", unit: "ロングボウ", branch: "弓兵", opp: "G", result: "山田の勝利" }), 7),
    ];
    const stats = factionMemberStats(log, "織田");
    const watanabe = stats.find((s) => s.name === "渡辺")!;
    expect(watanabe.battles).toBe(2); // 出戻り後の織田2戦のみ
    expect(watanabe.wins).toBe(1);
    expect(watanabe.losses).toBe(1);
    expect(watanabe.latestUnit).toBe("南蛮象騎兵");
    expect(watanabe.latestBranch).toBe("騎兵");

    const yamada = stats.find((s) => s.name === "山田")!;
    expect(yamada.battles).toBe(3);
    expect(yamada.wins).toBe(2);
    expect(yamada.latestUnit).toBe("ロングボウ"); // 最新の使用兵種
    expect(yamada.latestBranch).toBe("弓兵");
  });

  it("現在は別の国にいる武将（出戻りなし）は集計対象外", () => {
    // 佐藤: 織田 → 武田 と移籍。武田が現在の所属なので織田の在籍区間は古いぶんのみ。
    const log: BattleRecord[] = [
      rec(line({ self: "佐藤", faction: "織田", unit: "母衣衆", branch: "騎兵", opp: "A", result: "佐藤の勝利" }), 1),
      rec(line({ self: "佐藤", faction: "武田", unit: "母衣衆", branch: "騎兵", opp: "B", result: "佐藤の勝利" }), 2),
    ];
    // 織田から見ると、佐藤の最後の織田戦(savedAt=1)以降は武田なので在籍区間は1戦。
    const oda = factionMemberStats(log, "織田").find((s) => s.name === "佐藤")!;
    expect(oda.battles).toBe(1);
    // 武田から見ると現在の在籍区間は1戦。
    const takeda = factionMemberStats(log, "武田").find((s) => s.name === "佐藤")!;
    expect(takeda.battles).toBe(1);
    expect(takeda.latestUnit).toBe("母衣衆");
  });
});

describe("latestUnitsByBranch", () => {
  it("兵種ごとに最新使用兵種を集計し、その他は末尾に置く", () => {
    const groups = latestUnitsByBranch([
      { latestBranch: "弓兵", latestUnit: "ロングボウ" },
      { latestBranch: "弓兵", latestUnit: "ロングボウ" },
      { latestBranch: "弓兵", latestUnit: "剛弓" },
      { latestBranch: "騎兵", latestUnit: "南蛮象" },
      { latestBranch: "万能", latestUnit: "梓巫女" },
      { latestUnit: "ぬりかべ" }, // 兵種不明 → その他
      { latestBranch: "弓兵" }, // 兵種なし → 無視
    ]);
    expect(groups[0].branch).toBe("弓兵"); // 人数最多（3）
    expect(groups[0].total).toBe(3);
    expect(groups[0].units).toEqual([
      { unit: "ロングボウ", count: 2 },
      { unit: "剛弓", count: 1 },
    ]);
    expect(groups[groups.length - 1].branch).toBe("その他"); // 末尾
    expect(groups.find((g) => g.branch === "その他")!.units).toEqual([
      { unit: "ぬりかべ", count: 1 },
    ]);
  });
});

describe("factionMemberUnitTrends", () => {
  const line = (opts: {
    year: number;
    self: string;
    faction: string;
    unit: string;
    opp: string;
  }) =>
    `【1戦目】 ${opts.year}年4月 04/10 10:00 京都 ${opts.faction} ${opts.self} 某家 武特 ${opts.unit} 弓兵 槍 鎧 V.S. 敵国 ${opts.opp} 敵家 統特 騎馬隊 騎兵 馬 旗 ${opts.self}の勝利 12`;

  it("武将ごとに期間内の兵種頻度を多い順に集計する", () => {
    const log: BattleRecord[] = [
      rec(line({ year: 1700, self: "山田", faction: "織田", unit: "ロングボウ", opp: "A" }), 1),
      rec(line({ year: 1701, self: "山田", faction: "織田", unit: "ロングボウ", opp: "B" }), 2),
      rec(line({ year: 1702, self: "山田", faction: "織田", unit: "剛弓", opp: "C" }), 3),
      // 過去10年より前の年は除外される。
      rec(line({ year: 1680, self: "山田", faction: "織田", unit: "丸木弓足軽", opp: "D" }), 4),
    ];
    const trends = factionMemberUnitTrends(log, "織田", 1693); // 1693以降=過去10年
    const yamada = trends.get("山田")!;
    expect(yamada.units).toEqual([
      { unit: "ロングボウ", count: 2 },
      { unit: "剛弓", count: 1 },
    ]);
    expect(yamada.units.find((u) => u.unit === "丸木弓足軽")).toBeUndefined();
  });

  it("別の国で使った兵種は含めない", () => {
    const log: BattleRecord[] = [
      rec(line({ year: 1700, self: "佐藤", faction: "織田", unit: "母衣衆", opp: "A" }), 1),
      rec(line({ year: 1700, self: "佐藤", faction: "武田", unit: "赤備", opp: "B" }), 2),
    ];
    const trends = factionMemberUnitTrends(log, "織田", null);
    const sato = trends.get("佐藤")!;
    expect(sato.units).toEqual([{ unit: "母衣衆", count: 1 }]);
  });
});

describe("factionSummaries", () => {
  // 左右の国・武将名・勝敗を制御できる戦闘行ビルダー。
  const line = (opts: {
    lf: string;
    ln: string;
    rf: string;
    rn: string;
    result: string;
  }) =>
    `【1戦目】 1600年4月 04/10 10:00 京都 ${opts.lf} ${opts.ln} 某家 武特 騎馬隊 騎兵 槍 鎧 V.S. ${opts.rf} ${opts.rn} 敵家 統特 騎馬隊 騎兵 馬 旗 ${opts.result} 12`;

  const w = (name: string, faction: string): WarlordMap[string] => ({
    name,
    faction,
    type: "武特",
    branch: "騎兵",
    updatedAt: 0,
  });

  it("国ごとに戦闘数・勝敗・人数を集計し、戦闘数→勝率順に並べる", () => {
    // 織田 2勝1敗 / 武田 1勝2敗（同じ戦闘の裏返し）。上杉は名簿のみで戦歴なし。
    const log: BattleRecord[] = [
      rec(line({ lf: "織田", ln: "信長", rf: "武田", rn: "勝頼", result: "信長の勝利" }), 1),
      rec(line({ lf: "織田", ln: "光秀", rf: "武田", rn: "信玄", result: "光秀の勝利" }), 2),
      rec(line({ lf: "織田", ln: "秀吉", rf: "武田", rn: "昌幸", result: "昌幸の勝利" }), 3),
    ];
    const db: WarlordMap = {
      信長: w("信長", "織田"),
      光秀: w("光秀", "織田"),
      秀吉: w("秀吉", "織田"),
      勝頼: w("勝頼", "武田"),
      謙信: w("謙信", "上杉"), // 戦歴のない国（名簿のみ）
    };
    const list = factionSummaries(log, db);
    expect(list.map((f) => f.faction)).toEqual(["織田", "武田", "上杉"]);

    const oda = list[0];
    expect(oda.battles).toBe(3);
    expect(oda.wins).toBe(2);
    expect(oda.losses).toBe(1);
    expect(oda.members).toBe(3);
    expect(oda.winRate).toBeCloseTo(2 / 3, 5);

    const takeda = list[1];
    expect(takeda.battles).toBe(3);
    expect(takeda.wins).toBe(1);
    expect(takeda.losses).toBe(2);
    expect(takeda.members).toBe(3); // 戦歴の最大人数を採用

    const uesugi = list[2];
    expect(uesugi.battles).toBe(0);
    expect(uesugi.members).toBe(1);
    expect(uesugi.decided).toBe(0);
    expect(uesugi.winRate).toBe(0);
  });
});

/**
 * 兵種テスト用の行ビルダー。
 * 左（注目側）の兵種名・武将名・勝敗、右（相手側）の兵種名を制御できる。
 */
function unitLine(opts: {
  year: number;
  selfName: string;
  selfUnit: string;
  selfBranch: string;
  oppUnit: string;
  result: string; // "<名前>の勝利" など
}): string {
  const { year, selfName, selfUnit, selfBranch, oppUnit, result } = opts;
  return `【1戦目】 ${year}年4月 06/15 10:00 京都 自国 ${selfName} 某家 武特 ${selfUnit} ${selfBranch} 槍 鎧 V.S. 敵国 敵将 敵家 統特 ${oppUnit} 騎兵 馬 旗 ${result} 12`;
}

describe("unitMatchupRanking / userWinRates", () => {
  const log: BattleRecord[] = [
    rec(
      unitLine({
        year: 1600,
        selfName: "信長",
        selfUnit: "ランセロ",
        selfBranch: "騎兵",
        oppUnit: "ドラグーン",
        result: "信長の勝利",
      }),
      1
    ),
    rec(
      unitLine({
        year: 1601,
        selfName: "信長",
        selfUnit: "ランセロ",
        selfBranch: "騎兵",
        oppUnit: "コサック",
        result: "敵将の勝利",
      }),
      2
    ),
    rec(
      unitLine({
        year: 1602,
        selfName: "光秀",
        selfUnit: "ランセロ",
        selfBranch: "騎兵",
        oppUnit: "ドラグーン",
        result: "光秀の勝利",
      }),
      3
    ),
  ];
  const outcomes = collectUnitBattles(log, "ランセロ");

  it("敵兵種ごとの相性を勝ち越し/負け越しで分ける", () => {
    const ranking = unitMatchupRanking(outcomes);
    // ドラグーン相手 2勝0敗(100%) → 相性の良い兵種
    expect(ranking.best[0].unit).toBe("ドラグーン");
    expect(ranking.best[0].winRate).toBeCloseTo(1);
    // コサック相手 0勝1敗(0%) → 苦手な兵種
    const cosaku = ranking.worst.find((s) => s.unit === "コサック");
    expect(cosaku?.winRate).toBeCloseTo(0);
    // 同じ兵種が良い／苦手の両方に出ない
    const bestUnits = ranking.best.map((s) => s.unit);
    const worstUnits = ranking.worst.map((s) => s.unit);
    expect(bestUnits.filter((u) => worstUnits.includes(u))).toHaveLength(0);
  });

  it("武将別の勝率を戦闘数の多い順に集計する", () => {
    const users = userWinRates(outcomes);
    expect(users[0].name).toBe("信長"); // 2戦で最多
    expect(users[0].wins).toBe(1);
    expect(users[0].losses).toBe(1);
    const mitsuhide = users.find((u) => u.name === "光秀")!;
    expect(mitsuhide.winRate).toBeCloseTo(1);
  });

  it("兵種ラベルは最多出現の兵種を返す", () => {
    expect(unitBranchLabel(outcomes)).toBe("騎兵");
  });
});

describe("unitUsageTrend", () => {
  it("ゲーム内年ごとの使用率（兵種登場数/全戦闘数）を返す", () => {
    const log: BattleRecord[] = [
      // 1600年: 2戦中1戦でランセロ登場 → 50%
      rec(
        unitLine({
          year: 1600,
          selfName: "信長",
          selfUnit: "ランセロ",
          selfBranch: "騎兵",
          oppUnit: "ドラグーン",
          result: "信長の勝利",
        }),
        1
      ),
      rec(
        unitLine({
          year: 1600,
          selfName: "秀吉",
          selfUnit: "コサック",
          selfBranch: "騎兵",
          oppUnit: "ドラグーン",
          result: "秀吉の勝利",
        }),
        2
      ),
      // 1601年: 1戦中1戦でランセロ登場 → 100%
      rec(
        unitLine({
          year: 1601,
          selfName: "信長",
          selfUnit: "ランセロ",
          selfBranch: "騎兵",
          oppUnit: "ドラグーン",
          result: "信長の勝利",
        }),
        3
      ),
    ];
    const trend = unitUsageTrend(log, "ランセロ");
    expect(trend.map((p) => p.year)).toEqual([1600, 1601]);
    expect(trend[0].rate).toBeCloseTo(0.5);
    expect(trend[1].rate).toBeCloseTo(1);
    // 勝敗数：1600・1601 とも信長（ランセロ側）が勝利している。
    expect(trend[0].wins).toBe(1);
    expect(trend[0].losses).toBe(0);
    expect(trend[0].decided).toBe(1);
    expect(trend[1].wins).toBe(1);
    expect(trend[1].losses).toBe(0);
  });
});

/**
 * SWI テスト用の戦闘行。出兵側武将名・戦目番号・戦闘時刻・勝者を指定する。
 * 同じ time を共有する行は「同一出兵」として扱われる。
 */
function swiLine(opts: {
  attacker: string;
  battleNo: number;
  time: string; // "MM/DD HH:mm"（出兵の識別子になる）
  win: boolean; // 出兵側が勝ったか
  defender?: string;
}): string {
  const { attacker, battleNo, time, win, defender = "敵将" } = opts;
  const result = win ? `${attacker}の勝利` : `${defender}の勝利`;
  return `【${battleNo}戦目】 1600年4月 ${time} 京都 自国 ${attacker} 某家 武特 騎馬隊 騎兵 槍 鎧 V.S. 敵国 ${defender} 敵家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`;
}

/**
 * アシストテスト用の戦闘行。左右の武将名・時刻・勝者を指定できる。
 */
function assistLine(opts: {
  leftName: string;
  rightName: string;
  time: string; // "MM/DD HH:mm"
  winner: "left" | "right";
  battleNo?: number;
}): string {
  const { leftName, rightName, time, winner, battleNo = 1 } = opts;
  const result = winner === "left" ? `${leftName}の勝利` : `${rightName}の勝利`;
  return `【${battleNo}戦目】 1600年4月 ${time} 京都 自国 ${leftName} 某家 武特 騎馬隊 騎兵 槍 鎧 V.S. 敵国 ${rightName} 敵家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`;
}

/** 効率テスト用の戦闘行（勝敗生テキストを直接指定）。 */
function efficiencyLine(opts: {
  leftName: string;
  rightName: string;
  time: string;
  resultRaw: string;
  battleNo?: number;
}): string {
  const { leftName, rightName, time, resultRaw, battleNo = 1 } = opts;
  return `【${battleNo}戦目】 1600年4月 ${time} 京都 自国 ${leftName} 某家 武特 騎馬隊 騎兵 槍 鎧 V.S. 敵国 ${rightName} 敵家 統特 騎馬隊 騎兵 馬 旗 ${resultRaw} 12`;
}

/** ランキングの国別集計用。左右の国・武将・兵種・装備を独立して指定する。 */
function countryRankingLine(opts: {
  time: string;
  leftFaction: string;
  leftName: string;
  rightFaction: string;
  rightName: string;
  winner: "left" | "right" | "retreat";
  year?: number;
  battleNo?: number;
  leftUnit?: string;
  rightUnit?: string;
  leftItem?: string;
  rightItem?: string;
  leftWeapon?: string;
  rightWeapon?: string;
}): string {
  const {
    time,
    leftFaction,
    leftName,
    rightFaction,
    rightName,
    winner,
    year = 1600,
    battleNo = 1,
    leftUnit = "赤備",
    rightUnit = "青備",
    leftItem = "赤飾",
    rightItem = "青飾",
    leftWeapon = "赤剣",
    rightWeapon = "青剣",
  } = opts;
  const result =
    winner === "retreat"
      ? "撤退"
      : `${winner === "left" ? leftName : rightName}の勝利`;
  return `【${battleNo}戦目】 ${year}年4月 ${time} 京都 ${leftFaction} ${leftName} ${leftName}家 武特 ${leftUnit} 騎兵 ${leftItem} ${leftWeapon} V.S. ${rightFaction} ${rightName} ${rightName}家 統特 ${rightUnit} 歩兵 ${rightItem} ${rightWeapon} ${result} 12`;
}

describe("アシスト（warlordRanking）", () => {
  it("撃破効率（平均枚抜き）は 出兵勝利数 ÷ 出兵数 で計算される", () => {
    const log: BattleRecord[] = [
      // 出兵1（10:00）で2勝
      rec(
        assistLine({
          leftName: "A",
          rightName: "B",
          time: "06/15 10:00",
          winner: "left",
          battleNo: 1,
        }),
        1
      ),
      rec(
        assistLine({
          leftName: "A",
          rightName: "C",
          time: "06/15 10:00",
          winner: "left",
          battleNo: 2,
        }),
        2
      ),
      // 出兵2（11:00）で1勝
      rec(
        assistLine({
          leftName: "A",
          rightName: "D",
          time: "06/15 11:00",
          winner: "left",
          battleNo: 1,
        }),
        3
      ),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.attackWins).toBe(3);
    expect(a?.attackSorties).toBe(2);
    expect(a?.avgBreakthrough).toBeCloseTo(1.5);
  });

  it("守備効率は 守備勝利数 ÷ 守備出兵数 で計算される", () => {
    const log: BattleRecord[] = [
      // 守備出兵1（10:00）で2勝
      rec(
        assistLine({
          leftName: "B",
          rightName: "A",
          time: "06/15 10:00",
          winner: "right",
          battleNo: 1,
        }),
        1
      ),
      rec(
        assistLine({
          leftName: "C",
          rightName: "A",
          time: "06/15 10:00",
          winner: "right",
          battleNo: 2,
        }),
        2
      ),
      // 守備出兵2（11:00）で1勝
      rec(
        assistLine({
          leftName: "D",
          rightName: "A",
          time: "06/15 11:00",
          winner: "right",
          battleNo: 1,
        }),
        3
      ),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.defenseWins).toBe(3);
    expect(a?.defenseSorties).toBe(2);
    expect(a?.defenseEfficiency).toBeCloseTo(1.5);
  });

  it("撃破効率は撤退戦を分母・分子に含めない", () => {
    const log: BattleRecord[] = [
      // 10:00 出兵は撤退 -> 除外される
      rec(
        efficiencyLine({
          leftName: "A",
          rightName: "B",
          time: "06/15 10:00",
          resultRaw: "撤退",
        }),
        1
      ),
      // 11:00 出兵のみ有効
      rec(
        efficiencyLine({
          leftName: "A",
          rightName: "C",
          time: "06/15 11:00",
          resultRaw: "Aの勝利",
        }),
        2
      ),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.attackSorties).toBe(1);
    expect(a?.attackWins).toBe(1);
    expect(a?.avgBreakthrough).toBeCloseTo(1);
  });

  it("守備効率は撤退戦を分母・分子に含めない", () => {
    const log: BattleRecord[] = [
      // 10:00 守備出兵は撤退 -> 除外される
      rec(
        efficiencyLine({
          leftName: "B",
          rightName: "A",
          time: "06/15 10:00",
          resultRaw: "撤退",
        }),
        1
      ),
      // 11:00 守備出兵のみ有効
      rec(
        efficiencyLine({
          leftName: "C",
          rightName: "A",
          time: "06/15 11:00",
          resultRaw: "Aの勝利",
        }),
        2
      ),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.defenseSorties).toBe(1);
    expect(a?.defenseWins).toBe(1);
    expect(a?.defenseEfficiency).toBeCloseTo(1);
  });

  it("削った 40 分以内に相手が別イベントで倒されたらアシスト獲得", () => {
    const log: BattleRecord[] = [
      // 守備側 A が 10:00 に B の出兵を撃退（削る）
      rec(assistLine({ leftName: "B", rightName: "A", time: "06/15 10:00", winner: "right" }), 1),
      // 30 分後に C が B を倒す
      rec(assistLine({ leftName: "B", rightName: "C", time: "06/15 10:30", winner: "right" }), 2),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    const c = ranking.find((r) => r.name === "C");
    expect(a?.assists).toBe(1);
    expect(c?.assists).toBe(0); // C は直接勝利
  });

  it("40 分超過後に倒された場合はアシストなし", () => {
    const log: BattleRecord[] = [
      rec(assistLine({ leftName: "B", rightName: "A", time: "06/15 10:00", winner: "right" }), 1),
      // 50 分後（窓外）
      rec(assistLine({ leftName: "B", rightName: "C", time: "06/15 10:50", winner: "right" }), 2),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.assists).toBe(0);
  });

  it("出兵側が勝った場合もアシストが発生する", () => {
    const log: BattleRecord[] = [
      // A が出兵側として 12:00 に B の守備を破る
      rec(assistLine({ leftName: "A", rightName: "B", time: "06/15 12:00", winner: "left" }), 1),
      // 15 分後に別の出兵者 C が B を倒す
      rec(assistLine({ leftName: "C", rightName: "B", time: "06/15 12:15", winner: "left" }), 2),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.assists).toBe(1);
  });

  it("複数イベントでアシストが累積される", () => {
    const log: BattleRecord[] = [
      // A が 10:00 に B を削る -> 10:30 に C が B を倒す
      rec(assistLine({ leftName: "B", rightName: "A", time: "06/15 10:00", winner: "right" }), 1),
      rec(assistLine({ leftName: "B", rightName: "C", time: "06/15 10:30", winner: "right" }), 2),
      // A が 11:00 に D を削る -> 11:20 に E が D を倒す
      rec(assistLine({ leftName: "D", rightName: "A", time: "06/15 11:00", winner: "right" }), 3),
      rec(assistLine({ leftName: "D", rightName: "E", time: "06/15 11:20", winner: "right" }), 4),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    expect(a?.assists).toBe(2);
  });

  it("同一 battleAt（同時刻）の別ラウンドは窓に含めない", () => {
    // A と C が同じ 10:00 に B を倒す → 互いの削りに対して同時刻倒しはカウントしない
    const log: BattleRecord[] = [
      rec(assistLine({ leftName: "B", rightName: "A", time: "06/15 10:00", winner: "right" }), 1),
      rec(assistLine({ leftName: "B", rightName: "C", time: "06/15 10:00", winner: "right" }), 2),
    ];
    const ranking = warlordRanking(log);
    const a = ranking.find((r) => r.name === "A");
    const c = ranking.find((r) => r.name === "C");
    expect(a?.assists).toBe(0);
    expect(c?.assists).toBe(0);
  });
});

describe("warlordRanking は【壁戦】の守備側（壁）を武将として集計しない", () => {
  it("壁を攻撃して勝った場合、守備隊はランキングに出ず出兵側だけ集計される", () => {
    const line =
      "【壁戦】 1666年12月 08/04 23:59 平戸への遠征 海戦 エロゲソング同好会 SINCLAIR キャラメルBOX 統特 モニター艦 特殊船 龍の護符 攻城櫓 V.S. ななせ国 平戸の守備隊 下級城壁兵 壁 なし なし SINCLAIRの勝利 3";
    const ranking = warlordRanking([rec(line, 1)]);
    expect(ranking.some((r) => r.name === "平戸の守備隊")).toBe(false);
    const sinclair = ranking.find((r) => r.name === "SINCLAIR");
    expect(sinclair?.attackSorties).toBe(1);
    expect(sinclair?.attackWins).toBe(1);
  });

  it("壁が守備に成功した（守備隊の勝利）場合も守備隊はランキングに出ない", () => {
    const line =
      "【壁戦】 1606年4月 07/25 21:03 久留米 ななせ国 風真いろは 風真いろは家 統特 剣兵 歩兵 銀の護符 ピコピコハンマー V.S. 己鯖冷笑プレイヤー族 久留米の守備隊 精鋭城壁兵 壁 なし なし 久留米の守備隊の勝利 6";
    const ranking = warlordRanking([rec(line, 1)]);
    expect(ranking.some((r) => r.name === "久留米の守備隊")).toBe(false);
    // 出兵側（攻撃して敗れた側）は守備効率・勝率の計算対象として残る。
    const kazama = ranking.find((r) => r.name === "風真いろは");
    expect(kazama?.attackSorties).toBe(1);
    expect(kazama?.attackWins).toBe(0);
  });
});

describe("weaponStats / itemStats", () => {
  // 防衛側 勝頼: 武将の持つ品物=金の兜(品物) 武将の持つ武器=カルバリン砲(武器)。
  function equipLine(time: string, result: string): string {
    return `【1戦目】 1600年4月 ${time} 京都 織田 信長 織田家 武特 騎馬隊 騎兵 金の腕輪 鬼丸 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 金の兜 カルバリン砲 ${result} 12`;
  }
  const log: BattleRecord[] = [
    rec(equipLine("04/10 10:00", "信長の勝利"), 1),
    rec(equipLine("04/11 11:00", "信長の勝利"), 2),
  ];

  it("武器は武将の持つ武器列を集計し、品物（武将の持つ品物列）は含まない", () => {
    const names = weaponStats(log).map((w) => w.name);
    expect(names).toContain("鬼丸");
    expect(names).toContain("カルバリン砲");
    expect(names).not.toContain("金の腕輪");
    expect(names).not.toContain("金の兜");
  });

  it("武器の攻守・勝敗・使用武将を集計する", () => {
    const oni = weaponStats(log).find((w) => w.name === "鬼丸")!;
    expect(oni.battles).toBe(2);
    expect(oni.attackUses).toBe(2);
    expect(oni.defenseUses).toBe(0);
    expect(oni.wins).toBe(2);
    expect(oni.winRate).toBeCloseTo(1);
    expect(oni.topUsers[0]).toEqual({ name: "信長", count: 2 });
  });

  it("品物は武将の持つ品物列を集計し、武器（武将の持つ武器列）は含まない", () => {
    const names = itemStats(log).map((i) => i.name);
    expect(names).toContain("金の腕輪");
    expect(names).toContain("金の兜");
    expect(names).not.toContain("鬼丸");
    expect(names).not.toContain("カルバリン砲");
  });

  it("品物の防衛側使用・敗北を集計する", () => {
    const kabuto = itemStats(log).find((i) => i.name === "金の兜")!;
    expect(kabuto.battles).toBe(2);
    expect(kabuto.defenseUses).toBe(2);
    expect(kabuto.attackUses).toBe(0);
    expect(kabuto.losses).toBe(2);
    expect(kabuto.winRate).toBeCloseTo(0);
  });

  it("詳細収集は武器=equip2、品物=equip1の列対応を維持する", () => {
    const oneBattle = [rec(equipLine("04/10 10:00", "信長の勝利"), 1)];

    expect(
      collectEquipBattles(oneBattle, "鬼丸", "weapon").map((o) => o.side)
    ).toEqual(["left"]);
    expect(
      collectEquipBattles(oneBattle, "カルバリン砲", "weapon").map(
        (o) => o.side
      )
    ).toEqual(["right"]);
    expect(
      collectEquipBattles(oneBattle, "金の腕輪", "item").map((o) => o.side)
    ).toEqual(["left"]);
    expect(
      collectEquipBattles(oneBattle, "金の兜", "item").map((o) => o.side)
    ).toEqual(["right"]);

    expect(collectEquipBattles(oneBattle, "鬼丸", "item")).toEqual([]);
    expect(collectEquipBattles(oneBattle, "金の腕輪", "weapon")).toEqual([]);
  });

  it.each([
    { slot: "weapon" as const, name: "共有武器" },
    { slot: "item" as const, name: "共用品物" },
  ])("左右双方が同じ$slotを持つ戦闘は2視点で収集する", ({ slot, name }) => {
    const sharedLine = equipLine("04/10 10:00", "信長の勝利")
      .replace("金の腕輪 鬼丸", "共用品物 共有武器")
      .replace("金の兜 カルバリン砲", "共用品物 共有武器");

    const outcomes = collectEquipBattles([rec(sharedLine, 1)], name, slot);

    expect(outcomes.map((o) => o.side)).toEqual(["left", "right"]);
    expect(outcomes.map((o) => o.self.name)).toEqual(["信長", "勝頼"]);
    expect(outcomes[0].record).toBe(outcomes[1].record);
  });

  it("同じ戦闘の重複は入力順で最初のレコードと解析結果を保持する", () => {
    const first: BattleRecord = {
      ...rec(equipLine("04/10 10:00", "信長の勝利"), 10),
      id: 101,
    };
    const duplicate: BattleRecord = {
      ...rec(
        equipLine("04/10 10:00", "信長の勝利").replace(/ 12$/, " 8"),
        20
      ),
      id: 202,
    };

    const outcomes = collectEquipBattles(
      [first, duplicate],
      "鬼丸",
      "weapon"
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].record).toBe(first);
    expect(outcomes[0].record.id).toBe(101);
    expect(outcomes[0].card.turns).toBe("12");
  });

  it("実時刻の新しい順、同時刻はsavedAt降順、日時不明は末尾に並べる", () => {
    const makeDetailRecord = (
      id: number,
      time: string,
      savedAt: number,
      opponent: string
    ): BattleRecord => ({
      ...rec(
        equipLine(time, "信長の勝利").replace("勝頼", opponent),
        savedAt
      ),
      id,
    });
    const latest = makeDetailRecord(1, "04/11 11:00", 1, "最新");
    const tiedOlderSave = makeDetailRecord(2, "04/10 10:00", 100, "同時刻A");
    const tiedNewerSave = makeDetailRecord(3, "04/10 10:00", 200, "同時刻B");
    const oldest = makeDetailRecord(4, "04/09 09:00", 999, "最古");
    const undated: BattleRecord = {
      ...makeDetailRecord(5, "04/12 12:00", 300, "日時不明"),
      time: undefined,
    };

    const outcomes = collectEquipBattles(
      [undated, oldest, tiedOlderSave, latest, tiedNewerSave],
      "鬼丸",
      "weapon"
    );

    expect(outcomes.map((o) => o.record.id)).toEqual([1, 3, 2, 4, 5]);
  });
});

describe("unitStats", () => {
  // 出兵側 信長: 左側、防衛側 勝頼: 右側。末尾 12 はターン数。
  function line(o: {
    leftUnit?: string;
    leftBranch?: string;
    rightUnit?: string;
    rightBranch?: string;
    result: string;
    time: string;
  }): string {
    const {
      leftUnit = "騎馬隊",
      leftBranch = "騎兵",
      rightUnit = "足軽隊",
      rightBranch = "歩兵",
      result,
      time,
    } = o;
    return `【1戦目】 1600年4月 ${time} 京都 織田 信長 織田家 武特 ${leftUnit} ${leftBranch} 槍 饧 V.S. 武田 勝頼 武田家 統特 ${rightUnit} ${rightBranch} 馬 旗 ${result} 12`;
  }

  const log: BattleRecord[] = [
    rec(line({ result: "信長の勝利", time: "04/10 10:00" }), 1),
    rec(line({ result: "信長の勝利", time: "04/11 11:00" }), 2),
    rec(line({ result: "勝頼の勝利", time: "04/12 12:00" }), 3),
  ];

  it("兵種ごとに使用回数・勝率・代表兵種・主な使用武将を集計する", () => {
    const stats = unitStats(log);
    const kiba = stats.find((s) => s.unit === "騎馬隊")!;
    // 騎馬隊は左(信長)で 3 回出兵: 2勝1敗。
    expect(kiba.battles).toBe(3);
    expect(kiba.attackUses).toBe(3);
    expect(kiba.defenseUses).toBe(0);
    expect(kiba.wins).toBe(2);
    expect(kiba.losses).toBe(1);
    expect(kiba.decided).toBe(3);
    expect(kiba.winRate).toBeCloseTo(2 / 3);
    expect(kiba.branch).toBe("騎兵");
    expect(kiba.topUsers[0]).toEqual({ name: "信長", count: 3 });

    const ashi = stats.find((s) => s.unit === "足軽隊")!;
    // 足軽隊は右(勝頼)で 3 回出兵: 1勝2敗。
    expect(ashi.battles).toBe(3);
    expect(ashi.defenseUses).toBe(3);
    expect(ashi.wins).toBe(1);
    expect(ashi.losses).toBe(2);
    expect(ashi.branch).toBe("歩兵");
  });

  it("使用回数の多い順に並ぶ", () => {
    const more: BattleRecord[] = [
      ...log,
      rec(
        line({
          leftUnit: "鉄砲隊",
          leftBranch: "鉄砲",
          result: "信長の勝利",
          time: "04/13 13:00",
        }),
        4
      ),
    ];
    // 足軽隊(右4戦) > 騎馬隊(左3戦) > 鉄砲隊(左1戦)。
    const order = unitStats(more).map((s) => s.unit);
    expect(order).toEqual(["足軽隊", "騎馬隊", "鉄砲隊"]);
  });
});

describe("formatWinRate", () => {
  it("勝率を小数点第1位のパーセントにする", () => {
    expect(formatWinRate(0.666, 30)).toBe("66.6%");
    expect(formatWinRate(0.5, 2)).toBe("50.0%");
    expect(formatWinRate(1, 4)).toBe("100.0%");
    expect(formatWinRate(0, 3)).toBe("0.0%");
  });

  it("決着していない（decided が 0 以下）ときは — を返す", () => {
    expect(formatWinRate(0, 0)).toBe("—");
    expect(formatWinRate(0.5, 0)).toBe("—");
    expect(formatWinRate(0.5, -1)).toBe("—");
  });
});

describe("equipSynergy", () => {
  // 注目側=織田 信長（品物=item / 武器=weapon）、相手側は装備なしで集計対象外。
  function line(o: {
    item?: string;
    weapon?: string;
    result: string;
    time: string;
  }): string {
    const { item = "金の腕輪", weapon = "鬼丸", result, time } = o;
    return `【1戦目】 1600年4月 ${time} 京都 織田 信長 織田家 武特 騎馬隊 騎兵 ${item} ${weapon} V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 なし なし ${result} 12`;
  }

  const log: BattleRecord[] = [
    rec(line({ result: "信長の勝利", time: "04/10 10:00" }), 1),
    rec(line({ result: "信長の勝利", time: "04/11 11:00" }), 2),
    rec(line({ result: "勝頼の勝利", time: "04/12 12:00" }), 3),
    rec(line({ item: "なし", result: "信長の勝利", time: "04/13 13:00" }), 4), // 品物なし → 除外
  ];

  it("武器×品物の組み合わせごとに勝率を集計する", () => {
    const stats = equipSynergy(log);
    // 相手側は装備なしで除外されるため、組み合わせは1つだけ。
    expect(stats).toHaveLength(1);
    const s = stats[0];
    expect(s.weapon).toBe("鬼丸");
    expect(s.item).toBe("金の腕輪");
    expect(s.battles).toBe(3); // 品物なしの1戦を除く
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.decided).toBe(3);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.topUsers[0]).toEqual({ name: "信長", count: 3 });
  });

  it("片方でも装備が欠ける側は組み合わせ集計に含めない", () => {
    const noItem: BattleRecord[] = [
      rec(line({ item: "なし", result: "信長の勝利", time: "06/10 10:00" }), 1),
    ];
    expect(equipSynergy(noItem)).toHaveLength(0);
  });
});

describe("traitMatchupMatrix / collectTraitMatchupBattles", () => {
  // 出兵側（左）の特性 leftType・防衛側（右）の特性 rightType を差し替える。
  // dedup（battleAt の年月+時刻＋名前＋勝者でキー化）を避けるため時刻と名前は毎回変える。
  function matrixLine(o: {
    leftType: string;
    rightType: string;
    leftName: string;
    rightName: string;
    winner: "left" | "right";
    time: string; // "MM/DD HH:mm"
  }): string {
    const result =
      o.winner === "left" ? `${o.leftName}の勝利` : `${o.rightName}の勝利`;
    return `【1戦目】 1600年4月 ${o.time} 京都 自国 ${o.leftName} 某家 ${o.leftType} 騎馬隊 騎兵 槍 鎧 V.S. 敵国 ${o.rightName} 敵家 ${o.rightType} 騎馬隊 騎兵 馬 旗 ${result} 12`;
  }

  const log: BattleRecord[] = [
    // 統特 が 知特 に 2勝1敗（出兵側＝左）
    rec(matrixLine({ leftType: "統特", rightType: "知特", leftName: "統A", rightName: "知A", winner: "left", time: "04/10 10:00" }), 1),
    rec(matrixLine({ leftType: "統特", rightType: "知特", leftName: "統B", rightName: "知B", winner: "left", time: "04/10 11:00" }), 2),
    rec(matrixLine({ leftType: "統特", rightType: "知特", leftName: "統C", rightName: "知C", winner: "right", time: "04/10 12:00" }), 3),
    // 知特 が 統特 に 1勝（鏡のマス）
    rec(matrixLine({ leftType: "知特", rightType: "統特", leftName: "知D", rightName: "統D", winner: "left", time: "04/10 13:00" }), 4),
    // 政治家 は MATCHUP_TRAITS 外 → 除外される
    rec(matrixLine({ leftType: "政治家", rightType: "統特", leftName: "政E", rightName: "統E", winner: "left", time: "04/10 14:00" }), 5),
  ];

  const idx = (t: string) => MATCHUP_TRAITS.indexOf(t);

  it("出兵側視点で 行＝出兵特性 × 列＝防衛特性 の勝敗を集計する", () => {
    const { traits, matrix } = traitMatchupMatrix(log);
    expect(traits).toEqual(MATCHUP_TRAITS);
    const cell = matrix[idx("統特")][idx("知特")];
    expect(cell.battles).toBe(3);
    expect(cell.wins).toBe(2);
    expect(cell.losses).toBe(1);
    expect(cell.decided).toBe(3);
    expect(cell.winRate).toBeCloseTo(2 / 3);
  });

  it("鏡のマス（知特→統特）は別集計になる", () => {
    const { matrix } = traitMatchupMatrix(log);
    const mirror = matrix[idx("知特")][idx("統特")];
    expect(mirror.battles).toBe(1);
    expect(mirror.wins).toBe(1);
    expect(mirror.winRate).toBeCloseTo(1);
  });

  it("対戦のないマスは 0 戦・勝率0 になる", () => {
    const { matrix } = traitMatchupMatrix(log);
    const empty = matrix[idx("武特")][idx("統知")];
    expect(empty.battles).toBe(0);
    expect(empty.decided).toBe(0);
    expect(empty.winRate).toBe(0);
  });

  it("MATCHUP_TRAITS 外の特性（政治家など）は集計対象から除外する", () => {
    const { matrix } = traitMatchupMatrix(log);
    const total = matrix.flat().reduce((sum, c) => sum + c.battles, 0);
    expect(total).toBe(4); // 政治家の1戦を除く
  });

  it("年の範囲で期間を絞る（範囲外なら全マス0）", () => {
    // フィクスチャは全て 1600 年→範囲外では 0 戦
    const { matrix } = traitMatchupMatrix(log, { from: 1700, to: 1800 });
    expect(matrix.flat().reduce((s, c) => s + c.battles, 0)).toBe(0);
    // 範囲内なら MATCHUP_TRAITS 内の全戦を含む
    const all = traitMatchupMatrix(log, { from: 1590, to: 1610 });
    expect(all.matrix.flat().reduce((s, c) => s + c.battles, 0)).toBe(4);
  });

  it("collectTraitMatchupBattles はそのマスの戦闘を新しい順で返す", () => {
    const battles = collectTraitMatchupBattles(log, "統特", "知特");
    expect(battles).toHaveLength(3);
    // 全て出兵側視点
    expect(battles.every((b) => b.side === "left")).toBe(true);
    // 新しい順（12:00 が先頭・敗北）
    expect(battles[0].result).toBe("loss");
  });
});

describe("metaTier", () => {
  it("採用率と勝率の条件で S+ / S / A+ を判定する", () => {
    expect(metaTier(0.2, 0.7, 20)).toBe("S+");
    expect(metaTier(0.12, 0.62, 20)).toBe("S");
    expect(metaTier(0.06, 0.56, 20)).toBe("A+");
  });

  it("S 系の条件に届かない場合は勝率で A / B / C を判定する", () => {
    expect(metaTier(0.5, 0.53, 20)).toBe("A"); // 高採用だが勝率が A+ 未満
    expect(metaTier(0.5, 0.46, 20)).toBe("B");
    expect(metaTier(0.5, 0.4, 20)).toBe("C");
  });

  it("確定戦数が不足すると null（サンプル不足）", () => {
    expect(metaTier(0.9, 0.9, 5)).toBeNull();
  });
});

describe("metaOverview", () => {
  // 8 トークン/側: 国 名前 家 タイプ 兵種 兵種 武将の持つ品物 武将の持つ武器
  function metaLine(o: {
    leftUnit: string;
    leftBranch: string;
    rightUnit: string;
    rightName: string;
    leftName: string;
    winner: "left" | "right";
    time: string; // "MM/DD HH:mm"
  }): string {
    const result =
      o.winner === "left" ? `${o.leftName}の勝利` : `${o.rightName}の勝利`;
    return `【1戦目】 1600年4月 ${o.time} 京都 自国 ${o.leftName} 某家 武特 ${o.leftUnit} ${o.leftBranch} 槍 鎧 V.S. 敵国 ${o.rightName} 敵家 統特 ${o.rightUnit} 弓兵 馬 旗 ${result} 12`;
  }

  // 左側は常に「騎馬隊（騎兵）」。古い6戦（04/10）は 2勝4敗、新しい6戦（04/11）は 6勝0敗。
  // 合計 8勝4敗（勝率 2/3）／採用率 12/(2*12)=0.5 → S+。トレンドは +（直近で上昇）。
  const log: BattleRecord[] = [];
  let savedAt = 0;
  for (let i = 0; i < 6; i++) {
    log.push(
      rec(
        metaLine({
          leftUnit: "騎馬隊",
          leftBranch: "騎兵",
          rightUnit: `歩兵${i}`,
          leftName: `自将O${i}`,
          rightName: `敵将O${i}`,
          winner: i < 2 ? "left" : "right", // 2勝4敗
          time: `04/10 1${i}:00`,
        }),
        savedAt++
      )
    );
  }
  for (let i = 0; i < 6; i++) {
    log.push(
      rec(
        metaLine({
          leftUnit: "騎馬隊",
          leftBranch: "騎兵",
          rightUnit: `弓組${i}`,
          leftName: `自将N${i}`,
          rightName: `敵将N${i}`,
          winner: "left", // 6勝0敗
          time: `04/11 1${i}:00`,
        }),
        savedAt++
      )
    );
  }

  it("総戦闘数を数える", () => {
    expect(metaOverview(log).totalBattles).toBe(12);
  });

  it("兵種ごとの採用率・勝率を集計し、採用率の高い順に並べる", () => {
    const { units } = metaOverview(log);
    const top = units[0];
    expect(top.unit).toBe("騎馬隊");
    expect(top.appearances).toBe(12);
    expect(top.pickRate).toBeCloseTo(0.5); // 12 / (2*12)
    expect(top.decided).toBe(12);
    expect(top.winRate).toBeCloseTo(8 / 12);
  });

  it("採用率・勝率の高い兵種を S+ と判定する", () => {
    const top = metaOverview(log).units[0];
    expect(top.tier).toBe("S+");
  });

  it("直近で勝率が上がった兵種はトレンドが正になる", () => {
    const top = metaOverview(log).units[0];
    // 直近6戦=6/6、古い6戦=2/6 → 1 - 1/3 ≈ +0.667
    expect(top.trend).not.toBeNull();
    expect(top.trend as number).toBeCloseTo(1 - 2 / 6);
  });

  it("特性別の勝率を攻守両側で集計する", () => {
    const { traits } = metaOverview(log);
    const buToku = traits.find((t) => t.trait === "武特");
    const touToku = traits.find((t) => t.trait === "統特");
    expect(buToku?.appearances).toBe(12);
    expect(buToku?.winRate).toBeCloseTo(8 / 12); // 左＝出兵側
    expect(touToku?.appearances).toBe(12);
    expect(touToku?.winRate).toBeCloseTo(4 / 12); // 右＝防衛側（鏡）
  });

  it("支配的な兵種（S+）に環境警告を出す", () => {
    const { warnings } = metaOverview(log);
    const dominant = warnings.find((w) => w.level === "dominant");
    expect(dominant?.unit).toBe("騎馬隊");
  });

  it("年の範囲で期間を絞る", () => {
    // フィクスチャは全て 1600 年→範囲外は空
    const out = metaOverview(log, { from: 1700, to: 1800 });
    expect(out.totalBattles).toBe(0);
    expect(out.units).toHaveLength(0);
    // 範囲内なら全 12 戦を集計
    expect(metaOverview(log, { from: 1590, to: 1610 }).totalBattles).toBe(12);
  });

  it("武将タイプで兵種ランキングを絞り込み、採用率はタイプ内の割合にする", () => {
    // 武特（左側）は常に騎馬隊。武特で絞ると騎馬隊のみ・タイプ内採用率は 100%。
    const { units, warnings } = metaOverview(log, undefined, "武特");
    expect(units).toHaveLength(1);
    expect(units[0].unit).toBe("騎馬隊");
    expect(units[0].appearances).toBe(12);
    expect(units[0].pickRate).toBeCloseTo(1); // 12 / 12（タイプ内）
    expect(units[0].winRate).toBeCloseTo(8 / 12);
    // 絞り込み時は全体基準の環境警告を出さない。
    expect(warnings).toHaveLength(0);
  });

  it("武将タイプで絞り込んでも特性別の勝率は全タイプを残す（比較ビュー）", () => {
    const { traits } = metaOverview(log, undefined, "武特");
    expect(traits.find((t) => t.trait === "武特")).toBeTruthy();
    expect(traits.find((t) => t.trait === "統特")).toBeTruthy();
  });
});

describe("META_PERIODS", () => {
  it("ゲーム内の年バケットを西暦の範囲で定義する", () => {
    const byKey = Object.fromEntries(META_PERIODS.map((p) => [p.key, p]));
    expect(byKey.y06).toMatchObject({ label: "06年-11年", from: 1606, to: 1611 });
    expect(byKey.y60).toMatchObject({ label: "60年以降", from: 1660, to: null });
    expect(byKey.all).toMatchObject({ from: null, to: null });
  });
});

/**
 * ホーム画面用の柔軟な戦闘行ビルダー。
 * 注目側の兵種・相手の特性（タイプ）を差し替えられるようにする。
 */
function homeLine(opts: {
  year: number;
  time: string; // "MM/DD HH:mm"
  self: string;
  selfUnit: string;
  opponent: string;
  oppType: string;
  result: string; // "<名前>の勝利" など
}): string {
  const { year, time, self, selfUnit, opponent, oppType, result } = opts;
  return `【1戦目】 ${year}年4月 ${time} 京都 織田 ${self} 織田家 武特 ${selfUnit} 騎兵 槍 鎧 V.S. 武田 ${opponent} 某家 ${oppType} 騎馬隊 騎兵 馬 旗 ${result} 12`;
}

describe("selfUnitStats（兵種別の習熟度）", () => {
  const log: BattleRecord[] = [
    rec(homeLine({ year: 1600, time: "04/10 10:00", self: "信長", selfUnit: "鉄砲隊", opponent: "勝頼", oppType: "統特", result: "信長の勝利" }), 1),
    rec(homeLine({ year: 1601, time: "04/11 11:00", self: "信長", selfUnit: "鉄砲隊", opponent: "謙信", oppType: "統特", result: "信長の勝利" }), 2),
    rec(homeLine({ year: 1602, time: "04/12 12:00", self: "信長", selfUnit: "鉄砲隊", opponent: "元就", oppType: "統特", result: "元就の勝利" }), 3),
    rec(homeLine({ year: 1603, time: "04/13 13:00", self: "信長", selfUnit: "騎馬隊", opponent: "氏康", oppType: "統特", result: "信長の勝利" }), 4),
    rec(homeLine({ year: 1604, time: "04/14 14:00", self: "信長", selfUnit: "騎馬隊", opponent: "義元", oppType: "統特", result: "義元の勝利" }), 5),
  ];

  it("使用兵種ごとに勝率を集計し、戦闘数の多い順に並べる", () => {
    const outcomes = collectWarlordBattles(log, "信長");
    const stats = selfUnitStats(outcomes);
    expect(stats.map((s) => s.unit)).toEqual(["鉄砲隊", "騎馬隊"]);

    const tepo = stats[0];
    expect(tepo).toMatchObject({ battles: 3, wins: 2, losses: 1, decided: 3 });
    expect(tepo.winRate).toBeCloseTo(2 / 3);

    const kiba = stats[1];
    expect(kiba).toMatchObject({ battles: 2, wins: 1, losses: 1, decided: 2 });
    expect(kiba.winRate).toBeCloseTo(0.5);
  });

  it("空配列なら空を返す", () => {
    expect(selfUnitStats([])).toEqual([]);
  });
});

describe("opponentTraitStats（相手特性別の勝率）", () => {
  const log: BattleRecord[] = [
    rec(homeLine({ year: 1600, time: "04/10 10:00", self: "信長", selfUnit: "鉄砲隊", opponent: "勝頼", oppType: "統特", result: "信長の勝利" }), 1),
    rec(homeLine({ year: 1601, time: "04/11 11:00", self: "信長", selfUnit: "鉄砲隊", opponent: "謙信", oppType: "統特", result: "信長の勝利" }), 2),
    rec(homeLine({ year: 1602, time: "04/12 12:00", self: "信長", selfUnit: "鉄砲隊", opponent: "元就", oppType: "統特", result: "元就の勝利" }), 3),
    rec(homeLine({ year: 1603, time: "04/13 13:00", self: "信長", selfUnit: "鉄砲隊", opponent: "氏康", oppType: "知特", result: "氏康の勝利" }), 4),
    rec(homeLine({ year: 1604, time: "04/14 14:00", self: "信長", selfUnit: "鉄砲隊", opponent: "義元", oppType: "知特", result: "義元の勝利" }), 5),
  ];

  it("相手の特性ごとに勝率を集計し、戦闘数の多い順に並べる", () => {
    const outcomes = collectWarlordBattles(log, "信長");
    const stats = opponentTraitStats(outcomes);
    expect(stats.map((s) => s.trait)).toEqual(["統特", "知特"]);

    const tou = stats[0];
    expect(tou).toMatchObject({ battles: 3, wins: 2, losses: 1, decided: 3 });
    expect(tou.winRate).toBeCloseTo(2 / 3);

    const chi = stats[1];
    expect(chi).toMatchObject({ battles: 2, wins: 0, losses: 2, decided: 2 });
    expect(chi.winRate).toBe(0);
  });

  it("空配列なら空を返す", () => {
    expect(opponentTraitStats([])).toEqual([]);
  });
});

describe("weeklyWinRateTrend（先週比の勝率）", () => {
  // 基準 = 最新の戦闘日時（このログでは 06/22 10:00）。日付が進んでも窓は動かない。
  // 今週 = (06/15 10:00, 06/22 10:00]、先週 = (06/08 10:00, 06/15 10:00]。
  // now は parseActionDate の年補完（2026 年として解釈）にのみ使う。
  const now = new Date(2026, 5, 23, 12, 0, 0);
  const log: BattleRecord[] = [
    // 今週（2勝1敗 → 勝率 2/3）
    rec(homeLine({ year: 1600, time: "06/22 10:00", self: "信長", selfUnit: "鉄砲隊", opponent: "勝頼", oppType: "統特", result: "信長の勝利" }), 6),
    rec(homeLine({ year: 1600, time: "06/20 11:00", self: "信長", selfUnit: "鉄砲隊", opponent: "謙信", oppType: "統特", result: "信長の勝利" }), 5),
    rec(homeLine({ year: 1600, time: "06/18 12:00", self: "信長", selfUnit: "鉄砲隊", opponent: "元就", oppType: "統特", result: "元就の勝利" }), 4),
    // 先週（1勝1敗 → 勝率 0.5）
    rec(homeLine({ year: 1600, time: "06/14 13:00", self: "信長", selfUnit: "鉄砲隊", opponent: "氏康", oppType: "統特", result: "信長の勝利" }), 3),
    rec(homeLine({ year: 1600, time: "06/11 14:00", self: "信長", selfUnit: "鉄砲隊", opponent: "義元", oppType: "統特", result: "義元の勝利" }), 2),
    // 先々週（対象外）
    rec(homeLine({ year: 1600, time: "06/05 15:00", self: "信長", selfUnit: "鉄砲隊", opponent: "幸村", oppType: "統特", result: "信長の勝利" }), 1),
  ];

  it("今週と先週の勝率を比較し、差分を返す", () => {
    const outcomes = collectWarlordBattles(log, "信長");
    const t = weeklyWinRateTrend(outcomes, now);
    expect(t.thisDecided).toBe(3);
    expect(t.thisRate).toBeCloseTo(2 / 3);
    expect(t.lastDecided).toBe(2);
    expect(t.lastRate).toBeCloseTo(0.5);
    expect(t.delta).toBeCloseTo(2 / 3 - 0.5);
  });

  it("先週に確定戦が無いと delta は null", () => {
    const recentOnly: BattleRecord[] = [
      rec(homeLine({ year: 1600, time: "06/20 10:00", self: "信長", selfUnit: "鉄砲隊", opponent: "勝頼", oppType: "統特", result: "信長の勝利" }), 2),
      rec(homeLine({ year: 1600, time: "06/18 11:00", self: "信長", selfUnit: "鉄砲隊", opponent: "謙信", oppType: "統特", result: "謙信の勝利" }), 1),
    ];
    const outcomes = collectWarlordBattles(recentOnly, "信長");
    const t = weeklyWinRateTrend(outcomes, now);
    expect(t.thisDecided).toBe(2);
    expect(t.delta).toBeNull();
  });

  it("実日時が無いと delta は null", () => {
    expect(weeklyWinRateTrend([], now).delta).toBeNull();
  });
});

describe("年代別の勝率ランキング（yearBucketWinRankings）", () => {
  // 在ゲーム年と勝敗を直接指定する戦闘行。左右で別武将を立てられる。
  function yrLine(opts: {
    year: number;
    leftName: string;
    rightName: string;
    winner: "left" | "right";
    battleNo: number;
  }): string {
    const { year, leftName, rightName, winner, battleNo } = opts;
    const result = winner === "left" ? `${leftName}の勝利` : `${rightName}の勝利`;
    // 時刻(MM/DD)は重複しても battleNo で別戦闘として扱われる。
    // 相手（右）は名寄せで統合されないよう、家名を相手ごとに固有にする。
    return `【${battleNo}戦目】 ${year}年4月 06/15 10:00 京都 自国 ${leftName} 某家 武特 騎馬隊 騎兵 槍 鎧 V.S. 敵国 ${rightName} ${rightName}家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`;
  }

  /** 注目武将を左、毎回ユニークな相手を右に置いた n 戦を生成する（相手は閾値未満で除外される）。 */
  function battlesFor(
    name: string,
    wins: number,
    losses: number,
    year: number,
    startNo: number
  ): BattleRecord[] {
    const out: BattleRecord[] = [];
    let no = startNo;
    for (let i = 0; i < wins; i++) {
      out.push(rec(yrLine({ year, leftName: name, rightName: `敵${no}`, winner: "left", battleNo: no }), no));
      no++;
    }
    for (let i = 0; i < losses; i++) {
      out.push(rec(yrLine({ year, leftName: name, rightName: `敵${no}`, winner: "right", battleNo: no }), no));
      no++;
    }
    return out;
  }

  it("parseGameYear / yearBucketFor が在ゲーム年とバケットを判定する", () => {
    expect(parseGameYear("1706年2月 06/18 12:36")).toBe(1706);
    expect(parseGameYear("1760年4月 04/01 09:00")).toBe(1760);
    expect(parseGameYear(undefined)).toBeNull();
    expect(parseGameYear("日時なし")).toBeNull();

    expect(yearBucketFor(1706)?.key).toBe("06-11");
    expect(yearBucketFor(1759)?.key).toBe("48-59");
    expect(yearBucketFor(1760)?.key).toBe("60+");
    expect(yearBucketFor(1799)?.key).toBe("60+");
    // 下2桁 00〜05 はどのバケットにも属さない。
    expect(yearBucketFor(1700)).toBeNull();
    expect(yearBucketFor(1705)).toBeNull();
  });

  it("各バケットで勝率上位3名を順位付けし、最低決着戦数未満は除外する", () => {
    const log: BattleRecord[] = [
      ...battlesFor("強", 9, 3, 1706, 100), // 勝率 0.75（決着12）
      ...battlesFor("中", 6, 4, 1707, 200), // 勝率 0.6（決着10）
      ...battlesFor("弱", 3, 7, 1708, 300), // 勝率 0.3（決着10）
      ...battlesFor("少", 4, 0, 1709, 400), // 勝率 1.0 だが決着4 < 10 で除外
    ];
    const rankings = yearBucketWinRankings(log);
    const b = rankings.find((r) => r.bucket.key === "06-11");
    expect(b).toBeDefined();
    expect(b!.entries.map((e) => e.name)).toEqual(["強", "中", "弱"]);
    expect(b!.entries[0].rank).toBe(1);
    expect(b!.entries[0].winRate).toBeCloseTo(0.75);
    expect(b!.entries[0].decided).toBe(12);
    expect(b!.entries[1].rank).toBe(2);
    expect(b!.entries[2].rank).toBe(3);
    // 閾値未満（少）と相手（敵N）は載らない。
    expect(b!.entries.some((e) => e.name === "少")).toBe(false);
    expect(b!.entries.some((e) => e.name.startsWith("敵"))).toBe(false);
    // 戦闘が無い他バケットは空。
    expect(rankings.find((r) => r.bucket.key === "60+")!.entries).toHaveLength(0);
  });

  it("年代が違えば別バケットに分かれて集計される", () => {
    const log: BattleRecord[] = [
      ...battlesFor("武将X", 10, 2, 1706, 100), // 06-11
      ...battlesFor("武将X", 2, 10, 1750, 500), // 48-59（負け越し）
    ];
    const rankings = yearBucketWinRankings(log);
    const early = rankings.find((r) => r.bucket.key === "06-11")!;
    const late = rankings.find((r) => r.bucket.key === "48-59")!;
    expect(early.entries[0].name).toBe("武将X");
    expect(early.entries[0].winRate).toBeCloseTo(10 / 12);
    expect(late.entries[0].name).toBe("武将X");
    expect(late.entries[0].winRate).toBeCloseTo(2 / 12);
  });

  it("warlordYearRankTags は入賞バケットのタグだけを返す", () => {
    const log: BattleRecord[] = [
      ...battlesFor("強", 9, 3, 1706, 100),
      ...battlesFor("中", 6, 4, 1707, 200),
      ...battlesFor("弱", 3, 7, 1708, 300),
    ];
    const rankings = yearBucketWinRankings(log);
    const tags = warlordYearRankTags(rankings, "強");
    expect(tags).toHaveLength(1);
    expect(tags[0].bucketKey).toBe("06-11");
    expect(tags[0].label).toBe("06年-11年");
    expect(tags[0].rank).toBe(1);
    // 入賞していない相手・空文字は空配列。
    expect(warlordYearRankTags(rankings, "敵100")).toHaveLength(0);
    expect(warlordYearRankTags(rankings, "")).toHaveLength(0);
  });

  it("家督が同じ別名は代表名に統合して順位付けする", () => {
    const db: WarlordMap = {
      古名: { name: "古名", type: "武特", branch: "騎兵", household: "H", updatedAt: 1 },
      新名: { name: "新名", type: "武特", branch: "騎兵", household: "H", updatedAt: 2 },
    };
    const log: BattleRecord[] = [
      ...battlesFor("古名", 5, 1, 1706, 100),
      ...battlesFor("新名", 5, 1, 1707, 200),
    ];
    const rankings = yearBucketWinRankings(log, db);
    const b = rankings.find((r) => r.bucket.key === "06-11")!;
    // 代表名（在ゲーム年月が新しい「新名」）に統合され、決着12・10勝2敗。
    expect(b.entries).toHaveLength(1);
    expect(b.entries[0].name).toBe("新名");
    expect(b.entries[0].decided).toBe(12);
    expect(b.entries[0].winRate).toBeCloseTo(10 / 12);
    expect(b.entries.some((e) => e.name === "古名")).toBe(false);

    // タグ参照も代表名で引ける。
    expect(warlordYearRankTags(rankings, "新名")[0].rank).toBe(1);
  });

  it("YEAR_BUCKETS はユーザー指定の年代区分を網羅している", () => {
    expect(YEAR_BUCKETS.map((b) => b.label)).toEqual([
      "06年-11年",
      "12年-17年",
      "18年-23年",
      "24年-35年",
      "36年-47年",
      "48年-59年",
      "60年以降",
    ]);
  });
});

describe("ランキングの年フィルタ（range）と rankingPeriods", () => {
  // 年を差し替えられる戦闘行。左＝信長(騎馬隊/鬼丸/金の腕輪)、右＝勝頼(足軽隊/カルバリン砲/金の兜)。
  function yearLine(o: { year: number; result: string; time: string }): string {
    return `【１戦目】 ${o.year}年4月 ${o.time} 京都 織田 信長 織田家 武特 騎馬隊 騎兵 金の腕輪 鬼丸 V.S. 武田 勝頼 武田家 統特 足軽隊 歩兵 金の兜 カルバリン砲 ${o.result} 12`;
  }

  // 1690 年に 2 戦（信長勝利）、1700 年に 2 戦（信長勝利）。時刻は全て変えて重複排除を回避。
  const log: BattleRecord[] = [
    rec(yearLine({ year: 1690, result: "信長の勝利", time: "04/10 10:00" }), 1),
    rec(yearLine({ year: 1690, result: "信長の勝利", time: "04/11 11:00" }), 2),
    rec(yearLine({ year: 1700, result: "信長の勝利", time: "04/12 12:00" }), 3),
    rec(yearLine({ year: 1700, result: "信長の勝利", time: "04/13 13:00" }), 4),
  ];

  it("unitStats は年範囲で絞り込める", () => {
    expect(unitStats(log).find((s) => s.unit === "騎馬隊")!.battles).toBe(4);
    const recent = unitStats(log, { from: 1700, to: 1710 });
    expect(recent.find((s) => s.unit === "騎馬隊")!.battles).toBe(2);
    // 範囲外の年は 0 件。
    expect(unitStats(log, { from: 1710, to: 1720 })).toHaveLength(0);
  });

  it("weaponStats / itemStats は年範囲で絞り込める", () => {
    expect(weaponStats(log).find((w) => w.name === "鬼丸")!.battles).toBe(4);
    expect(
      weaponStats(log, { from: 1700, to: 1710 }).find((w) => w.name === "鬼丸")!
        .battles
    ).toBe(2);
    expect(
      itemStats(log, { from: 1700, to: 1710 }).find(
        (i) => i.name === "金の腕輪"
      )!.battles
    ).toBe(2);
  });

  it("warlordRanking は年範囲で出兵戦目を絞り込める", () => {
    const all = warlordRanking(log).find((r) => r.name === "信長")!;
    expect(all.attackRounds).toBe(4);
    const recent = warlordRanking(log, undefined, {
      from: 1700,
      to: 1710,
    }).find((r) => r.name === "信長")!;
    expect(recent.attackRounds).toBe(2);
  });

  it("latestGameYear はログ中の最新のゲーム内年を返す", () => {
    expect(latestGameYear(log)).toBe(1700);
    expect(latestGameYear([])).toBeNull();
  });

  it("rankingPeriods は全期間、過去10年間、年バケットの順に並ぶ", () => {
    const periods = rankingPeriods(log);
    expect(periods[0]).toEqual(META_PERIODS.at(-1));
    expect(periods[1]).toMatchObject({
      key: RANKING_LAST10_KEY,
      label: "過去10年間",
      from: 1691, // 1700 - 9
      to: 1700,
    });
    expect(periods.slice(2)).toEqual(META_PERIODS.slice(0, -1));
  });

  it("rankingPeriods はデータが無ければ過去10年間を全期間扱いにする", () => {
    expect(rankingPeriods([])[1]).toMatchObject({
      key: RANKING_LAST10_KEY,
      from: null,
      to: null,
    });
  });
});

describe("antiContactRanking / buildAntiIndex（指標: アンチ接触）", () => {
  const unitTypes: UnitType[] = [
    { ...EMPTY_UNIT, name: "母衣衆", category: "騎兵", goodAgainst: "弓兵:" },
    { ...EMPTY_UNIT, name: "南蛮象騎兵", category: "騎兵", goodAgainst: "弓兵:壁:" },
    { ...EMPTY_UNIT, name: "雑兵", category: "万能", goodAgainst: "" },
  ];

  // 自分の兵種と相手の兵種を差し替えられる行ビルダー（左=自分、右=相手）。
  const antiLine = (opts: {
    selfName: string;
    selfUnit: string;
    oppBranch: string;
    oppName?: string;
    time: string; // "MM/DD HH:mm"
    year?: number;
  }): string => {
    const { selfName, selfUnit, oppBranch, oppName = "相手", time, year = 1700 } = opts;
    return `【1戦目】 ${year}年4月 ${time} 京都 己鯖 ${selfName} 某家 武特 ${selfUnit} 騎兵 槍 鞎 V.S. 敵国 ${oppName} 敵家 統特 ミニエー銃兵 ${oppBranch} 馬 旗 撤退 12`;
  };

  it("buildAntiIndex は兵種→得意兵種の集合を作る（ダブルアンチは複数要素）", () => {
    const idx = buildAntiIndex(unitTypes);
    expect(idx.get("母衣衆")).toEqual(new Set(["弓兵"]));
    expect(idx.get("南蛮象騎兵")).toEqual(new Set(["弓兵", "壁"]));
    expect(idx.get("雑兵")).toEqual(new Set());
  });

  it("unitCountersBranch は兵種→相手兵種のアンチ成立を判定する", () => {
    const idx = buildAntiIndex(unitTypes);
    expect(unitCountersBranch("母衣衆", "弓兵", idx)).toBe(true);
    expect(unitCountersBranch("母衣衆", "歩兵", idx)).toBe(false);
    // ダブルアンチはいずれかに一致で成立。
    expect(unitCountersBranch("南蛮象騎兵", "壁", idx)).toBe(true);
    expect(unitCountersBranch("南蛮象騎兵", "弓兵", idx)).toBe(true);
    // マスタに無い兵種・空の兵種は false。
    expect(unitCountersBranch("架空兵", "弓兵", idx)).toBe(false);
    expect(unitCountersBranch("母衣衆", undefined, idx)).toBe(false);
    expect(unitCountersBranch(undefined, "弓兵", idx)).toBe(false);
    // オリジナル兵の括弧表記も解決する（*名前(母衣衆) → 母衣衆）。
    expect(unitCountersBranch("*俺の兵(母衣衆)", "弓兵", idx)).toBe(true);
  });

  it("自分の兵種の得意兵種に相手の兵種が含まれる戦闘をアンチとして数える", () => {
    const log = [
      rec(antiLine({ selfName: "信長", selfUnit: "母衣衆", oppBranch: "弓兵", oppName: "A", time: "06/01 10:00" })),
      rec(antiLine({ selfName: "信長", selfUnit: "母衣衆", oppBranch: "歩兵", oppName: "B", time: "06/01 10:01" })),
      rec(antiLine({ selfName: "信長", selfUnit: "南蛮象騎兵", oppBranch: "壁", oppName: "C", time: "06/01 10:02" })),
      rec(antiLine({ selfName: "信長", selfUnit: "雑兵", oppBranch: "弓兵", oppName: "D", time: "06/01 10:03" })),
    ];
    const nobu = antiContactRanking(log, unitTypes).find((r) => r.name === "信長")!;
    expect(nobu.contacts).toBe(4);
    // 母衣衆 vs 弓兵 と 南蛮象騎兵 vs 壁（ダブルアンチ）の 2 件。
    expect(nobu.antiContacts).toBe(2);
    expect(nobu.antiRate).toBeCloseTo(0.5, 5);
    expect(nobu.branch).toBe("騎兵");
  });

  it("兵種一覧に無い兵種は非アンチ（戦闘には数える）", () => {
    const log = [
      rec(antiLine({ selfName: "架空将", selfUnit: "架空兵", oppBranch: "弓兵", oppName: "A", time: "06/02 10:00" })),
    ];
    const r = antiContactRanking(log, unitTypes).find((x) => x.name === "架空将")!;
    expect(r.contacts).toBe(1);
    expect(r.antiContacts).toBe(0);
  });

  it("守備側（右）でもアンチ戦闘を数える", () => {
    // 右側の武将「守」が母衣衆で、左（相手）の兵種が弓兵ならアンチ。
    const line =
      "【1戦目】 1700年4月 06/03 10:00 京都 敵国 攻 某家 統特 ミニエー銃兵 弓兵 馬 旗 V.S. 己鯖 守 某家 武特 母衣衆 騎兵 槍 鞎 撤退 12";
    const r = antiContactRanking([rec(line)], unitTypes).find((x) => x.name === "守")!;
    expect(r.contacts).toBe(1);
    expect(r.antiContacts).toBe(1);
  });

  it("db を渡すと家督名が同じ武将を最新の名前へ統合する", () => {
    const db: WarlordMap = {
      旧名: { name: "旧名", household: "織田家", type: "武特", branch: "騎兵", updatedAt: 1 },
      新名: { name: "新名", household: "織田家", type: "武特", branch: "騎兵", updatedAt: 2 },
    };
    const log = [
      rec(antiLine({ selfName: "旧名", selfUnit: "母衣衆", oppBranch: "弓兵", oppName: "A", time: "06/04 10:00", year: 1700 })),
      rec(antiLine({ selfName: "新名", selfUnit: "母衣衆", oppBranch: "弓兵", oppName: "B", time: "06/04 10:01", year: 1701 })),
    ];
    const ranking = antiContactRanking(log, unitTypes, db);
    const merged = ranking.find((r) => r.name === "新名")!;
    expect(merged.contacts).toBe(2);
    expect(merged.antiContacts).toBe(2);
    expect(ranking.find((r) => r.name === "旧名")).toBeUndefined();
  });
});

describe("breakthroughRanking（抜き数）", () => {
  it("抜き数 = Σ n×(n枚抜き)。3枚抜きは3点で内側の1・2枚抜きを二重計上しない", () => {
    const log: BattleRecord[] = [
      // 出兵、1（10:00）: 1○2○3○ = 3枚抜き
      rec(swiLine({ attacker: "信長", battleNo: 1, time: "06/15 10:00", win: true, defender: "敵A" }), 1),
      rec(swiLine({ attacker: "信長", battleNo: 2, time: "06/15 10:00", win: true, defender: "敵B" }), 2),
      rec(swiLine({ attacker: "信長", battleNo: 3, time: "06/15 10:00", win: true, defender: "敵C" }), 3),
      // 出兵。2（11:00）: 1○2× = 1枚抜き
      rec(swiLine({ attacker: "信長", battleNo: 1, time: "06/15 11:00", win: true, defender: "敵D" }), 4),
      rec(swiLine({ attacker: "信長", battleNo: 2, time: "06/15 11:00", win: false, defender: "敵E" }), 5),
    ];
    const nobu = breakthroughRanking(log).find((r) => r.name === "信長")!;
    expect(nobu.sorties).toBe(2);
    // 3枚抜き=3点 ＋ 1枚抜き=1点 = 4（1・2枚抜きの二重計上なし）。
    expect(nobu.score).toBe(4);
    expect(nobu.sweepCounts[3]).toBe(1);
    expect(nobu.sweepCounts[1]).toBe(1);
  });
});

describe("pontaPointRanking（PontaPoint）", () => {
  it("守備勝ちを1.4勝として勝率の分子に加える（撤退戦は戦闘数に含めない）", () => {
    const log: BattleRecord[] = [
      // 甲: 出兵勝ち（左で勝ち）
      rec(swiLine({ attacker: "甲", battleNo: 1, time: "06/01 10:00", win: true, defender: "敵X" })),
      // 甲: 守備勝ち（右で勝ち＝左の乙が負け）
      rec(swiLine({ attacker: "乙", battleNo: 1, time: "06/01 11:00", win: false, defender: "甲" })),
      // 甲: 出兵負け（左で負け）
      rec(swiLine({ attacker: "甲", battleNo: 1, time: "06/01 12:00", win: false, defender: "敵Z" })),
      // 甲: 撤退（勝敗が付かない）→ 戦闘数（分母）から除外される
      rec("【1戦目】 1600年4月 06/01 13:00 京都 自国 甲 某家 武特 騎馬隊 騎兵 槍 鑾 V.S. 敵国 敵W 敵家 統特 騎馬隊 騎兵 馬 旗 撤退 12"),
    ];
    const ponta = pontaPointRanking(log).find((r) => r.name === "甲")!;
    expect(ponta.attackWins).toBe(1);
    expect(ponta.defenseWins).toBe(1);
    // 撤退戦は分母から除外＝勝＋負のみ（1+1+1=3）
    expect(ponta.battles).toBe(3);
    // (出兵勝 1 + 1.4×守備勝 1) ÷ 戦闘 3 = 0.8
    expect(ponta.pontaPoint).toBeCloseTo(0.8);
  });
});

describe("assetMetricRanking（兵種・武器・品物の指標）", () => {
  const log: BattleRecord[] = [
    // 同一出兵で2枚抜き。左: 騎馬隊 / 武器=鎧 / 品物=槍。
    rec(
      swiLine({
        attacker: "甲",
        battleNo: 1,
        time: "06/01 10:00",
        win: true,
        defender: "敵A",
      }),
      1
    ),
    rec(
      swiLine({
        attacker: "甲",
        battleNo: 2,
        time: "06/01 10:00",
        win: true,
        defender: "敵B",
      }),
      2
    ),
    // 別出兵は1戦目で負けるため0枚抜き。
    rec(
      swiLine({
        attacker: "甲",
        battleNo: 1,
        time: "06/01 11:00",
        win: false,
        defender: "敵C",
      }),
      3
    ),
  ];

  it.each([
    ["weapon", "鎧"],
    ["item", "槍"],
  ] as const)("%s ごとに同じ定義の総合指標を返す", (variant, name) => {
    const metric = assetMetricRanking(log, variant).find(
      (row) => row.name === name
    )!;
    expect(metric.uses).toBe(3);
    expect(metric.attackWins).toBe(2);
    expect(metric.defenseWins).toBe(0);
    expect(metric.battles).toBe(3);
    expect(metric.winRate).toBeCloseTo(2 / 3);
    expect(metric.pontaPoint).toBeCloseTo(2 / 3);
    expect(metric.sorties).toBe(2);
    expect(metric.breakthrough).toBe(2);
    expect(metric.breakthroughRate).toBe(1);
    expect(metric.ppn).toBeCloseTo(5 / 3);
    expect(metric.sweepCounts[2]).toBe(1);
    expect(metric.sweepCounts[0]).toBe(1);
    expect(metric.topUsers[0]).toEqual({ name: "甲", count: 3 });
  });

  it("兵種は攻守の使用を合算し、守備勝ちを1.4勝として評価する", () => {
    const unit = assetMetricRanking(log, "unit").find(
      (row) => row.name === "騎馬隊"
    )!;
    // 左右が同じ兵種なので、右側の1守備勝ちも同じ兵種へ合算される。
    expect(unit.uses).toBe(6);
    expect(unit.attackWins).toBe(2);
    expect(unit.defenseWins).toBe(1);
    expect(unit.battles).toBe(6);
    expect(unit.winRate).toBeCloseTo(0.5);
    expect(unit.pontaPoint).toBeCloseTo((2 + 1.4) / 6);
    expect(unit.breakthrough).toBe(2);
    expect(unit.breakthroughRate).toBe(1);
  });

  it("ランキングと同じゲーム内年フィルターを適用する", () => {
    expect(
      assetMetricRanking(log, "weapon", { from: 1700, to: 1709 })
    ).toEqual([]);
  });

  it("従来ランキングの使用回数と勝率を維持する", () => {
    const legacyByVariant = {
      unit: unitStats(log).map((row) => ({
        name: row.unit,
        uses: row.battles,
        winRate: row.winRate,
      })),
      weapon: weaponStats(log).map((row) => ({
        name: row.name,
        uses: row.battles,
        winRate: row.winRate,
      })),
      item: itemStats(log).map((row) => ({
        name: row.name,
        uses: row.battles,
        winRate: row.winRate,
      })),
    };

    for (const variant of ["unit", "weapon", "item"] as const) {
      const metrics = new Map(
        assetMetricRanking(log, variant).map((row) => [row.name, row])
      );
      for (const legacy of legacyByVariant[variant]) {
        const metric = metrics.get(legacy.name)!;
        expect(metric.uses).toBe(legacy.uses);
        expect(metric.winRate).toBeCloseTo(legacy.winRate);
      }
    }
  });
});

describe("ランキングの国フィルタ", () => {
  const sideScopedLog: BattleRecord[] = [
    rec(
      countryRankingLine({
        time: "06/01 10:00",
        leftFaction: "赤国",
        leftName: "赤攻",
        rightFaction: "青国",
        rightName: "青守",
        winner: "left",
      }),
      1
    ),
    rec(
      countryRankingLine({
        time: "06/01 11:00",
        leftFaction: "青国",
        leftName: "青攻",
        rightFaction: "赤国",
        rightName: "赤守",
        winner: "right",
        leftUnit: "青備",
        rightUnit: "赤備",
        leftItem: "青飾",
        rightItem: "赤飾",
        leftWeapon: "青剣",
        rightWeapon: "赤剣",
      }),
      2
    ),
  ];

  it("国候補は期間内の左右陣営から収集し、未所属を除いて重複なく並べる", () => {
    const log = [
      rec(
        countryRankingLine({
          year: 1600,
          time: "06/01 10:00",
          leftFaction: "織田",
          leftName: "信長",
          rightFaction: "武田",
          rightName: "勝頼",
          winner: "left",
        })
      ),
      rec(
        countryRankingLine({
          year: 1600,
          time: "06/01 11:00",
          leftFaction: "武田",
          leftName: "信玄",
          rightFaction: "織田",
          rightName: "秀吉",
          winner: "right",
        })
      ),
      rec(
        countryRankingLine({
          year: 1700,
          time: "06/01 12:00",
          leftFaction: "なし",
          leftName: "浪人",
          rightFaction: "上杉",
          rightName: "謙信",
          winner: "right",
        })
      ),
    ];

    expect(factionsInYearRange(log)).toEqual(["上杉", "織田", "武田"]);
    expect(
      factionsInYearRange(log, { from: 1700, to: 1700 })
    ).toEqual(["上杉"]);
  });

  it.each([
    ["unit", "赤備", "青備"],
    ["weapon", "赤剣", "青剣"],
    ["item", "赤飾", "青飾"],
  ] as const)(
    "%s は選択国の左右陣営だけを再集計する",
    (variant, selectedAsset, opponentAsset) => {
      const rows = assetMetricRanking(
        sideScopedLog,
        variant,
        undefined,
        "赤国"
      );
      const selected = rows.find((row) => row.name === selectedAsset)!;

      expect(selected.uses).toBe(2);
      expect(selected.battles).toBe(2);
      expect(selected.attackWins).toBe(1);
      expect(selected.defenseWins).toBe(1);
      expect(selected.winRate).toBe(1);
      expect(selected.sorties).toBe(1);
      expect(selected.breakthrough).toBe(1);
      expect(
        selected.topUsers.map((user) => [user.name, user.count])
      ).toEqual([
        ["赤攻", 1],
        ["赤守", 1],
      ]);
      expect(rows.some((row) => row.name === opponentAsset)).toBe(false);
    }
  );

  it("武将の各指標は出兵側・守備側とも選択国だけを対象にする", () => {
    const ponta = pontaPointRanking(
      sideScopedLog,
      undefined,
      undefined,
      "赤国"
    );
    expect(new Set(ponta.map((row) => row.name))).toEqual(
      new Set(["赤攻", "赤守"])
    );
    expect(ponta.find((row) => row.name === "赤攻")).toMatchObject({
      faction: "赤国",
      attackWins: 1,
      defenseWins: 0,
      battles: 1,
    });
    expect(ponta.find((row) => row.name === "赤守")).toMatchObject({
      faction: "赤国",
      attackWins: 0,
      defenseWins: 1,
      battles: 1,
    });

    const breakthrough = breakthroughRanking(
      sideScopedLog,
      undefined,
      undefined,
      "赤国"
    );
    expect(breakthrough).toHaveLength(1);
    expect(breakthrough[0]).toMatchObject({
      name: "赤攻",
      faction: "赤国",
      sorties: 1,
      score: 1,
    });

    const ranking = warlordRanking(
      sideScopedLog,
      undefined,
      undefined,
      "赤国"
    );
    expect(new Set(ranking.map((row) => row.name))).toEqual(
      new Set(["赤攻", "赤守"])
    );
    expect(ranking.find((row) => row.name === "赤攻")).toMatchObject({
      faction: "赤国",
      attackRounds: 1,
      attackWinRounds: 1,
      defenseRounds: 0,
    });
    expect(ranking.find((row) => row.name === "赤守")).toMatchObject({
      faction: "赤国",
      attackRounds: 0,
      defenseRounds: 1,
      defenseWinRounds: 1,
    });
  });

  it("同じ国同士の対戦は左右を各1回だけ集計する", () => {
    const log = [
      rec(
        countryRankingLine({
          time: "06/01 12:00",
          leftFaction: "赤国",
          leftName: "赤攻",
          rightFaction: "赤国",
          rightName: "赤守",
          winner: "left",
          leftWeapon: "共通剣",
          rightWeapon: "共通剣",
        })
      ),
    ];

    const asset = assetMetricRanking(
      log,
      "weapon",
      undefined,
      "赤国"
    ).find((row) => row.name === "共通剣")!;
    expect(asset).toMatchObject({
      uses: 2,
      battles: 2,
      attackWins: 1,
      defenseWins: 0,
      winRate: 0.5,
      sorties: 1,
      breakthrough: 1,
    });
    expect(asset.topUsers).toEqual([
      { name: "赤攻", count: 1 },
      { name: "赤守", count: 1 },
    ]);

    const ponta = pontaPointRanking(
      log,
      undefined,
      undefined,
      "赤国"
    );
    expect(ponta).toHaveLength(2);
    expect(ponta.find((row) => row.name === "赤攻")).toMatchObject({
      battles: 1,
      attackWins: 1,
      defenseWins: 0,
    });
    expect(ponta.find((row) => row.name === "赤守")).toMatchObject({
      battles: 1,
      attackWins: 0,
      defenseWins: 0,
    });

    const ranking = warlordRanking(
      log,
      undefined,
      undefined,
      "赤国"
    );
    expect(ranking).toHaveLength(2);
    expect(ranking.find((row) => row.name === "赤攻")).toMatchObject({
      attackRounds: 1,
      defenseRounds: 0,
    });
    expect(ranking.find((row) => row.name === "赤守")).toMatchObject({
      attackRounds: 0,
      defenseRounds: 1,
    });
  });

  it("移籍した同一武将は選択した国での戦績だけを返す", () => {
    const log = [
      rec(
        countryRankingLine({
          year: 1600,
          time: "06/02 10:00",
          leftFaction: "赤国",
          leftName: "渡り鳥",
          rightFaction: "敵国",
          rightName: "敵A",
          winner: "left",
        })
      ),
      rec(
        countryRankingLine({
          year: 1700,
          time: "06/02 11:00",
          leftFaction: "青国",
          leftName: "渡り鳥",
          rightFaction: "敵国",
          rightName: "敵B",
          winner: "right",
        })
      ),
    ];

    const red = pontaPointRanking(
      log,
      undefined,
      undefined,
      "赤国"
    ).find((row) => row.name === "渡り鳥")!;
    const blue = pontaPointRanking(
      log,
      undefined,
      undefined,
      "青国"
    ).find((row) => row.name === "渡り鳥")!;

    expect(red).toMatchObject({
      faction: "赤国",
      battles: 1,
      attackWins: 1,
      pontaPoint: 1,
    });
    expect(blue).toMatchObject({
      faction: "青国",
      battles: 1,
      attackWins: 0,
      pontaPoint: 0,
    });
  });

  it("期間と国を適用した後の回数を最低回数判定へ渡す", () => {
    const recentRed = Array.from({ length: 9 }, (_, index) =>
      rec(
        countryRankingLine({
          year: 1700,
          time: `06/03 1${index}:00`,
          leftFaction: "赤国",
          leftName: "境界将",
          rightFaction: "敵国",
          rightName: `敵R${index}`,
          winner: "left",
        }),
        index
      )
    );
    const oldRed = Array.from({ length: 2 }, (_, index) =>
      rec(
        countryRankingLine({
          year: 1600,
          time: `06/04 1${index}:00`,
          leftFaction: "赤国",
          leftName: "境界将",
          rightFaction: "敵国",
          rightName: `敵O${index}`,
          winner: "left",
        }),
        20 + index
      )
    );
    const recentBlue = Array.from({ length: 2 }, (_, index) =>
      rec(
        countryRankingLine({
          year: 1700,
          time: `06/05 1${index}:00`,
          leftFaction: "青国",
          leftName: "境界将",
          rightFaction: "敵国",
          rightName: `敵B${index}`,
          winner: "left",
        }),
        30 + index
      )
    );
    const log = [...recentRed, ...oldRed, ...recentBlue];
    const range = { from: 1700, to: 1700 };

    const asset = assetMetricRanking(log, "weapon", range, "赤国").find(
      (row) => row.name === "赤剣"
    )!;
    const ponta = pontaPointRanking(
      log,
      undefined,
      range,
      "赤国"
    ).find((row) => row.name === "境界将")!;
    const ranking = warlordRanking(
      log,
      undefined,
      range,
      "赤国"
    ).find((row) => row.name === "境界将")!;

    expect(asset.uses).toBe(9);
    expect(ponta.battles).toBe(9);
    expect(ranking.attackRounds).toBe(9);
    expect(asset.uses).toBeLessThan(10);
    expect(
      assetMetricRanking(log, "weapon", undefined, "赤国").find(
        (row) => row.name === "赤剣"
      )!.uses
    ).toBe(11);
  });

  it("未所属は全体集計には残し、特定国の集計から除外する", () => {
    const log = [
      rec(
        countryRankingLine({
          time: "06/06 10:00",
          leftFaction: "なし",
          leftName: "浪人",
          rightFaction: "赤国",
          rightName: "赤守",
          winner: "left",
          leftWeapon: "流浪剣",
          rightWeapon: "赤剣",
        })
      ),
    ];

    expect(
      assetMetricRanking(log, "weapon").some(
        (row) => row.name === "流浪剣"
      )
    ).toBe(true);
    expect(
      assetMetricRanking(log, "weapon", undefined, "赤国").some(
        (row) => row.name === "流浪剣"
      )
    ).toBe(false);
    expect(
      pontaPointRanking(log, undefined, undefined, "赤国").map(
        (row) => row.name
      )
    ).toEqual(["赤守"]);
  });

  it("国で絞ってもアシスト判定用の後続敗北は期間内の全戦闘から探す", () => {
    const log = [
      rec(
        countryRankingLine({
          time: "06/07 10:00",
          leftFaction: "赤国",
          leftName: "援護役",
          rightFaction: "青国",
          rightName: "標的",
          winner: "left",
        })
      ),
      rec(
        countryRankingLine({
          time: "06/07 10:20",
          leftFaction: "緑国",
          leftName: "追撃役",
          rightFaction: "青国",
          rightName: "標的",
          winner: "left",
        })
      ),
    ];

    const assisted = warlordRanking(
      log,
      undefined,
      undefined,
      "赤国"
    ).find((row) => row.name === "援護役")!;
    expect(assisted.assists).toBe(1);
  });

  it("国未指定と空文字は従来の全体集計を維持する", () => {
    expect(
      assetMetricRanking(sideScopedLog, "unit", undefined, " ")
    ).toEqual(assetMetricRanking(sideScopedLog, "unit"));
    expect(
      pontaPointRanking(sideScopedLog, undefined, undefined, " ")
    ).toEqual(pontaPointRanking(sideScopedLog));
    expect(
      breakthroughRanking(sideScopedLog, undefined, undefined, " ")
    ).toEqual(breakthroughRanking(sideScopedLog));
    expect(
      warlordRanking(sideScopedLog, undefined, undefined, " ")
    ).toEqual(warlordRanking(sideScopedLog));
  });
});
