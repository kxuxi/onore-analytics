"use client";

import { useEffect, useMemo, useState } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { buildLatestEquipment, type LatestEquipment } from "@/lib/latestEquipment";
import { getEquipmentStatEffect, type EquipmentStatKey } from "@/lib/equipmentStats";
import {
  WAR_CONDITIONS,
  WAR_WINDOW_HOURS,
  conditionLabel,
  conditionStatLabel,
  conditionValue,
  detectWarFactions,
  evaluateCondition,
  warlordsOfFactions,
  type ConditionEquipmentOptions,
  type WarConditionRow,
} from "@/lib/warConditions";

/**
 * 手動で選び直した交戦国の保存先。期と自国ごとに分けて持つ
 * （別の期で選んだ国を持ち越すと、その期には居ない国で判定してしまう）。
 */
const FACTIONS_KEY = "onore.home.warFactions.v2";

function readOverrides(): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(FACTIONS_KEY) ?? "{}"
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string[]>)
      : {};
  } catch {
    return {};
  }
}

/** 手動で選び直した交戦国（未保存・読めない環境では null＝自動判定）。 */
function readFactionOverride(scope: string): string[] | null {
  const saved = readOverrides()[scope];
  return Array.isArray(saved)
    ? saved.filter((v): v is string => typeof v === "string")
    : null;
}

function writeFactionOverride(scope: string, factions: string[] | null) {
  try {
    const all = readOverrides();
    if (factions) all[scope] = factions;
    else delete all[scope];
    window.localStorage.setItem(FACTIONS_KEY, JSON.stringify(all));
  } catch {
    // 保存できない環境では、その場限りの選択で動かす。
  }
}

const formatValue = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

const formatDiff = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${formatValue(Math.abs(n))}`;

/** 境目に近い（少しの変動で判定が入れ替わる）相手から並べる。 */
const byCloseness = (a: WarConditionRow, b: WarConditionRow) =>
  Math.abs(a.diff ?? 0) - Math.abs(b.diff ?? 0) ||
  a.warlord.name.localeCompare(b.warlord.name, "ja");

const EQUIPMENT_STAT_LABELS: Record<EquipmentStatKey, string> = {
  power: "武力",
  intelligence: "知力",
  leadership: "統率",
  politics: "政治",
};

function EquipmentChoice({
  name,
  observation,
  options,
  onToggle,
}: {
  name: string;
  observation?: LatestEquipment;
  options: ConditionEquipmentOptions;
  onToggle: (name: string) => void;
}) {
  const effect = observation?.item
    ? getEquipmentStatEffect(observation.item)
    : null;
  const bonusLabel = effect
    ? (Object.keys(EQUIPMENT_STAT_LABELS) as EquipmentStatKey[])
        .filter((stat) => effect.bonuses[stat])
        .map((stat) => `${EQUIPMENT_STAT_LABELS[stat]}${formatDiff(effect.bonuses[stat]!)}`)
        .join("・") || "能力補正なし"
    : "補正値未確認";
  const included = options.enabled !== false && !options.excludedNames?.has(name);
  return (
    <span className="home-war-equipment">
      <label className="home-war-equip-toggle">
        <input
          type="checkbox"
          checked={included}
          disabled={options.enabled === false || observation?.item === null}
          onChange={() => onToggle(name)}
          aria-label={`${name}の装備補正を反映`}
        />
        <span>
          {observation ? observation.item ?? "装備なし" : "装備未確認"}
          <span className="muted">
            {observation?.item ? `（${bonusLabel}）` : ""}
            {!included ? "・補正を除外" : ""}
          </span>
        </span>
      </label>
      {observation?.observedAt && (
        <span className="home-war-equip-time muted">
          確認: {observation.observedAt}
        </span>
      )}
    </span>
  );
}

function ConditionColumn({
  title,
  rows,
  multipleFactions,
  onSelectWarlord,
  equipment,
  onToggleEquipment,
}: {
  title: string;
  rows: WarConditionRow[];
  multipleFactions: boolean;
  onSelectWarlord: (name: string) => void;
  equipment: ConditionEquipmentOptions;
  onToggleEquipment: (name: string) => void;
}) {
  return (
    <section className="home-war-col">
      <h4 className="home-usage-title">
        {title} {rows.length}人
      </h4>
      {rows.length === 0 ? (
        <p className="home-split-empty muted">いません。</p>
      ) : (
        <ul className="home-war-list">
          {rows.map((r) => (
            <li key={r.warlord.name} className="home-war-row">
              <span className="home-war-name">
                <button
                  type="button"
                  className="link-like"
                  onClick={() => onSelectWarlord(r.warlord.name)}
                >
                  {r.warlord.name}
                </button>
                {multipleFactions && (
                  <span className="home-war-faction muted">
                    {r.warlord.faction}
                  </span>
                )}
              </span>
              <span className="home-war-val">
                {r.theirs == null ? "—" : formatValue(r.theirs)}
              </span>
              <span className="home-war-diff muted">
                {r.diff == null ? "判定不可" : `自分${formatDiff(r.diff)}`}
              </span>
              <EquipmentChoice
                name={r.warlord.name}
                observation={equipment.latestByWarlord.get(r.warlord.name)}
                options={equipment}
                onToggle={onToggleEquipment}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 「交戦国との条件判定」カード（管理者のみ）。
 * ゲームで選ぶ条件（例: 知力、敵以上 ×0.9）を1つ選ぶと、交戦中の国の武将を
 * 該当・非該当の2列に分けて示す。条件のボタンには該当人数を出し、
 * どの条件がいちばん多くの相手に当てはまるかを選ぶ前に見比べられる。
 */
export function HomeWarConditions({
  me,
  db,
  log,
  onSelectWarlord,
}: {
  me: Warlord;
  db: WarlordMap;
  log: BattleRecord[];
  onSelectWarlord: (name: string) => void;
}) {
  const [conditionKey, setConditionKey] = useState(WAR_CONDITIONS[0].key);
  const [override, setOverride] = useState<string[] | null>(null);
  const [includeEquipment, setIncludeEquipment] = useState(true);
  const [excludedNames, setExcludedNames] = useState<ReadonlySet<string>>(() => new Set());
  const myFaction = me.faction?.trim() ?? "";
  const scope = `${me.term ?? "all"}:${myFaction}`;
  useEffect(() => setOverride(readFactionOverride(scope)), [scope]);

  const detected = useMemo(
    () => detectWarFactions(log, myFaction),
    [log, myFaction]
  );
  const factions = override ?? detected.current;
  const factionOptions = useMemo(
    () =>
      Array.from(new Set([...detected.all, ...factions])).sort((a, b) =>
        a.localeCompare(b, "ja")
      ),
    [detected.all, factions]
  );
  const setFactions = (next: string[] | null) => {
    setOverride(next);
    writeFactionOverride(scope, next);
  };

  const enemies = useMemo(
    () => warlordsOfFactions(db, factions, me),
    [db, factions, me]
  );
  const latestByWarlord = useMemo(
    () => buildLatestEquipment(log, [me, ...enemies]),
    [log, me, enemies]
  );
  const equipment = useMemo<ConditionEquipmentOptions>(
    () => ({ latestByWarlord, enabled: includeEquipment, excludedNames }),
    [latestByWarlord, includeEquipment, excludedNames]
  );
  const toggleEquipment = (name: string) => {
    setExcludedNames((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const results = useMemo(
    () =>
      WAR_CONDITIONS.map((condition) => {
        const rows = evaluateCondition(condition, me, enemies, equipment);
        return {
          condition,
          rows,
          met: rows.filter((r) => r.met === true).length,
          judged: rows.filter((r) => r.met != null).length,
        };
      }),
    [me, enemies, equipment]
  );
  const active = results.find((r) => r.condition.key === conditionKey) ?? results[0];
  const mine = conditionValue(active.condition, me, equipment);
  const baseMine = conditionValue(active.condition, me);
  const statLabel = conditionStatLabel(active.condition);
  const met = active.rows.filter((r) => r.met === true).sort(byCloseness);
  const unmet = active.rows.filter((r) => r.met === false).sort(byCloseness);
  const unjudged = active.rows.filter((r) => r.met == null);

  return (
    <div className="home-card">
      <div className="home-card-head">
        <h3 className="home-card-title">🎯 交戦国との条件判定</h3>
        {mine != null && (
          <span className="home-card-aside muted">
            自分の{statLabel} {formatValue(mine)}
          </span>
        )}
      </div>

      <div className="home-war-equipment-settings">
        <label className="home-war-equip-toggle">
          <input
            type="checkbox"
            checked={includeEquipment}
            onChange={(e) => setIncludeEquipment(e.target.checked)}
          />
          装備品を計算に含める
        </label>
        <div className="home-war-own-equipment">
          <span className="home-war-picker-label muted">自分の装備品</span>
          <EquipmentChoice
            name={me.name}
            observation={latestByWarlord.get(me.name)}
            options={equipment}
            onToggle={toggleEquipment}
          />
        </div>
        <p className="home-card-note muted">
          直近の戦闘で確認した品物の能力補正を反映します。各武将のチェックを外すと、取り込んだ能力値だけで比較できます。
          装備補正を含める場合、装備や補正値が未確認の武将は判定できません。
        </p>
      </div>

      <div className="home-war-picker">
        <span className="home-war-picker-label muted">
          交戦国
          {override ? (
            <button
              type="button"
              className="link-like home-war-reset"
              onClick={() => setFactions(null)}
            >
              自動判定に戻す
            </button>
          ) : (
            `（直近${WAR_WINDOW_HOURS}時間の戦闘から自動判定）`
          )}
        </span>
        {factionOptions.length === 0 ? (
          <span className="muted">
            自国が他国と戦った履歴がまだありません。
          </span>
        ) : (
          <div className="home-war-chips">
            {factionOptions.map((f) => {
              const on = factions.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  className={"home-war-chip" + (on ? " is-on" : "")}
                  aria-pressed={on}
                  onClick={() =>
                    setFactions(
                      on ? factions.filter((x) => x !== f) : [...factions, f]
                    )
                  }
                >
                  {f}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {enemies.length > 0 && (
        <>
          <div className="home-war-picker">
            <span className="home-war-picker-label muted">
              条件（数字は該当人数）
            </span>
            <div className="home-war-chips">
              {results.map(({ condition, met: count, judged }) => {
                const on = condition.key === active.condition.key;
                return (
                  <button
                    key={condition.key}
                    type="button"
                    className={"home-war-chip" + (on ? " is-on" : "")}
                    aria-pressed={on}
                    onClick={() => setConditionKey(condition.key)}
                  >
                    {conditionLabel(condition)}
                    <span className="home-war-chip-count">
                      {count}/{judged}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {mine == null ? (
            <p className="home-card-note muted">
              {baseMine == null
                ? `自分の${statLabel}が未設定です。下の「自分のステータス」で入力すると判定できます。`
                : "自分の装備または補正値が未確認です。装備補正を外すと、取り込んだ能力値で判定できます。"}
            </p>
          ) : (
            <div className="home-usage-cols">
              <ConditionColumn
                title="⭕ 該当"
                rows={met}
                multipleFactions={factions.length > 1}
                onSelectWarlord={onSelectWarlord}
                equipment={equipment}
                onToggleEquipment={toggleEquipment}
              />
              <ConditionColumn
                title="❌ 非該当"
                rows={unmet}
                multipleFactions={factions.length > 1}
                onSelectWarlord={onSelectWarlord}
                equipment={equipment}
                onToggleEquipment={toggleEquipment}
              />
            </div>
          )}

          {unjudged.length > 0 && (
            <details className="home-war-unjudged" open={mine == null}>
              <summary className="muted">
                能力値・装備が未確認で判定できない {unjudged.length}人
              </summary>
              <ConditionColumn
                title="判定保留"
                rows={unjudged}
                multipleFactions={factions.length > 1}
                onSelectWarlord={onSelectWarlord}
                equipment={equipment}
                onToggleEquipment={toggleEquipment}
              />
            </details>
          )}
        </>
      )}
      {factions.length > 0 && enemies.length === 0 && (
        <p className="home-card-note muted">
          選択中の国に所属する武将のデータがありません。
        </p>
      )}
    </div>
  );
}
