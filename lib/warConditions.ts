/**
 * 交戦国の武将に対する「能力比較の条件」（例: 知力、敵以上 ×0.9）の判定。
 *
 * ゲームの設定画面で選ぶ条件が、交戦中の国の誰に当てはまるかをホームで
 * 一覧するために使う。ランキング取り込み・自己申告の能力値に、必要に応じて
 * 同一期の最新戦闘で確認した品物の能力補正を加える。
 */
import { parseActionDate } from "./action";
import { isWallBattle, parseBattleCard } from "./parser";
import { getEquipmentStatEffect } from "./equipmentStats";
import type { LatestEquipment } from "./latestEquipment";
import type { BattleRecord, Warlord, WarlordMap } from "./types";

type StatKey = "power" | "intelligence" | "leadership" | "politics" | "strategy";

const STAT_LABEL: Record<StatKey, string> = {
  power: "武力",
  intelligence: "知力",
  leadership: "統率",
  politics: "政治",
  strategy: "計略ポイント",
};

export interface WarCondition {
  key: string;
  /** 比較する能力値（複数なら合計）。 */
  stats: StatKey[];
  /** gte: 自分が敵以上 / lte: 自分が敵以下 で該当。 */
  direction: "gte" | "lte";
  /** ゲーム画面に出る倍率（表示のみ）。 */
  multiplier: number;
}

const gte = (...stats: StatKey[]): WarCondition => ({
  key: `${stats.join("+")}:gte`,
  stats,
  direction: "gte",
  multiplier: 0.9,
});

/**
 * ゲームの選択肢と同じ並び。
 * 「戦闘力、敵以下」は戦闘力の値を持っていないため判定対象に含めていない。
 */
export const WAR_CONDITIONS: WarCondition[] = [
  gte("intelligence"),
  gte("power"),
  gte("leadership"),
  gte("politics"),
  gte("power", "leadership"),
  gte("leadership", "intelligence"),
  gte("intelligence", "power"),
  { key: "strategy:lte", stats: ["strategy"], direction: "lte", multiplier: 0.8 },
];

/** 比較する能力値の名前（例: "武力＋統率"）。 */
export function conditionStatLabel(c: WarCondition): string {
  return c.stats.map((s) => STAT_LABEL[s]).join("＋");
}

/** ゲーム画面と同じ表記（例: "知力、敵以上 ×0.9"）。 */
export function conditionLabel(c: WarCondition): string {
  return `${conditionStatLabel(c)}、敵${
    c.direction === "gte" ? "以上" : "以下"
  } ×${c.multiplier}`;
}

export interface ConditionEquipmentOptions {
  latestByWarlord: ReadonlyMap<string, LatestEquipment>;
  /** 未指定なら装備補正を含める。 */
  enabled?: boolean;
  /** 個別に装備補正を外して比較する武将名。 */
  excludedNames?: ReadonlySet<string>;
}

/**
 * 条件が見る能力値の合計。能力値または反映対象の品物の効果が不明なら null。
 * 装備なしの観測と、観測自体がない状態を区別する。計略Pは品物で変えない。
 * equipment を渡さない既存の呼出元では、取り込み値のみで比較する。
 */
export function conditionValue(
  c: WarCondition,
  w: Warlord,
  equipment?: ConditionEquipmentOptions
): number | null {
  const includeEquipment =
    equipment != null &&
    equipment.enabled !== false &&
    !equipment.excludedNames?.has(w.name);
  const observation = equipment?.latestByWarlord.get(w.name);
  const effect = observation?.item
    ? getEquipmentStatEffect(observation.item)
    : null;
  let sum = 0;
  for (const stat of c.stats) {
    const v = w[stat];
    if (v == null || !Number.isFinite(v)) return null;
    if (includeEquipment && stat !== "strategy") {
      if (
        !observation ||
        (w.term != null && observation.term !== w.term) ||
        (observation.item != null && !effect)
      ) return null;
      sum += v + (effect?.bonuses[stat] ?? 0);
    } else {
      sum += v;
    }
  }
  return sum;
}

export interface WarConditionRow {
  warlord: Warlord;
  /** 相手の値。能力値が未取得なら null。 */
  theirs: number | null;
  /** 自分 − 相手。どちらかが未設定なら null。 */
  diff: number | null;
  /** 該当するか。判定できなければ null。 */
  met: boolean | null;
}

/** 1つの条件を、敵武将それぞれについて判定する。 */
export function evaluateCondition(
  c: WarCondition,
  me: Warlord,
  enemies: readonly Warlord[],
  equipment?: ConditionEquipmentOptions
): WarConditionRow[] {
  const mine = conditionValue(c, me, equipment);
  return enemies.map((warlord) => {
    const theirs = conditionValue(c, warlord, equipment);
    if (mine == null || theirs == null) {
      return { warlord, theirs, diff: null, met: null };
    }
    const diff = mine - theirs;
    return {
      warlord,
      theirs,
      diff,
      met: c.direction === "gte" ? diff >= 0 : diff <= 0,
    };
  });
}

/** 直近の交戦とみなす時間（最後の戦闘からさかのぼる時間）。 */
export const WAR_WINDOW_HOURS = 24;

export interface WarFactions {
  /** 自国が直近 {@link WAR_WINDOW_HOURS} 時間に戦った国（＝いま交戦中とみなす国）。 */
  current: string[];
  /** ログの中で自国が一度でも戦った国（選び直しの候補）。 */
  all: string[];
}

/**
 * 戦闘履歴から、自国が戦っている相手国を求める。
 * 交戦状態そのものは記録していないため、自国の最後の戦闘から
 * {@link WAR_WINDOW_HOURS} 時間以内に戦った国を「いま交戦中」とみなす。
 * 壁戦（NPCの守備隊）は相手国の判定に使わない。
 */
export function detectWarFactions(
  log: readonly BattleRecord[],
  myFaction: string,
  now: Date = new Date()
): WarFactions {
  const latestByFaction = new Map<string, number>();
  for (const record of log) {
    const card = parseBattleCard(record.line);
    if (!card || isWallBattle(card)) continue;
    const left = card.left.faction?.trim();
    const right = card.right.faction?.trim();
    if (!left || !right || left === right) continue;
    const opponent =
      left === myFaction ? right : right === myFaction ? left : null;
    if (!opponent) continue;
    const at =
      parseActionDate(record.time ?? card.battleAt, now)?.getTime() ?? 0;
    latestByFaction.set(opponent, Math.max(latestByFaction.get(opponent) ?? 0, at));
  }
  const sortJa = (a: string, b: string) => a.localeCompare(b, "ja");
  const all = Array.from(latestByFaction.keys()).sort(sortJa);
  const latest = Math.max(0, ...latestByFaction.values());
  const since = latest - WAR_WINDOW_HOURS * 60 * 60 * 1000;
  return {
    current: all.filter((f) => (latestByFaction.get(f) ?? 0) >= since),
    all,
  };
}

/**
 * 指定した国に所属する武将（自分と同じ期のプロフィールに限る）。
 * db は名前ごとに最新のプロフィールを持つ map を渡す。
 */
export function warlordsOfFactions(
  db: WarlordMap,
  factions: readonly string[],
  me: Warlord
): Warlord[] {
  const set = new Set(factions);
  return Object.values(db)
    .filter(
      (w) =>
        w.name !== me.name &&
        set.has(w.faction?.trim() ?? "") &&
        (me.term == null || w.term === me.term)
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
