import { parseBattleCard } from "./lib/parser";
import { unitStats } from "./lib/stats";
import type { BattleRecord } from "./lib/types";

function line(mark: string, ym: string, time: string, turns: string): string {
  return `${mark} ${ym} ${time} 京都 織田 信長 織田家 武特 騎馬隊 騎兵 金の腕輪 鬼丸 V.S. 武田 勝頼 武田家 統特 足軽隊 歩兵 金の兜 カルバリン砲 信長の勝利 ${turns}`;
}
const mk = (l: string, savedAt: number): BattleRecord =>
  ({ line: l, savedAt } as BattleRecord);

const cases: [string, string][] = [
  ["半角全部", line("【1戦目】", "1700年4月", "04/12 12:00", "12")],
  ["全角マーカー", line("【１戦目】", "1700年4月", "04/12 12:00", "12")],
  ["全角年月", line("【1戦目】", "１７００年４月", "04/12 12:00", "12")],
  ["全角時刻", line("【1戦目】", "1700年4月", "０４／１２ １２：００", "12")],
];
for (const [name, l] of cases) {
  const c = parseBattleCard(l);
  console.log(
    name.padEnd(8),
    "battleAt=[" + (c?.battleAt ?? "NULL") + "]  leftUnit=[" + (c?.left?.unit ?? "NULL") + "]"
  );
}

// 全角マーカーの log で年フィルタが効くか
const log = [
  mk(line("【１戦目】", "1690年4月", "04/10 10:00", "12"), 1),
  mk(line("【１戦目】", "1700年4月", "04/12 12:00", "12"), 3),
];
console.log("all kiba:", unitStats(log).find((s) => s.unit === "騎馬隊")?.battles);
console.log("range 1700-1710 kiba:", unitStats(log, { from: 1700, to: 1710 }).find((s) => s.unit === "騎馬隊")?.battles);
