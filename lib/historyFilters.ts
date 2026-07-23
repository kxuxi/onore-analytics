import { normalizeDisplayToken, type BattleCard } from "./parser";
import type { BattleRecord } from "./types";

export function buildBattleSearchText(
  record: BattleRecord,
  card: BattleCard | null
): string {
  const searchableParts: string[] = [record.line];
  if (card) {
    for (const side of [card.left, card.right]) {
      if (side.name) searchableParts.push(side.name);
      if (side.faction) searchableParts.push(side.faction);
      if (side.branch) searchableParts.push(side.branch);
      if (side.unit) searchableParts.push(normalizeDisplayToken(side.unit));
      for (const equipment of side.equips) {
        searchableParts.push(normalizeDisplayToken(equipment));
      }
    }
  }
  return searchableParts.join(" ").toLowerCase();
}

export function parseGameMonthOrder(
  time: string | undefined
): number | null {
  if (!time) return null;
  const match = time.match(/(\d+)\s*年\s*(\d+)\s*月/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

export function formatGameMonthOrder(order: number): string {
  const month = ((order - 1) % 12) + 1;
  const year = Math.floor((order - 1) / 12);
  return `${year}年${month}月`;
}
