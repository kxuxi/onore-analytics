import {
  isSkewedSide,
  isWallBattle,
  normalizeWidth,
  parseBattleCard,
  splitBattleSegments,
  type BattleCard,
  type BattleSide,
} from "./parser";
import type { BattleRecord, Warlord } from "./types";

/** 最新の戦闘開始時に観測された品物。武器の欄は含めない。 */
export interface LatestEquipment {
  /** 明示的な「なし」は null。未知の品物名も元の文字列を保持する。 */
  item: string | null;
  term: number;
  observedAt?: string;
  observedName: string;
  household?: string;
}

interface Observation extends LatestEquipment {
  gameMonth: number | null;
  actionTime: number | null;
  attacker: string;
  battleNumber: number | null;
}

interface Candidate {
  observation: Observation;
  ambiguous: boolean;
}

interface TimeBucket {
  position: Observation;
  /** 同分の別出兵には前後関係がない。出兵者と連戦番号を分けて保持する。 */
  attackers: Map<string, Map<number | null, Candidate>>;
}

interface Person {
  names: Set<string>;
  bucket: TimeBucket;
}

const YEAR_SECONDS = 12 * 32 * 24 * 60 * 60;

function household(value: string | undefined): string | undefined {
  const name = value?.trim();
  return name && !["なし", "-", "ー"].includes(name) ? name : undefined;
}

function identity(name: string, family?: string): string {
  return family ? `family\u0000${family}` : `name\u0000${name}`;
}

function position(card: BattleCard, fallback?: string) {
  const text = normalizeWidth(card.battleAt ?? "");
  const fallbackText = normalizeWidth(fallback ?? "");
  const gamePattern = /(\d+)\s*年\s*(\d+)\s*月/;
  const realPattern = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const game = text.match(gamePattern) ?? fallbackText.match(gamePattern);
  const primaryTime = text.match(realPattern);
  const real = primaryTime ?? fallbackText.match(realPattern);
  const battleNumber = normalizeWidth(card.battleNo ?? "").match(/^(\d+)戦目$/);
  return {
    observedAt: primaryTime ? card.battleAt : fallback || card.battleAt,
    gameMonth: game ? Number(game[1]) * 12 + Number(game[2]) : null,
    actionTime: real
      ? (((Number(real[1]) * 32 + Number(real[2])) * 24 + Number(real[3])) * 60 + Number(real[4])) * 60 + Number(real[5] ?? 0)
      : null,
    // 壁への攻撃は、その出兵で直前の対人連戦を抜けた後に行われる。
    battleNumber: isWallBattle(card) ? Infinity : battleNumber ? Number(battleNumber[1]) : null,
  };
}

function compareTime(left: Observation, right: Observation): number {
  if (left.gameMonth !== right.gameMonth) {
    if (left.gameMonth == null) return -1;
    if (right.gameMonth == null) return 1;
    return left.gameMonth - right.gameMonth;
  }
  if (left.actionTime !== right.actionTime) {
    if (left.actionTime == null) return -1;
    if (right.actionTime == null) return 1;
    let difference = left.actionTime - right.actionTime;
    // 実日時には西暦がない。同一期内の12月→1月を新しい順に扱う。
    if (difference > YEAR_SECONDS / 2) difference -= YEAR_SECONDS;
    else if (difference < -YEAR_SECONDS / 2) difference += YEAR_SECONDS;
    return difference;
  }
  return 0;
}

function newBucket(observation: Observation): TimeBucket {
  return { position: observation, attackers: new Map() };
}

function observe(bucket: TimeBucket, observation: Observation, ambiguous = false): void {
  const order = compareTime(observation, bucket.position);
  if (order < 0) return;
  if (order > 0) {
    // 真に新しい時刻なら、以前の同時刻内の矛盾は持ち越さない。
    bucket.position = observation;
    bucket.attackers.clear();
  }
  let battles = bucket.attackers.get(observation.attacker);
  if (!battles) {
    battles = new Map();
    bucket.attackers.set(observation.attacker, battles);
  }
  const previous = battles.get(observation.battleNumber);
  if (!previous) {
    battles.set(observation.battleNumber, { observation, ambiguous });
  } else if (ambiguous || previous.observation.item !== observation.item) {
    previous.ambiguous = true;
  }
}

function resolvedObservation(bucket: TimeBucket): Observation | undefined {
  const candidates: Candidate[] = [];
  for (const battles of bucket.attackers.values()) {
    // 同一出兵内では最終連戦だけを採用する。連戦番号不明の観測は順序を
    // 特定できないため、番号が取れた最終戦とともに整合性を確認する。
    const numbered = [...battles.keys()].filter((n): n is number => n != null);
    if (numbered.length > 0) candidates.push(battles.get(Math.max(...numbered))!);
    const unknown = battles.get(null);
    if (unknown) candidates.push(unknown);
  }
  if (!candidates.length) return undefined;
  const item = candidates[0].observation.item;
  if (candidates.some((candidate) => candidate.ambiguous || candidate.observation.item !== item)) {
    return undefined;
  }
  // 同分の品物が一致しても根拠の表示名は複数あり得る。取り込み順に依存しない
  // 代表を選ぶ（時系列が判明している観測をこの並べ替えで上書きすることはない）。
  return candidates.map((candidate) => candidate.observation).sort((a, b) =>
    a.observedName.localeCompare(b.observedName, "ja") ||
    (a.household ?? "").localeCompare(b.household ?? "", "ja") ||
    a.attacker.localeCompare(b.attacker, "ja")
  )[0];
}

/**
 * 渡されたログの最新期から、武将ごとの直近の品物を求める。
 * 特定の期を表示する場合は、その期のログを渡すこと。
 *
 * ゲーム年月、実日時、同一出兵内の連戦順で比較する。保存日時や配列順で
 * 過去の装備へ巻き戻さない。同一期の家督名で旧名・現在名へ共有するが、
 * DB上で別の期・家督に属する武将には引き継がない。
 *
 * 観測がない、解析できない、同時刻の矛盾を解消できない場合はMapに載せない。
 * 明示的に装備がなくなった場合は item:null を載せ、以前の品物を残さない。
 */
export function buildLatestEquipment(
  log: readonly BattleRecord[],
  warlords: readonly Warlord[]
): Map<string, LatestEquipment> {
  const latestTerm = log.reduce<number | null>(
    (latest, record) => latest == null || record.term > latest ? record.term : latest,
    null
  );
  if (latestTerm == null) return new Map();

  const byName = new Map(warlords.map((w) => [w.name.trim(), w]));
  const familyOf = (side: BattleSide) => {
    const profile = byName.get(side.name.trim());
    return household(side.family) ??
      (profile && (profile.term == null || profile.term === latestTerm)
        ? household(profile.household)
        : undefined);
  };
  const people = new Map<string, Person>();
  for (const record of log) {
    if (record.term !== latestTerm) continue;
    const segments = splitBattleSegments(record.line);
    for (const segment of segments) {
      const card = parseBattleCard(segment);
      if (!card) continue;
      // 連結レコードの時刻は先頭の通常戦を指す。後続の壁戦へ流用しない。
      const where = position(card, segments.length === 1 ? record.time : undefined);
      const attacker = identity(card.left.name.trim(), familyOf(card.left));
      for (const side of isWallBattle(card) ? [card.left] : [card.left, card.right]) {
        const name = side.name.trim();
        if (!name || isSkewedSide(side)) continue;
        const family = familyOf(side);
        const candidate: Observation = {
          ...where,
          attacker,
          item: side.equip1 ?? null,
          term: record.term,
          observedName: name,
          household: family,
        };
        const key = identity(name, family);
        let person = people.get(key);
        if (!person) {
          person = { names: new Set(), bucket: newBucket(candidate) };
          people.set(key, person);
        }
        person.names.add(name);
        observe(person.bucket, candidate);
      }
    }
  }

  // 現在名しかDBにない場合も、同一期の旧名ログから家督をたどれるようにする。
  for (const warlord of warlords) {
    if (warlord.term != null && warlord.term !== latestTerm) continue;
    const name = warlord.name.trim();
    people.get(identity(name, household(warlord.household)))?.names.add(name);
  }

  const observations = new Map<string, TimeBucket>();
  for (const person of people.values()) {
    for (const name of person.names) {
      const profile = byName.get(name);
      if (profile) {
        if (profile.term != null && profile.term !== latestTerm) continue;
        const family = household(profile.household);
        if (family && family !== person.bucket.position.household) continue;
      }
      let bucket = observations.get(name);
      if (!bucket) {
        bucket = newBucket(person.bucket.position);
        observations.set(name, bucket);
      }
      for (const battles of person.bucket.attackers.values()) {
        for (const candidate of battles.values()) {
          observe(bucket, candidate.observation, candidate.ambiguous);
        }
      }
    }
  }

  const result = new Map<string, LatestEquipment>();
  for (const [name, bucket] of observations) {
    const value = resolvedObservation(bucket);
    if (!value) continue;
    result.set(name, {
      item: value.item,
      term: value.term,
      observedAt: value.observedAt,
      observedName: value.observedName,
      household: value.household,
    });
  }
  return result;
}
