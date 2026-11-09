"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { lookup, normalizationMap } from "@/lib/storage";
import { getMyWarlord } from "@/lib/myWarlord";
import { latestUnitByWarlord } from "@/lib/stats";
import { displayWarlordType } from "@/lib/warlordType";
import {
  ACTION_LABEL,
  formatElapsed,
  getActionInfo,
  STATUS_ORDER,
  type ActionInfo,
  type ActionStatus,
} from "@/lib/action";
import {
  buildLastTargets,
  computeForecast,
  floorToSlot,
  formatClock,
  hourlyActivity,
  latestImportedAt,
  type Forecast,
  type LastTarget,
} from "@/lib/damageForecast";
import {
  buildActionAvailability,
  type ActionAvailability,
} from "@/lib/actionObservation";

/**
 * 家督名（household）が同じ武将（＝同一人物の旧名）の行動時刻をすべて合算する。
 * "MM/DD HH:mm" はゼロ埋め固定長のため辞書順ソートで時刻順になる。
 */
function mergeAliasActions(aliases: (Warlord | undefined)[]): string[] {
  const set = new Set<string>();
  for (const w of aliases) {
    for (const a of w?.actions ?? []) if (a) set.add(a);
    if (w?.lastActionAt) set.add(w.lastActionAt);
  }
  return Array.from(set).sort();
}

interface Props {
  /** 表示期に登録された武将。 */
  db: WarlordMap;
  /**
   * 全件の武将。表示期の壁戦で観測されたものの、プロフィールの最終更新期が
   * 前期のままの武将を行へ補完するために使う。
   */
  allDb?: WarlordMap;
  log: BattleRecord[];
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
}

interface DamageCandidate {
  /** 名前・国・兵種など、行に表示するプロフィール。 */
  warlord: Warlord;
  /** 表示対象になった別名の保存済み観測を統合した行動判定用データ。 */
  actionWarlord: Warlord;
  availability?: ActionAvailability;
  hasAttack: boolean;
  canOpenDetail: boolean;
}

function warlordFromWallProfile(
  profile: NonNullable<ActionAvailability["latestAttackProfile"]>,
  term: number,
  fallback?: Warlord
): Warlord {
  return {
    ...fallback,
    ...profile,
    term,
    updatedAt: fallback?.updatedAt ?? 0,
  };
}

/**
 * 表示期の武将を基本に、同じ期のログで観測された人物だけを全DBから補う。
 *
 * 壁戦は通常戦のプロフィール取り込み対象ではないため、壁戦だけに登場した人物は
 * Warlord.term が前期のままになることがある。その補完行には前期の保存時刻を
 * 持ち込まず、今期の壁戦時刻だけを判定に使う。
 */
export function buildDamageCandidates(
  db: WarlordMap,
  allDb: WarlordMap,
  log: readonly BattleRecord[]
): DamageCandidate[] {
  const { canonicalNames, canonicalHouseholds } = canonicalMaps(allDb);
  const scopedCanonicalNames = normalizationMap(db);
  const availabilityByWarlord = buildActionAvailability(
    log,
    canonicalNames,
    canonicalHouseholds
  );
  const candidates: DamageCandidate[] = [];
  const aliasesByCanonical = new Map<string, Warlord[]>();

  // householdAliases をグループごとに全件走査せず、一度の走査でまとめる。
  for (const warlord of Object.values(allDb)) {
    const canonical = canonicalNames[warlord.name] ?? warlord.name;
    const aliases = aliasesByCanonical.get(canonical);
    if (aliases) aliases.push(warlord);
    else aliasesByCanonical.set(canonical, [warlord]);
  }

  for (const [canonical, allAliases] of aliasesByCanonical) {
    const scopedAliases = allAliases.filter((w) => db[w.name] != null);
    const availability = availabilityByWarlord.get(canonical);

    // 表示期のDBにもログにも存在しない人物は、従来どおり対象外。
    if (scopedAliases.length === 0 && !availability) continue;

    const scopedRepresentative = scopedAliases[0]
      ? db[scopedCanonicalNames[scopedAliases[0].name] ?? scopedAliases[0].name]
      : undefined;
    const fallbackWarlord =
      scopedRepresentative ?? allDb[canonical] ?? allAliases[0];
    const hasProfileForObservedTerm =
      availability == null ||
      scopedAliases.some((alias) => alias.term === availability.term);
    // ログの期に一致するDBプロフィールが無い場合は、現在の壁戦に含まれる
    // 国・タイプ・兵種を優先する。全期間表示でも前期の国で絞り込まれない。
    const warlord =
      !hasProfileForObservedTerm && availability?.latestAttackProfile
        ? warlordFromWallProfile(
            availability.latestAttackProfile,
            availability.term,
            fallbackWarlord
          )
        : fallbackWarlord;
    const actions = mergeAliasActions(scopedAliases);
    const actionWarlord: Warlord = {
      ...warlord,
      actions,
      // 前期のプロフィールだけを補った場合、前期の時刻は今期判定へ流用しない。
      lastActionAt: actions[actions.length - 1],
    };
    const hasAttack =
      scopedAliases.some((alias) => (alias.actions?.length ?? 0) > 0) ||
      availability?.latestAttackAt != null;

    candidates.push({
      warlord,
      actionWarlord,
      availability,
      hasAttack,
      // 表示期の詳細データが無い補完行は、空の詳細ページへ遷移させない。
      canOpenDetail: db[warlord.name] != null,
    });
  }

  // 壁戦にしか登場せず、Warlord DBへまだ一度も登録されていない人物も表示する。
  for (const [canonical, availability] of availabilityByWarlord) {
    if (aliasesByCanonical.has(canonical) || !availability.latestAttackProfile) {
      continue;
    }
    const warlord = warlordFromWallProfile(
      availability.latestAttackProfile,
      availability.term
    );
    candidates.push({
      warlord,
      actionWarlord: warlord,
      availability,
      hasAttack: true,
      canOpenDetail: false,
    });
  }

  return candidates;
}

/** 別名・家督名を代表名へ寄せる対応表（被弾表の候補と出兵先の集計で共有する）。 */
function canonicalMaps(allDb: WarlordMap) {
  const canonicalNames = normalizationMap(allDb);
  const canonicalHouseholds: Record<string, string> = {};
  for (const warlord of Object.values(allDb)) {
    if (!warlord.household) continue;
    canonicalHouseholds[warlord.household] =
      canonicalNames[warlord.name] ?? warlord.name;
  }
  return { canonicalNames, canonicalHouseholds };
}

const STATUS_CLASS: Record<ActionStatus, string> = {
  done: "status done",
  ready: "status ready",
  unknown: "status unknown",
  depleted: "status depleted",
  none: "status none",
};

// 集計・フィルタに表示するステータス（none を除く）。守備側の警戒度が高い順。
const STATUS_SUMMARY_ORDER = [
  "ready",
  "done",
  "depleted",
  "unknown",
] as const;

/** 集計タイルの補足（そのステータスが守備側にとって何を意味するか）。 */
const STATUS_HINT: Record<(typeof STATUS_SUMMARY_ORDER)[number], string> = {
  ready: "今すぐ来うる",
  done: "まもなく出兵可能",
  depleted: "守備敗北で兵が減少",
  unknown: "観測が途切れている",
};

type RoleFilter = "" | "attack" | "defense-only";
type DamageView = "timeline" | "list";

/** ブラウザに保存する被弾表の表示設定。 */
interface DamagePrefs {
  view: DamageView;
  statusFilter: "" | ActionStatus;
  includeFactions: string[];
  excludeFactions: string[];
  roleFilter: RoleFilter;
  notify: boolean;
}

const PREFS_KEY = "onore.damage.prefs.v1";
const DEFAULT_PREFS: DamagePrefs = {
  view: "timeline",
  statusFilter: "",
  includeFactions: [],
  excludeFactions: [],
  // 守備の判断では出兵してこない「守備のみ」の武将はノイズになるため既定で外す。
  roleFilter: "attack",
  notify: false,
};

function readPrefs(): DamagePrefs | null {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DamagePrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      includeFactions: Array.isArray(parsed.includeFactions)
        ? parsed.includeFactions
        : [],
      excludeFactions: Array.isArray(parsed.excludeFactions)
        ? parsed.excludeFactions
        : [],
    };
  } catch {
    return null;
  }
}

function writePrefs(prefs: DamagePrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 保存できない環境（プライベートモード等）では、その場限りの設定で動かす。
  }
}

/** 並び順をこの分数より長く固定していたら、更新を促す。 */
const ORDER_STALE_MINUTES = 5;
/** 最新の観測からこの分数を超えたら、データが古い警告を出す。 */
const OBSERVATION_STALE_MINUTES = 30;
/** 固定行動の予測時刻の何分前に通知するか。 */
const NOTIFY_LEAD_MINUTES = 5;

const minutesBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 60000);

/** 「あと12分」「3分前」のような相対表記。 */
function relativeLabel(target: Date, now: Date): string {
  const diff = minutesBetween(now, target);
  if (diff > 0) return `あと${formatElapsed(diff)}`;
  if (diff === 0) return "まもなく";
  return `${formatElapsed(-diff)}前`;
}

interface DamageEntry {
  key: string;
  w: Warlord;
  info: ActionInfo;
  forecast: Forecast;
  /** 並び替え・時間帯分けに使う、並び固定時点の判定。 */
  orderInfo: ActionInfo;
  orderForecast: Forecast;
  hasAttack: boolean;
  canOpenDetail: boolean;
  actions: string[];
  lastTarget?: LastTarget;
  /** 前回の出兵先が自国・同盟（除外する国）だったか。 */
  targetsMine: boolean;
}

/** 時間帯分けで「動向不明」の折りたたみに回すか（予測も無く観測が途切れている）。 */
const isStaleUnknown = (e: DamageEntry) =>
  e.orderInfo.status === "unknown" && e.orderForecast.predictedAt == null;

function compareEntries(a: DamageEntry, b: DamageEntry): number {
  const sa = isStaleUnknown(a) ? 1 : 0;
  const sb = isStaleUnknown(b) ? 1 : 0;
  if (sa !== sb) return sa - sb;
  const ta = a.orderForecast.expectedAt?.getTime() ?? Infinity;
  const tb = b.orderForecast.expectedAt?.getTime() ?? Infinity;
  if (ta !== tb) return ta - tb;
  const so =
    STATUS_ORDER[a.orderInfo.status] - STATUS_ORDER[b.orderInfo.status];
  if (so !== 0) return so;
  return a.w.name.localeCompare(b.w.name, "ja");
}

function fixedBadgeClass(label: ActionInfo["noRestLabel"]): string {
  if (label === "固定分") return "status no-rest no-rest--evolved";
  if (label === "休養なし") return "status no-rest no-rest--strict";
  return "status no-rest no-rest--loose";
}

/** 固定バッジの本文。連続戦数と「毎時◯5分」を画面上に出す（ツールチップに隠さない）。 */
function fixedBadgeText(info: ActionInfo, forecast: Forecast): string | null {
  if (!info.noRestLabel) return null;
  const streak =
    info.noRestLabel === "休養なし" ? info.strictStreak : info.noRestStreak;
  const digit =
    forecast.fixedDigit != null ? `・毎時◯${forecast.fixedDigit}分` : "";
  return `${info.noRestLabel} ${streak}戦${digit}`;
}

/** 行の左端に出す「次に来る時刻」。 */
function NextAttackTime({ entry, now }: { entry: DamageEntry; now: Date }) {
  const { info, forecast } = entry;
  if (forecast.predictedAt) {
    const spread = forecast.predictedSpread ?? 0;
    const from = new Date(forecast.predictedAt.getTime() - spread * 60000);
    return (
      <div className="dmg-time is-predicted">
        <span className="dmg-time-main">
          {spread > 0
            ? `${formatClock(from)}〜${formatClock(forecast.predictedAt)}`
            : formatClock(forecast.predictedAt)}
        </span>
        <span className="dmg-time-sub">
          予測・{relativeLabel(forecast.predictedAt, now)}
        </span>
      </div>
    );
  }
  if (
    (info.status === "done" || info.status === "depleted") &&
    forecast.readyAt
  ) {
    return (
      <div className="dmg-time is-cooldown">
        <span className="dmg-time-main">{formatClock(forecast.readyAt)}〜</span>
        <span className="dmg-time-sub">
          出兵可能まで{relativeLabel(forecast.readyAt, now).replace("あと", "")}
        </span>
      </div>
    );
  }
  if (info.status === "ready") {
    return (
      <div className="dmg-time is-now">
        <span className="dmg-time-main">今</span>
        <span className="dmg-time-sub">いつでも来うる</span>
      </div>
    );
  }
  return (
    <div className="dmg-time is-unknown">
      <span className="dmg-time-main">—</span>
      <span className="dmg-time-sub">予測できない</span>
    </div>
  );
}

/** 0〜23時の観測件数を単色の濃淡で並べた帯（時間帯の傾向）。 */
function HourStrip({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const peak = counts.indexOf(Math.max(...counts));
  return (
    <div className="dmg-hours">
      <p className="sr-only">
        {total > 0
          ? `観測${total}件。最も多いのは${peak}時台（${counts[peak]}件）`
          : "観測なし"}
      </p>
      <ol className="dmg-hours-strip" aria-hidden="true">
        {counts.map((c, h) => (
          <li
            key={h}
            className={"dmg-hour" + (c > 0 ? " has" : "")}
            style={
              c > 0
                ? ({ "--dmg-heat": `${Math.round(25 + (c / max) * 75)}%` } as React.CSSProperties)
                : undefined
            }
            title={`${h}時台：${c}件`}
          />
        ))}
      </ol>
      <div className="dmg-hours-axis" aria-hidden="true">
        <span>0時</span>
        <span>6時</span>
        <span>12時</span>
        <span>18時</span>
        <span>24時</span>
      </div>
    </div>
  );
}

function DamageRow({
  entry,
  now,
  colors,
  expanded,
  onToggle,
  onSelectWarlord,
}: {
  entry: DamageEntry;
  now: Date;
  colors: FactionColorMap;
  expanded: boolean;
  onToggle: () => void;
  onSelectWarlord: (name: string) => void;
}) {
  const { w, info, forecast, hasAttack, canOpenDetail, lastTarget } = entry;
  const detailId = `dmg-detail-${entry.key}`;
  const fixedText = fixedBadgeText(info, forecast);
  const branch = w.branch?.trim();
  const type = displayWarlordType(w);
  const recent = entry.actions.slice(-8).reverse();

  return (
    <li className={"dmg-row" + (entry.targetsMine ? " is-mine" : "")}>
      <div className="dmg-row-main">
        <NextAttackTime entry={entry} now={now} />
        <div className="dmg-who">
          <div className="dmg-who-line">
            {canOpenDetail ? (
              <button
                type="button"
                className="link-like dmg-name"
                onClick={() => onSelectWarlord(w.name)}
                title={`${w.name} の戦績を見る`}
              >
                {w.name}
              </button>
            ) : (
              <span className="dmg-name">{w.name}</span>
            )}
            <span className={STATUS_CLASS[info.status]}>
              {ACTION_LABEL[info.status]}
            </span>
            {fixedText && (
              <span className={fixedBadgeClass(info.noRestLabel)}>
                {fixedText}
              </span>
            )}
            {!hasAttack && (
              <span className="status defense-only">守備のみ</span>
            )}
            {entry.targetsMine && (
              <span className="status dmg-mine">⚠ 自国を攻撃</span>
            )}
          </div>
          <div className="dmg-meta">
            {w.faction ? (
              <span
                className="tag faction"
                style={factionBadgeStyle(w.faction, colors)}
              >
                {w.faction}
              </span>
            ) : null}
            {w.unit ? (
              <span className="tag unit">{w.unit}</span>
            ) : null}
            {(branch || type) && (
              <span className="dmg-meta-text">
                {[branch, type].filter(Boolean).join("・")}
              </span>
            )}
            {forecast.baseAt && (
              <span className="dmg-meta-text">
                {info.status === "depleted" ? "守備敗北" : "前回"}{" "}
                {formatClock(forecast.baseAt)}（{relativeLabel(forecast.baseAt, now)}）
              </span>
            )}
            {lastTarget && (
              <span className="dmg-meta-text">
                → {lastTarget.place ?? "?"}
                {lastTarget.defenderFaction
                  ? `（${lastTarget.defenderFaction}${
                      lastTarget.wall ? "の城壁" : ""
                    }）`
                  : ""}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="dmg-expand"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={`${w.name} の行動パターンを${expanded ? "閉じる" : "見る"}`}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
      {expanded && (
        <div id={detailId} className="dmg-detail">
          <div className="dmg-detail-block">
            <h4 className="dmg-detail-title">時間帯の傾向（今期の観測）</h4>
            <HourStrip counts={hourlyActivity(entry.actions, now)} />
          </div>
          <div className="dmg-detail-block">
            <h4 className="dmg-detail-title">直近の出兵時刻</h4>
            {recent.length > 0 ? (
              <ul className="dmg-chips">
                {recent.map((a) => (
                  <li key={a} className="dmg-chip">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted dmg-detail-empty">出兵の観測はありません。</p>
            )}
          </div>
          <div className="dmg-detail-block">
            <h4 className="dmg-detail-title">前回の攻撃先</h4>
            {lastTarget ? (
              <p className="dmg-detail-text">
                {lastTarget.at} {lastTarget.place ?? ""}{" "}
                {lastTarget.wall
                  ? `${lastTarget.defenderFaction ?? ""}の城壁`
                  : `${lastTarget.defenderFaction ?? ""} ${
                      lastTarget.defenderName ?? ""
                    }`}
              </p>
            ) : (
              <p className="muted dmg-detail-empty">記録がありません。</p>
            )}
          </div>
          {canOpenDetail && (
            <button
              type="button"
              className="btn dmg-detail-link"
              onClick={() => onSelectWarlord(w.name)}
            >
              {w.name} の詳細ページを開く
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** 国の複数選択（押すたびに選択／解除）。 */
function FactionChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="filter dmg-faction-filter">
      <legend>{label}</legend>
      {options.length === 0 ? (
        <span className="muted">国のデータがありません</span>
      ) : (
        <div className="dmg-faction-chips">
          {options.map((f) => {
            const on = selected.includes(f);
            return (
              <button
                key={f}
                type="button"
                className={"dmg-faction-chip" + (on ? " is-on" : "")}
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? selected.filter((x) => x !== f) : [...selected, f])
                }
              >
                {f}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function DamageTab({
  db,
  allDb,
  log,
  colors,
  onSelectWarlord,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);
  // 並び順・時間帯分けを固定する時刻。読んでいる途中で行が入れ替わらないようにする。
  const [orderNow, setOrderNow] = useState<Date | null>(null);
  const [prefs, setPrefs] = useState<DamagePrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [showFilter, setShowFilter] = useState(true);
  const [showUnknown, setShowUnknown] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const notifiedRef = useRef(new Set<string>());

  const { view, statusFilter, includeFactions, excludeFactions, roleFilter, notify } =
    prefs;
  const updatePrefs = useCallback(
    (patch: Partial<DamagePrefs>) => setPrefs((p) => ({ ...p, ...patch })),
    []
  );

  // 保存済みの表示設定を読み込む。未保存なら「自分の武将」の国を除外（自国）の初期値にする。
  useEffect(() => {
    const saved = readPrefs();
    if (saved) {
      setPrefs(saved);
    } else {
      const me = getMyWarlord();
      const myFaction = me ? lookup(allDb ?? db, me)?.faction?.trim() : undefined;
      if (myFaction) setPrefs((p) => ({ ...p, excludeFactions: [myFaction] }));
    }
    setPrefsLoaded(true);
    // 初回のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (prefsLoaded) writePrefs(prefs);
  }, [prefs, prefsLoaded]);

  const refreshOrder = useCallback(() => setOrderNow(new Date()), []);

  // 経過時間をリアルタイム表示するため 30 秒ごとに現在時刻を更新。
  // 通知が無効でタブが非表示の間は止め、再表示時に即時更新して並びも更新する。
  useEffect(() => {
    let id: number | undefined;
    const tick = () => setNow(new Date());
    const start = () => {
      if (id == null) id = window.setInterval(tick, 30000);
    };
    const stop = () => {
      if (id != null) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (!notify) stop();
      } else {
        tick();
        refreshOrder();
        start();
      }
    };
    tick();
    if (!document.hidden || notify) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [notify, refreshOrder]);

  // データや絞り込みが変わったら、その時点の並びに更新する。
  useEffect(() => {
    refreshOrder();
  }, [
    log,
    db,
    allDb,
    statusFilter,
    includeFactions,
    excludeFactions,
    roleFilter,
    nameQuery,
    view,
    refreshOrder,
  ]);

  const candidates = useMemo(
    () => buildDamageCandidates(db, allDb ?? db, log),
    [db, allDb, log]
  );
  const maps = useMemo(() => canonicalMaps(allDb ?? db), [allDb, db]);
  const lastTargets = useMemo(
    () => buildLastTargets(log, maps.canonicalNames, maps.canonicalHouseholds),
    [log, maps]
  );

  // 選択中の期のログから、武将ごとの「その期で最後に使った兵種」を求める。
  const latestUnits = useMemo(
    () => latestUnitByWarlord(log, allDb ?? db),
    [log, allDb, db]
  );

  const entries = useMemo<DamageEntry[]>(() => {
    if (!now || !orderNow) return [];
    const mine = new Set(excludeFactions);
    return candidates.map(
      ({ warlord, actionWarlord, availability, hasAttack, canOpenDetail }) => {
        // 名前が同じでも前の期の兵種を引きずらないよう、その期の最新兵種で上書きする。
        const latest = latestUnits.get(warlord.name);
        const w = latest
          ? {
              ...warlord,
              branch: latest.branch || warlord.branch,
              unit: latest.unit || warlord.unit,
            }
          : warlord;
        const info = getActionInfo(actionWarlord, now, availability);
        const orderInfo = getActionInfo(actionWarlord, orderNow, availability);
        const canonical = maps.canonicalNames[w.name] ?? w.name;
        const lastTarget = lastTargets.get(canonical);
        const actions = Array.from(
          new Set([
            ...(actionWarlord.actions ?? []),
            ...(availability?.latestAttackAt ? [availability.latestAttackAt] : []),
          ])
        ).sort();
        return {
          key: w.name,
          w,
          info,
          forecast: computeForecast(info, now),
          orderInfo,
          orderForecast: computeForecast(orderInfo, orderNow),
          hasAttack,
          canOpenDetail,
          actions,
          lastTarget,
          targetsMine:
            !!lastTarget?.defenderFaction && mine.has(lastTarget.defenderFaction),
        };
      }
    );
  }, [candidates, latestUnits, lastTargets, maps, now, orderNow, excludeFactions]);

  // ステータス以外の絞り込みを適用した行（集計タイルの母数）。
  const baseRows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const include = new Set(includeFactions);
    const exclude = new Set(excludeFactions);
    return entries
      .filter((r) => r.info.status !== "none")
      .filter((r) =>
        include.size > 0 ? include.has(r.w.faction?.trim() ?? "") : true
      )
      .filter((r) => !exclude.has(r.w.faction?.trim() ?? ""))
      .filter((r) => {
        if (roleFilter === "attack") return r.hasAttack;
        if (roleFilter === "defense-only") return !r.hasAttack;
        return true;
      })
      .filter((r) => (q ? r.w.name.toLowerCase().includes(q) : true));
  }, [entries, nameQuery, includeFactions, excludeFactions, roleFilter]);

  const rows = useMemo(
    () =>
      baseRows
        .filter((r) => (statusFilter ? r.info.status === statusFilter : true))
        .sort(compareEntries),
    [baseRows, statusFilter]
  );

  const counts = useMemo(() => {
    const c: Record<(typeof STATUS_SUMMARY_ORDER)[number], number> = {
      ready: 0,
      done: 0,
      depleted: 0,
      unknown: 0,
    };
    for (const r of baseRows) {
      if (r.info.status in c) c[r.info.status as keyof typeof c]++;
    }
    return c;
  }, [baseRows]);

  // 時間帯ビュー：今すぐ／10分ごとの枠／動向不明（折りたたみ）。
  const timeline = useMemo(() => {
    if (!orderNow) return { nowRows: [], slots: [], unknownRows: [] };
    const nowRows: DamageEntry[] = [];
    const unknownRows: DamageEntry[] = [];
    const slotMap = new Map<number, DamageEntry[]>();
    for (const r of rows) {
      if (isStaleUnknown(r)) {
        unknownRows.push(r);
        continue;
      }
      const at = r.orderForecast.expectedAt;
      if (!at || at.getTime() <= orderNow.getTime()) {
        nowRows.push(r);
        continue;
      }
      const key = floorToSlot(at).getTime();
      const list = slotMap.get(key) ?? [];
      list.push(r);
      slotMap.set(key, list);
    }
    const slots = Array.from(slotMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([start, list]) => ({ start: new Date(start), rows: list }));
    return { nowRows, slots, unknownRows };
  }, [rows, orderNow]);

  // 国の選択肢（行動時刻を持つ武将の勢力名）
  const factionOptions = useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .filter(
            ({ actionWarlord, availability }) =>
              actionWarlord.lastActionAt || availability?.latestAttackAt
          )
          .map(({ warlord }) => warlord.faction?.trim())
          .filter((v): v is string => !!v)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [candidates]);

  // データの新しさ：最新の観測時刻と最終取り込み時刻。
  const freshness = useMemo(() => {
    if (!now) return null;
    let latest: Date | null = null;
    for (const e of entries) {
      const at = e.forecast.baseAt;
      if (at && (!latest || at > latest)) latest = at;
    }
    const imported = latestImportedAt(log);
    return {
      latestObservedAt: latest,
      importedAt: imported != null ? new Date(imported) : null,
      stale:
        latest == null ||
        minutesBetween(latest, now) > OBSERVATION_STALE_MINUTES,
    };
  }, [entries, log, now]);

  // 固定行動の予測時刻が近づいたら通知する（表示中の絞り込み対象のみ・1予測につき1回）。
  useEffect(() => {
    if (!notify || !now || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    for (const r of rows) {
      const p = r.forecast.predictedAt;
      if (!p) continue;
      const until = minutesBetween(now, p);
      if (until < 0 || until > NOTIFY_LEAD_MINUTES) continue;
      const key = `${r.w.name}@${p.getTime()}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      try {
        new Notification(`${r.w.name} が ${formatClock(p)} ごろ出兵予測`, {
          body: [r.w.faction, r.w.unit, fixedBadgeText(r.info, r.forecast)]
            .filter(Boolean)
            .join("・"),
          tag: key,
        });
      } catch {
        // 通知を出せない環境では何もしない。
      }
    }
  }, [notify, now, rows]);

  const toggleNotify = async () => {
    setNotifyError(null);
    if (notify) {
      updatePrefs({ notify: false });
      return;
    }
    if (typeof Notification === "undefined") {
      setNotifyError("このブラウザは通知に対応していません。");
      return;
    }
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission === "granted") updatePrefs({ notify: true });
    else
      setNotifyError(
        "通知が許可されていません。ブラウザの設定でこのサイトの通知を許可してください。"
      );
  };

  const toggleExpanded = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 検索ボックスとは別にトグルするドロップダウン系の絞り込み。
  const hasDropdownFilter = !!(
    statusFilter ||
    includeFactions.length ||
    excludeFactions.length ||
    roleFilter
  );
  const hasFilter = !!(nameQuery || hasDropdownFilter);
  const clearFilters = () => {
    setNameQuery("");
    updatePrefs({
      statusFilter: "",
      includeFactions: [],
      excludeFactions: [],
      roleFilter: "",
    });
  };
  const activeFilters: ActiveFilter[] = [
    ...(statusFilter
      ? [
          {
            key: "status",
            label: "ステータス",
            value: ACTION_LABEL[statusFilter],
            onRemove: () => updatePrefs({ statusFilter: "" }),
          },
        ]
      : []),
    ...(includeFactions.length
      ? [
          {
            key: "include",
            label: "国",
            value: includeFactions.join("・"),
            onRemove: () => updatePrefs({ includeFactions: [] }),
          },
        ]
      : []),
    ...(excludeFactions.length
      ? [
          {
            key: "exclude",
            label: "除外",
            value: excludeFactions.join("・"),
            onRemove: () => updatePrefs({ excludeFactions: [] }),
          },
        ]
      : []),
    ...(roleFilter
      ? [
          {
            key: "role",
            label: "役割",
            value: roleFilter === "attack" ? "出兵あり" : "守備のみ",
            onRemove: () => updatePrefs({ roleFilter: "" }),
          },
        ]
      : []),
  ];

  const orderAge = now && orderNow ? minutesBetween(orderNow, now) : 0;
  const orderStale = orderAge >= ORDER_STALE_MINUTES;

  const renderRows = (list: DamageEntry[]) => (
    <ul className="dmg-list">
      {list.map((entry) => (
        <DamageRow
          key={entry.key}
          entry={entry}
          now={now!}
          colors={colors}
          expanded={expanded.has(entry.key)}
          onToggle={() => toggleExpanded(entry.key)}
          onSelectWarlord={onSelectWarlord}
        />
      ))}
    </ul>
  );

  return (
    <section className="panel">
      <PageHeader
        title="被弾表（行動状況）"
        description="観測した出兵・守備の時刻から、敵武将が次にいつ出兵してくるかを予測します。"
      />

      <div
        className={"dmg-freshness" + (freshness?.stale ? " is-stale" : "")}
        role="status"
      >
        {freshness?.stale && <span aria-hidden="true">⚠</span>}
        <span>
          最新の観測{" "}
          <strong>
            {freshness?.latestObservedAt
              ? `${formatClock(freshness.latestObservedAt)}（${relativeLabel(
                  freshness.latestObservedAt,
                  now!
                )}）`
              : "なし"}
          </strong>
        </span>
        <span className="muted">
          最終取り込み{" "}
          {freshness?.importedAt
            ? `${formatClock(freshness.importedAt)}（${relativeLabel(
                freshness.importedAt,
                now!
              )}）`
            : "—"}
        </span>
        {freshness?.stale && (
          <span className="dmg-freshness-warn">
            観測が{OBSERVATION_STALE_MINUTES}
            分以上途絶えています。戦闘ログを取り込むと予測が正確になります。
          </span>
        )}
      </div>

      <div className="stat-grid dmg-stats">
        {STATUS_SUMMARY_ORDER.map((s) => {
          const active = statusFilter === s;
          return (
            <button
              type="button"
              className={"stat dmg-stat" + (active ? " is-active" : "")}
              key={s}
              aria-pressed={active}
              onClick={() => updatePrefs({ statusFilter: active ? "" : s })}
            >
              <span className="label">
                <span className={STATUS_CLASS[s]}>{ACTION_LABEL[s]}</span>
              </span>
              <span className="value">{counts[s].toLocaleString("ja-JP")}</span>
              <span className="dmg-stat-hint muted">{STATUS_HINT[s]}</span>
            </button>
          );
        })}
      </div>

      <details className="badge-legend">
        <summary>見方</summary>
        <ul className="badge-legend-list">
          <li>
            <span className="status ready">{ACTION_LABEL.ready}</span>
            <span className="muted">
              出兵から40分以上1時間20分未満。クールタイムが明け、次の出兵がまだ観測されていません。
            </span>
          </li>
          <li>
            <span className="status done">{ACTION_LABEL.done}</span>
            <span className="muted">
              出兵から40分未満。左端の時刻（〜）から出兵できるようになります。
            </span>
          </li>
          <li>
            <span className="status depleted">{ACTION_LABEL.depleted}</span>
            <span className="muted">
              守備敗北から40分未満。40分経過後は出兵できるようになります。
            </span>
          </li>
          <li>
            <span className="status unknown">{ACTION_LABEL.unknown}</span>
            <span className="muted">
              出兵から1時間20分以上観測がありません。来うるものの、時刻は読めません。
            </span>
          </li>
          <li>
            <span className="status no-rest no-rest--loose">末尾固定</span>
            <span className="muted">
              行動時刻の「分」の1の位が2戦以上そろっている。次は約60分後（10分早まることあり）と予測します。
            </span>
          </li>
          <li>
            <span className="status no-rest no-rest--strict">休養なし</span>
            <span className="muted">
              直近2戦以上がちょうど60分間隔。次はちょうど60分後と予測します。
            </span>
          </li>
          <li>
            <span className="status no-rest no-rest--evolved">固定分</span>
            <span className="muted">
              末尾固定が5戦以上連続。固定行動の可能性が高い。
            </span>
          </li>
          <li>
            <span className="status dmg-mine">⚠ 自国を攻撃</span>
            <span className="muted">
              前回の出兵先が「除外する国（自国・同盟）」でした。
            </span>
          </li>
          <li>
            <span className="status defense-only">守備のみ</span>
            <span className="muted">
              守備でのみ観測されている武将です（「役割」を「すべて」にすると表示されます）。
            </span>
          </li>
        </ul>
      </details>

      <FilterPanel
        id="damage-filters"
        search={
          <SearchBox
            value={nameQuery}
            onChange={setNameQuery}
            placeholder="武将名で絞り込み"
          />
        }
        expanded={showFilter}
        onToggle={() => setShowFilter((visible) => !visible)}
        toggleActive={showFilter || hasDropdownFilter}
        hasActiveFilters={hasFilter}
        onClear={clearFilters}
        activeFilters={activeFilters}
        resultText={`表示 ${rows.length.toLocaleString("ja-JP")}件`}
      >
        <label className="filter">
          <span>ステータス</span>
          <select
            className="select"
            value={statusFilter}
            onChange={(e) =>
              updatePrefs({ statusFilter: e.target.value as "" | ActionStatus })
            }
          >
            <option value="">すべて</option>
            {STATUS_SUMMARY_ORDER.map((s) => (
              <option key={s} value={s}>
                {ACTION_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>役割</span>
          <select
            className="select"
            value={roleFilter}
            onChange={(e) =>
              updatePrefs({ roleFilter: e.target.value as RoleFilter })
            }
          >
            <option value="">すべて</option>
            <option value="attack">出兵あり</option>
            <option value="defense-only">守備のみ</option>
          </select>
        </label>
        <FactionChips
          label="表示する国（未選択ならすべて）"
          options={factionOptions}
          selected={includeFactions}
          onChange={(next) => updatePrefs({ includeFactions: next })}
        />
        <FactionChips
          label="除外する国（自国・同盟）"
          options={factionOptions}
          selected={excludeFactions}
          onChange={(next) => updatePrefs({ excludeFactions: next })}
        />
      </FilterPanel>

      <div className="dmg-toolbar">
        <div className="dmg-view" role="group" aria-label="表示方法">
          <button
            type="button"
            className={"dmg-view-btn" + (view === "timeline" ? " is-on" : "")}
            aria-pressed={view === "timeline"}
            onClick={() => updatePrefs({ view: "timeline" })}
          >
            時間帯
          </button>
          <button
            type="button"
            className={"dmg-view-btn" + (view === "list" ? " is-on" : "")}
            aria-pressed={view === "list"}
            onClick={() => updatePrefs({ view: "list" })}
          >
            一覧
          </button>
        </div>
        <button
          type="button"
          className={"btn dmg-reorder" + (orderStale ? " is-stale" : "")}
          onClick={refreshOrder}
        >
          並びを更新
          <span className="dmg-reorder-sub">
            {orderNow ? `${formatClock(orderNow)}時点` : ""}
          </span>
        </button>
        <button
          type="button"
          className={"btn dmg-notify" + (notify ? " is-on" : "")}
          aria-pressed={notify}
          onClick={toggleNotify}
          title={`固定行動の予測時刻の${NOTIFY_LEAD_MINUTES}分前に通知します`}
        >
          {notify ? "🔔 通知オン" : "🔕 予測の5分前に通知"}
        </button>
      </div>
      {notifyError && <p className="dmg-notify-error">{notifyError}</p>}

      {rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">表示できる行動データがありません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を貼り付けて登録すると、各武将の行動時刻から
            行動状況を判定してここに表示します。
            絞り込みを設定している場合はステータス・国・役割の条件を見直してください。
          </p>
        </div>
      ) : view === "list" ? (
        renderRows(rows)
      ) : (
        <div className="dmg-timeline">
          {timeline.nowRows.length > 0 && (
            <section className="dmg-slot is-now" aria-label="今すぐ出兵できる">
              <h3 className="dmg-slot-title">
                今すぐ出兵できる
                <span className="dmg-slot-count">{timeline.nowRows.length}人</span>
              </h3>
              {renderRows(timeline.nowRows)}
            </section>
          )}
          {timeline.slots.map((slot) => {
            const end = new Date(slot.start.getTime() + 10 * 60000);
            return (
              <section
                key={slot.start.getTime()}
                className="dmg-slot"
                aria-label={`${formatClock(slot.start)}から${formatClock(end)}`}
              >
                <h3 className="dmg-slot-title">
                  {formatClock(slot.start)}〜{formatClock(end)}
                  <span className="dmg-slot-count">{slot.rows.length}人</span>
                </h3>
                {renderRows(slot.rows)}
              </section>
            );
          })}
          {timeline.unknownRows.length > 0 && (
            <section className="dmg-slot is-unknown" aria-label="動向不明">
              <h3 className="dmg-slot-title">
                <button
                  type="button"
                  className="dmg-slot-toggle"
                  aria-expanded={showUnknown}
                  onClick={() => setShowUnknown((v) => !v)}
                >
                  {showUnknown ? "▴" : "▾"} 動向不明（1時間20分以上観測なし）
                  <span className="dmg-slot-count">
                    {timeline.unknownRows.length}人
                  </span>
                </button>
              </h3>
              {showUnknown && renderRows(timeline.unknownRows)}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
