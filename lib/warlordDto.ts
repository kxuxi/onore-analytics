import type { Warlord } from "./types";

export interface WarlordCoreRow {
  name: string;
  faction: string | null;
  type: string;
  branch: string;
  unit: string | null;
  battleAt: string | null;
  lastActionAt: string | null;
  actions: string[];
  updatedAt: bigint;
  power: number | null;
  intelligence: number | null;
  leadership: number | null;
  politics: number | null;
  strategy: number | null;
  selfPr: string | null;
  maxTroops: number | null;
  statsRaw: string | null;
}

export function warlordCoreRowToDto(row: WarlordCoreRow): Warlord {
  return {
    name: row.name,
    faction: row.faction ?? undefined,
    type: row.type,
    branch: row.branch,
    unit: row.unit ?? undefined,
    battleAt: row.battleAt ?? undefined,
    lastActionAt: row.lastActionAt ?? undefined,
    actions: row.actions.length > 0 ? row.actions : undefined,
    updatedAt: Number(row.updatedAt),
    power: row.power ?? undefined,
    intelligence: row.intelligence ?? undefined,
    leadership: row.leadership ?? undefined,
    politics: row.politics ?? undefined,
    strategy: row.strategy ?? undefined,
    selfPr: row.selfPr ?? undefined,
    maxTroops: row.maxTroops ?? undefined,
    statsRaw: row.statsRaw ?? undefined,
  };
}
