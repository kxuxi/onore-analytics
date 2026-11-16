import { describe, expect, it } from "vitest";
import { buildLatestEquipment } from "./latestEquipment";
import type { BattleRecord, Warlord } from "./types";

function line({
  year = 1650, month = 1, at = "10/30 12:00", battle = 1,
  left = "信長", right = "勝頼", leftFamily = "織田", rightFamily = "武田",
  item = "金の腕輪", enemyItem = "知統の印", wall = false,
}: {
  year?: number; month?: number; at?: string; battle?: number;
  left?: string; right?: string; leftFamily?: string; rightFamily?: string;
  item?: string; enemyItem?: string; wall?: boolean;
} = {}): string {
  return `【${wall ? "壁戦" : `${battle}戦目`}】 ${year}年${month}月 ${at} 京都 ` +
    `織田国 ${left} ${leftFamily} 武特 母衣衆 騎兵 ${item} 日本号 V.S. ` +
    (wall
      ? `中立 京都の守備隊 精鋭城壁兵 壁 なし なし ${left}の勝利 6`
      : `武田国 ${right} ${rightFamily} 統特 赤備 騎兵 ${enemyItem} 黒雲 ${left}の勝利 12`);
}

function record(text: string, term = 151, savedAt = 1): BattleRecord {
  return { line: text, term, savedAt, id: savedAt };
}

function warlord(name: string, household?: string, term = 151): Warlord {
  return { name, household, term, type: "武特", branch: "騎兵", updatedAt: 0 };
}

function permutations<T>(values: T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, i) => i !== index)).map((rest) => [value, ...rest])
  );
}

describe("buildLatestEquipment", () => {
  it("攻守両側の品物を読み、武器の日本号・黒雲は混ぜない", () => {
    const result = buildLatestEquipment([record(line())], []);
    expect(result.get("信長")).toMatchObject({ item: "金の腕輪", term: 151, observedAt: "1650年1月 10/30 12:00" });
    expect(result.get("勝頼")?.item).toBe("知統の印");
  });

  it("後から取り込んだ古いログで戻らず、ゲーム内年月を実日時より優先する", () => {
    const newest = record(line({ year: 1651, at: "01/01 00:00", item: "金の腕輪" }), 151, 1);
    const old = record(line({ year: 1650, at: "12/31 23:59", item: "銀の腕輪" }), 151, 999);
    for (const log of [[newest, old], [old, newest]]) {
      expect(buildLatestEquipment(log, []).get("信長")?.item).toBe("金の腕輪");
    }
  });

  it("同じゲーム年月では実日時を比較し、装備なしへの変更も保持する", () => {
    const result = buildLatestEquipment([
      record(line({ at: "10/30 12:01", item: "なし" }), 151, 1),
      record(line({ at: "10/30 12:00", item: "金の腕輪" }), 151, 999),
    ], []);
    expect(result.has("信長")).toBe(true);
    expect(result.get("信長")?.item).toBeNull();
    expect(result.has("未観測")).toBe(false);
  });

  it("同一出兵・同時刻は連戦番号が大きい戦闘の品物を採る", () => {
    const third = record(line({ battle: 3, item: "知統の印" }), 151, 1);
    const first = record(line({ battle: 1, item: "金の腕輪" }), 151, 999);
    for (const log of [[third, first], [first, third]]) {
      expect(buildLatestEquipment(log, []).get("信長")?.item).toBe("知統の印");
    }
  });

  it("最新期のみを使い、前期にしか登場しない武将の装備を持ち越さない", () => {
    const result = buildLatestEquipment([
      record(line({ left: "旧期のみ", year: 1710 }), 150),
      record(line({ year: 1606, item: "なし" }), 151),
    ], [warlord("旧期のみ", "旧期の家", 151)]);
    expect(result.has("旧期のみ")).toBe(false);
    expect(result.get("信長")).toMatchObject({ item: null, term: 151 });
  });

  it("最新期の観測がない新期DBプロフィールに前期装備を割り当てない", () => {
    const result = buildLatestEquipment([record(line(), 150)], [warlord("信長", "織田", 151)]);
    expect(result.has("信長")).toBe(false);
  });

  it("同一期の家督内で旧名と現名を共有し、DBにしかない現名にも反映する", () => {
    const result = buildLatestEquipment([
      record(line({ left: "旧名", leftFamily: "同一家", item: "銀の腕輪" })),
      record(line({ left: "新名", leftFamily: "同一家", at: "10/30 12:01", item: "金の腕輪" })),
    ], [warlord("現在名", "同一家"), warlord("他期の同家", "同一家", 150)]);
    expect(result.get("旧名")?.item).toBe("金の腕輪");
    expect(result.get("新名")?.item).toBe("金の腕輪");
    expect(result.get("現在名")).toMatchObject({ item: "金の腕輪", observedName: "新名" });
    expect(result.has("他期の同家")).toBe(false);
  });

  it("同じ名前でも異なる家督の装備は現在プロフィールへ共有しない", () => {
    const result = buildLatestEquipment([
      record(line({ leftFamily: "別人の家", item: "将門の怨念" })),
    ], [warlord("信長", "織田")]);
    expect(result.has("信長")).toBe(false);
  });

  it("連結ログの後続通常戦と壁戦を読み、壁NPCは登録しない", () => {
    const joined = line({ item: "銀の腕輪" }) + line({ battle: 2, item: "金の腕輪" }) +
      line({ wall: true, item: "未知の品物" });
    const result = buildLatestEquipment([record(joined)], []);
    expect(result.get("信長")?.item).toBe("未知の品物");
    expect(result.has("京都の守備隊")).toBe(false);
  });

  it("壁戦自身の日時を使い、親レコードの時刻で古い装備を最新にしない", () => {
    const result = buildLatestEquipment([
      { ...record(line({ at: "10/30 12:30" }) + line({ wall: true, at: "10/30 12:00", item: "銀の腕輪" })), time: "1650年1月 10/30 12:30" },
    ], []);
    expect(result.get("信長")?.item).toBe("金の腕輪");
  });

  it("単一戦闘で欠けた実日時は保存された戦闘時刻で補う", () => {
    const result = buildLatestEquipment([
      { ...record(line({ at: "", item: "銀の腕輪" })), time: "1650年1月 10/30 12:05" },
      record(line({ at: "10/30 12:00", item: "金の腕輪" }), 151, 999),
    ], []);
    expect(result.get("信長")).toMatchObject({ item: "銀の腕輪", observedAt: "1650年1月 10/30 12:05" });
  });

  it("同分に別出兵者から受けた戦闘の装備が食い違う場合は確定しない", () => {
    const result = buildLatestEquipment([
      record(line({ left: "攻撃A", leftFamily: "A家", battle: 1, enemyItem: "金の腕輪" })),
      record(line({ left: "攻撃B", leftFamily: "B家", battle: 3, enemyItem: "銀の腕輪" })),
    ], []);
    expect(result.has("勝頼")).toBe(false);
  });

  it("同分の出兵・被弾・後続連戦の全順序で、別出兵者との矛盾を保持する", () => {
    const battles = [
      record(line({ battle: 1, item: "金の腕輪" })),
      record(line({ left: "別の出兵者", leftFamily: "別家", right: "信長", rightFamily: "織田", enemyItem: "銀の腕輪" })),
      record(line({ battle: 2, item: "金の腕輪" })),
    ];
    for (const log of permutations(battles)) {
      expect(buildLatestEquipment(log, []).has("信長")).toBe(false);
    }
  });

  it("出兵者別の最終連戦で品物が一致するなら、全順序で確定できる", () => {
    const battles = [
      record(line({ battle: 1, item: "銀の腕輪" })),
      record(line({ left: "別の出兵者", leftFamily: "別家", right: "信長", rightFamily: "織田", enemyItem: "金の腕輪" })),
      record(line({ battle: 2, item: "金の腕輪" })),
    ];
    for (const log of permutations(battles)) {
      expect(buildLatestEquipment(log, []).get("信長")?.item).toBe("金の腕輪");
    }
  });

  it("真に新しい時刻の観測は、同分の矛盾を全取り込み順で解消する", () => {
    const battles = [
      record(line({ battle: 1, item: "金の腕輪" })),
      record(line({ left: "別の出兵者", leftFamily: "別家", right: "信長", rightFamily: "織田", enemyItem: "銀の腕輪" })),
      record(line({ battle: 2, item: "金の腕輪" })),
      record(line({ at: "10/30 12:01", item: "なし" })),
    ];
    for (const log of permutations(battles)) {
      expect(buildLatestEquipment(log, []).get("信長")?.item).toBeNull();
    }
  });

  it("年またぎの実日時を比較し、破損行は既知装備を上書きしない", () => {
    const result = buildLatestEquipment([
      record(line({ at: "01/01 00:00", item: "銀の腕輪" })),
      record(line({ at: "12/31 23:59", item: "金の腕輪" })),
      record("解析できない行", 151, 999),
    ], []);
    expect(result.get("信長")?.item).toBe("銀の腕輪");
  });
});
