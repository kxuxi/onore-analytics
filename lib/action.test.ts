import { describe, it, expect } from "vitest";
import {
  ACTION_LABEL,
  getActionInfo,
  parseActionDate,
  NO_REST_EVOLVE_STREAK,
} from "./action";
import type { Warlord } from "./types";

/** "MM/DD HH:mm" を組み立てる。基準日 06/15 を使う。 */
function at(hh: number, mm: number): string {
  const h = String(hh).padStart(2, "0");
  const m = String(mm).padStart(2, "0");
  return `06/15 ${h}:${m}`;
}

function warlord(actions: string[]): Warlord {
  return {
    name: "テスト",
    type: "武特",
    branch: "騎兵",
    lastActionAt: actions[actions.length - 1],
    actions,
    updatedAt: 0,
  };
}

// 行動を評価する基準時刻（最終行動の少し後）。
const NOW = new Date(2026, 5, 15, 23, 59, 0);

describe("parseActionDate の全角対応", () => {
  it("全角の日付・時刻でも半角と同じ Date を返す", () => {
    const zen = parseActionDate("０６／１０ ０９：３０", NOW);
    const han = parseActionDate("06/10 09:30", NOW);
    expect(zen).not.toBeNull();
    expect(zen!.getTime()).toBe(han!.getTime());
    expect(zen!.getMonth()).toBe(5); // 6月 → index 5
    expect(zen!.getDate()).toBe(10);
    expect(zen!.getHours()).toBe(9);
    expect(zen!.getMinutes()).toBe(30);
  });
});

describe("getActionInfo の末尾固定判定", () => {
  it("行動が1回だけなら表示なし", () => {
    const info = getActionInfo(warlord([at(10, 0)]), NOW);
    expect(info.noRest).toBe(false);
    expect(info.noRestStreak).toBe(0);
    expect(info.noRestLabel).toBe(null);
  });

  it("10分単位のズレ（45→55）で1の位が固定なら末尾固定", () => {
    const info = getActionInfo(warlord([at(9, 45), at(10, 55)]), NOW);
    expect(info.noRest).toBe(true);
    expect(info.noRestStreak).toBe(2);
    expect(info.strictStreak).toBe(0); // 70分間隔なので休養なしではない
    expect(info.noRestLabel).toBe("末尾固定");
  });

  it("10分単位のズレ（45→35）は1の位が5で固定なので末尾固定", () => {
    const info = getActionInfo(warlord([at(9, 45), at(10, 35)]), NOW);
    expect(info.noRest).toBe(true);
    expect(info.noRestStreak).toBe(2);
    expect(info.strictStreak).toBe(0);
    expect(info.noRestLabel).toBe("末尾固定");
  });

  it("ちょうど60分間隔なら休養なし（末尾固定より優先）", () => {
    const info = getActionInfo(warlord([at(9, 45), at(10, 45)]), NOW);
    expect(info.strictStreak).toBe(2);
    expect(info.noRestStreak).toBe(2);
    expect(info.noRestLabel).toBe("休養なし");
  });

  it("分の1の位が異なれば表示なし", () => {
    const info = getActionInfo(warlord([at(9, 45), at(10, 42)]), NOW);
    expect(info.noRest).toBe(false);
    expect(info.noRestStreak).toBe(0);
    expect(info.noRestLabel).toBe(null);
  });

  it("45→35→35→25 は全て1の位が5なので streak=4・末尾固定", () => {
    const acts = [at(7, 45), at(8, 35), at(9, 35), at(10, 25)];
    const info = getActionInfo(warlord(acts), NOW);
    expect(info.noRestStreak).toBe(4);
    expect(info.noRestLabel).toBe("末尾固定");
  });

  it("5戦連続で1の位が一致すれば streak=5・固定分に進化", () => {
    const acts = [at(6, 5), at(7, 15), at(8, 25), at(9, 35), at(10, 45)];
    const info = getActionInfo(warlord(acts), NOW);
    expect(info.noRestStreak).toBe(5);
    expect(info.noRestStreak >= NO_REST_EVOLVE_STREAK).toBe(true);
    expect(info.noRestLabel).toBe("固定分");
  });

  it("途中で1の位が変わると末尾からの連続のみ数える", () => {
    // 1の位: 5, 5 → 2（休養で末尾移動） → 0, 0
    const acts = [at(6, 45), at(7, 35), at(8, 12), at(9, 10), at(10, 0)];
    const info = getActionInfo(warlord(acts), NOW);
    // 末尾は 9:10→10:00 の1の位 0 で一致なので streak=2
    expect(info.noRestStreak).toBe(2);
    expect(info.noRestLabel).toBe("末尾固定");
  });

  it("回帰: ひつまぶし（末尾固定が長く続く実データ）は固定分になる", () => {
    // 実データ。末尾は 1の位 0 が長く揃っており末尾固定 streak は5以上。
    // 直近5戦はちょうど60分間隔（休養なし streak=5）だが、
    // 末尾固定 streak の方が長いため、優先順位的に「固定分」になるべき。
    const acts = [
      "06/10 18:47",
      "06/10 19:47",
      "06/10 20:51",
      "06/11 16:51",
      "06/11 18:01",
      "06/11 20:01",
      "06/11 21:09",
      "06/12 11:42",
      "06/12 12:45",
      "06/12 19:55",
      "06/12 20:56",
      "06/14 22:50",
      "06/14 23:50",
      "06/15 03:50",
      "06/15 10:40",
      "06/15 11:50",
      "06/15 12:50",
      "06/15 13:50",
      "06/15 14:50",
      "06/15 15:50",
    ];
    const info = getActionInfo(warlord(acts), NOW);
    expect(info.noRestStreak).toBeGreaterThanOrEqual(NO_REST_EVOLVE_STREAK);
    expect(info.noRestLabel).toBe("固定分");
  });
});

describe("getActionInfo の兵力減判定", () => {
  it("守備敗北で兵力減なら経過時間にかかわらず行動可にしない", () => {
    const info = getActionInfo(warlord([at(9, 0)]), NOW, {
      depletedByDefenseLoss: true,
      defenseLossAt: at(10, 0),
    });

    expect(info.status).toBe("depleted");
    expect(ACTION_LABEL[info.status]).toBe("兵力減");
    expect(info.actionAt).toBe(at(10, 0));
  });
});
