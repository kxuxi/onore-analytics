"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import type { FactionColorMap } from "@/lib/factionColors";
import { lookup, normalizationMap } from "@/lib/storage";
import { getMyWarlord } from "@/lib/myWarlord";
import { displayWarlordType } from "@/lib/warlordType";
import {
  formatElapsed,
  getActionInfo,
  STATUS_ORDER,
  type ActionInfo,
} from "@/lib/action";
import {
  computeForecast,
  formatClock,
  type Forecast,
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

/** ブラウザに保存する被弾表の表示設定。 */
interface DamagePrefs {
  includeFactions: string[];
  excludeFactions: string[];
  notify: boolean;
}

const PREFS_KEY = "onore.damage.prefs.v2";
const DEFAULT_PREFS: DamagePrefs = {
  includeFactions: [],
  excludeFactions: [],
  notify: false,
};

function readPrefs(): DamagePrefs | null {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DamagePrefs>;
    return {
      includeFactions: Array.isArray(parsed.includeFactions)
        ? parsed.includeFactions
        : [],
      excludeFactions: Array.isArray(parsed.excludeFactions)
        ? parsed.excludeFactions
        : [],
      notify: parsed.notify === true,
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

/** "MM/DD HH:mm" の時刻部分。 */
const clockOf = (at: string | undefined) => at?.slice(-5) ?? null;

interface DamageEntry {
  key: string;
  w: Warlord;
  info: ActionInfo;
  forecast: Forecast;
  /** 並び替えに使う、並び固定時点の見込み。 */
  orderInfo: ActionInfo;
  orderForecast: Forecast;
  /** 前回の出兵時刻（"MM/DD HH:mm"）。守備敗北は含めない。 */
  lastAttackAt?: string;
}

/** 予測も無く観測が途切れている（攻めてくる時刻が読めない）。 */
const isUnreadable = (e: DamageEntry) =>
  e.orderInfo.status === "unknown" && e.orderForecast.predictedAt == null;

function compareEntries(a: DamageEntry, b: DamageEntry): number {
  const ta = a.orderForecast.expectedAt?.getTime() ?? Infinity;
  const tb = b.orderForecast.expectedAt?.getTime() ?? Infinity;
  if (ta !== tb) return ta - tb;
  const so =
    STATUS_ORDER[a.orderInfo.status] - STATUS_ORDER[b.orderInfo.status];
  if (so !== 0) return so;
  return a.w.name.localeCompare(b.w.name, "ja");
}

/**
 * 固定行動の表記。固定分（末尾固定が5戦以上）は「固定◯5」、末尾固定は「末尾◯5」、
 * 休養なし（ちょうど60分間隔）は「毎時:05」。
 */
function fixedText(info: ActionInfo, forecast: Forecast): string | null {
  if (!info.noRestLabel || forecast.fixedDigit == null) return null;
  if (info.noRestLabel === "休養なし") {
    const m = forecast.baseAt?.getMinutes();
    return m != null ? `毎時:${String(m).padStart(2, "0")}` : "休養なし";
  }
  const head = info.noRestLabel === "固定分" ? "固定" : "末尾";
  return `${head}◯${forecast.fixedDigit}`;
}

/** 攻めてくる時刻（予測／出兵可能になる時刻／今）。 */
function AttackTime({ entry, now }: { entry: DamageEntry; now: Date }) {
  const { info, forecast } = entry;
  if (forecast.predictedAt) {
    const spread = forecast.predictedSpread ?? 0;
    const from = new Date(forecast.predictedAt.getTime() - spread * 60000);
    return (
      <>
        <span className="dmg-time-main">
          {spread > 0
            ? `${formatClock(from)}〜${formatClock(forecast.predictedAt).slice(3)}`
            : formatClock(forecast.predictedAt)}
        </span>
        <span className="dmg-time-sub">
          {relativeLabel(spread > 0 ? from : forecast.predictedAt, now)}
        </span>
      </>
    );
  }
  if (forecast.readyAt && forecast.readyAt.getTime() > now.getTime()) {
    return (
      <>
        <span className="dmg-time-main">{formatClock(forecast.readyAt)}〜</span>
        <span className="dmg-time-sub">{relativeLabel(forecast.readyAt, now)}</span>
      </>
    );
  }
  if (info.status === "unknown") {
    return <span className="dmg-time-main is-muted">不明</span>;
  }
  return <span className="dmg-time-main is-now">今</span>;
}

function DamageTable({
  entries,
  now,
  onSelectWarlord,
}: {
  entries: DamageEntry[];
  now: Date;
  onSelectWarlord: (name: string) => void;
}) {
  return (
    <table className="dmg-table">
      <thead>
        <tr>
          <th scope="col">来る時刻</th>
          <th scope="col">武将</th>
          <th scope="col">タイプ</th>
          <th scope="col">前回</th>
          <th scope="col">固定</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const fixed = fixedText(e.info, e.forecast);
          return (
            <tr key={e.key}>
              <td className="dmg-time">
                <AttackTime entry={e} now={now} />
              </td>
              <td className="dmg-name-cell">
                <button
                  type="button"
                  className="link-like dmg-name"
                  onClick={() => onSelectWarlord(e.w.name)}
                >
                  {e.w.name}
                </button>
              </td>
              <td className="dmg-type">{displayWarlordType(e.w) || "—"}</td>
              <td className="dmg-last">{clockOf(e.lastAttackAt) ?? "—"}</td>
              <td
                className={
                  "dmg-fixed" +
                  (e.info.noRestLabel === "固定分" ? " is-strong" : "")
                }
              >
                {fixed ?? ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

export function DamageTab({ db, allDb, log, onSelectWarlord }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  // 並び順を固定する時刻。読んでいる途中で行が入れ替わらないようにする。
  const [orderNow, setOrderNow] = useState<Date | null>(null);
  const [prefs, setPrefs] = useState<DamagePrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [showUnknown, setShowUnknown] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const notifiedRef = useRef(new Set<string>());

  const { includeFactions, excludeFactions, notify } = prefs;
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

  // 30 秒ごとに現在時刻を更新。通知が無効でタブが非表示の間は止め、
  // 再表示時に即時更新して並びも更新する。
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
  }, [log, db, allDb, includeFactions, excludeFactions, nameQuery, refreshOrder]);

  const candidates = useMemo(
    () => buildDamageCandidates(db, allDb ?? db, log),
    [db, allDb, log]
  );

  const entries = useMemo<DamageEntry[]>(() => {
    if (!now || !orderNow) return [];
    return candidates
      .filter((c) => c.hasAttack)
      .map(({ warlord, actionWarlord, availability }) => {
        const info = getActionInfo(actionWarlord, now, availability);
        const orderInfo = getActionInfo(actionWarlord, orderNow, availability);
        const attacks = [
          ...(actionWarlord.actions ?? []),
          ...(availability?.latestAttackAt ? [availability.latestAttackAt] : []),
        ].sort();
        return {
          key: warlord.name,
          w: warlord,
          info,
          forecast: computeForecast(info, now),
          orderInfo,
          orderForecast: computeForecast(orderInfo, orderNow),
          lastAttackAt: attacks[attacks.length - 1],
        };
      });
  }, [candidates, now, orderNow]);

  const rows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const include = new Set(includeFactions);
    const exclude = new Set(excludeFactions);
    return entries
      .filter((r) => r.info.status !== "none")
      .filter((r) =>
        include.size > 0 ? include.has(r.w.faction?.trim() ?? "") : true
      )
      .filter((r) => !exclude.has(r.w.faction?.trim() ?? ""))
      .filter((r) => (q ? r.w.name.toLowerCase().includes(q) : true))
      .sort(compareEntries);
  }, [entries, nameQuery, includeFactions, excludeFactions]);

  const readable = rows.filter((r) => !isUnreadable(r));
  const unreadable = rows.filter(isUnreadable);

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
          body: [displayWarlordType(r.w), fixedText(r.info, r.forecast)]
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

  const hasDropdownFilter = !!(includeFactions.length || excludeFactions.length);
  const hasFilter = !!(nameQuery || hasDropdownFilter);
  const clearFilters = () => {
    setNameQuery("");
    updatePrefs({ includeFactions: [], excludeFactions: [] });
  };
  const activeFilters: ActiveFilter[] = [
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
  ];

  return (
    <section className="panel">
      <PageHeader
        title="被弾表"
        description="敵武将が次に攻めてくる時刻の順に並べます。"
      />

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
        resultText={`${rows.length.toLocaleString("ja-JP")}人`}
      >
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
        <button type="button" className="btn dmg-reorder" onClick={refreshOrder}>
          並びを更新
          {orderNow && (
            <span className="dmg-reorder-sub">{formatClock(orderNow)}時点</span>
          )}
        </button>
        <button
          type="button"
          className={"btn dmg-notify" + (notify ? " is-on" : "")}
          aria-pressed={notify}
          onClick={toggleNotify}
          title={`固定行動の予測時刻の${NOTIFY_LEAD_MINUTES}分前に通知します`}
        >
          {notify ? "通知オン" : "通知"}
        </button>
      </div>
      {notifyError && <p className="dmg-notify-error">{notifyError}</p>}

      {!now ? null : rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">表示できる行動データがありません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を登録すると、各武将の出兵時刻からここに表示します。
          </p>
        </div>
      ) : (
        <>
          {readable.length > 0 && (
            <DamageTable
              entries={readable}
              now={now}
              onSelectWarlord={onSelectWarlord}
            />
          )}
          {unreadable.length > 0 && (
            <div className="dmg-unknown">
              <button
                type="button"
                className="dmg-unknown-toggle"
                aria-expanded={showUnknown}
                onClick={() => setShowUnknown((v) => !v)}
              >
                {showUnknown ? "▴" : "▾"} 時刻が読めない（1時間20分以上観測なし）{" "}
                {unreadable.length}人
              </button>
              {showUnknown && (
                <DamageTable
                  entries={unreadable}
                  now={now}
                  onSelectWarlord={onSelectWarlord}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
