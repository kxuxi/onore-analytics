"use client";

import { useEffect, useMemo, useState } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { normalizationMap } from "@/lib/storage";
import { displayWarlordType } from "@/lib/warlordType";
import {
  ACTION_LABEL,
  formatElapsed,
  getActionInfo,
  STATUS_ORDER,
  type ActionStatus,
} from "@/lib/action";
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
  const canonicalNames = normalizationMap(allDb);
  const scopedCanonicalNames = normalizationMap(db);
  const canonicalHouseholds: Record<string, string> = {};
  for (const warlord of Object.values(allDb)) {
    if (!warlord.household) continue;
    canonicalHouseholds[warlord.household] =
      canonicalNames[warlord.name] ?? warlord.name;
  }
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

const STATUS_CLASS: Record<ActionStatus, string> = {
  done: "status done",
  ready: "status ready",
  unknown: "status unknown",
  depleted: "status depleted",
  none: "status none",
};

// 集計・フィルタに表示するステータス（none を除く）。ラベルは ACTION_LABEL から導出。
const STATUS_SUMMARY_ORDER = [
  "ready",
  "unknown",
  "done",
  "depleted",
] as const;

export function DamageTab({
  db,
  allDb,
  log,
  colors,
  onSelectWarlord,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | ActionStatus>("");
  const [factionFilter, setFactionFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "attack" | "defense-only">("");
  const [nameQuery, setNameQuery] = useState("");
  const [showFilter, setShowFilter] = useState(true);

  // 経過時間をリアルタイム表示するため 30 秒ごとに現在時刻を更新。
  // タブが非表示の間はインターバルを止め、再表示時に即時更新して再開する。
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
        stop();
      } else {
        tick();
        start();
      }
    };
    tick();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const candidates = useMemo(
    () => buildDamageCandidates(db, allDb ?? db, log),
    [db, allDb, log]
  );

  const rows = useMemo(() => {
    if (!now) return [];
    const q = nameQuery.trim().toLowerCase();

    const merged: {
      w: Warlord;
      info: ReturnType<typeof getActionInfo>;
      hasAttack: boolean;
      canOpenDetail: boolean;
    }[] = candidates.map(
      ({
        warlord,
        actionWarlord,
        availability,
        hasAttack,
        canOpenDetail,
      }) => ({
        w: warlord,
        info: getActionInfo(actionWarlord, now, availability),
        hasAttack,
        canOpenDetail,
      })
    );

    return merged
      .filter((r) => r.info.status !== "none")
      .filter((r) => (statusFilter ? r.info.status === statusFilter : true))
      .filter((r) => (factionFilter ? r.w.faction === factionFilter : true))
      .filter((r) => {
        if (roleFilter === "attack") return r.hasAttack;
        if (roleFilter === "defense-only") return !r.hasAttack;
        return true;
      })
      .filter((r) => (q ? r.w.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // 行動可 → 不明 → 行動済みの順。
        // 同ステータス内は経過時間の昇順（短い＝さっき行動可になった人が上）。
        const so = STATUS_ORDER[a.info.status] - STATUS_ORDER[b.info.status];
        if (so !== 0) return so;
        return (a.info.minutes ?? 0) - (b.info.minutes ?? 0);
      });
  }, [
    candidates,
    now,
    statusFilter,
    factionFilter,
    roleFilter,
    nameQuery,
  ]);

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

  const counts = useMemo(() => {
    const c = {
      done: 0,
      ready: 0,
      unknown: 0,
      depleted: 0,
      defenseOnly: 0,
    };
    for (const { info, hasAttack } of rows) {
      if (info.status === "done") c.done++;
      else if (info.status === "ready") c.ready++;
      else if (info.status === "unknown") c.unknown++;
      else if (info.status === "depleted") c.depleted++;
      if (!hasAttack) c.defenseOnly++;
    }
    return c;
  }, [rows]);

  // 検索ボックスとは別にトグルするドロップダウン系の絞り込み。
  const hasDropdownFilter = !!(statusFilter || factionFilter || roleFilter);
  const hasFilter = !!(nameQuery || statusFilter || factionFilter || roleFilter);
  const clearFilters = () => {
    setNameQuery("");
    setStatusFilter("");
    setFactionFilter("");
    setRoleFilter("");
  };
  const activeFilters: ActiveFilter[] = [
    ...(statusFilter
      ? [
          {
            key: "status",
            label: "ステータス",
            value: ACTION_LABEL[statusFilter],
            onRemove: () => setStatusFilter(""),
          },
        ]
      : []),
    ...(factionFilter
      ? [
          {
            key: "faction",
            label: "国",
            value: factionFilter,
            onRemove: () => setFactionFilter(""),
          },
        ]
      : []),
    ...(roleFilter
      ? [
          {
            key: "role",
            label: "役割",
            value: roleFilter === "attack" ? "出兵あり" : "守備のみ",
            onRemove: () => setRoleFilter(""),
          },
        ]
      : []),
  ];

  return (
    <section className="panel">
      <PageHeader
        title="被弾表（行動状況）"
        description={
          <>
            出兵・守備の観測時刻と勝敗から行動状況を判定します。
            出兵後は40分未満={ACTION_LABEL.done} / 40分以上1時間20分未満=
            {ACTION_LABEL.ready} / 1時間20分以上={ACTION_LABEL.unknown}。
            守備敗北後は40分未満={ACTION_LABEL.depleted} / 40分以上=
            {ACTION_LABEL.unknown}です。
          </>
        }
      />
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        最終更新{" "}
        {now ? now.toLocaleTimeString("ja-JP", { hour12: false }) : "--:--:--"}
        （30秒ごとに自動更新）
      </p>

      <div className="stat-grid">
        {STATUS_SUMMARY_ORDER.map((s) => (
          <div className="stat" key={s}>
            <div className="label">{ACTION_LABEL[s]}</div>
            <div className="value">{counts[s].toLocaleString("ja-JP")}</div>
          </div>
        ))}
        <div className="stat">
          <div className="label">守備のみ</div>
          <div className="value">{counts.defenseOnly.toLocaleString("ja-JP")}</div>
        </div>
      </div>

      <details className="badge-legend">
        <summary>バッジの見方</summary>
        <ul className="badge-legend-list">
          <li>
            <span className="status depleted">{ACTION_LABEL.depleted}</span>
            <span className="muted">
              直近の守備敗北から40分未満です。40分経過後は行動可になります。
            </span>
          </li>
          <li>
            <span className="status defense-only">守備のみ</span>
            <span className="muted">
              守備でのみ観測されている武将です（出兵履歴がないため固定バッジは付きません）。
            </span>
          </li>
          <li>
            <span className="status no-rest no-rest--loose">末尾固定</span>
            <span className="muted">
              行動時刻の「分」の1の位が2戦以上そろっている（休養を挟まず連続行動の疑い）。
            </span>
          </li>
          <li>
            <span className="status no-rest no-rest--strict">休養なし</span>
            <span className="muted">
              直近2戦以上がちょうど60分間隔で並んでいる。
            </span>
          </li>
          <li>
            <span className="status no-rest no-rest--evolved">固定分</span>
            <span className="muted">
              末尾固定が5戦以上連続。固定行動の可能性が高い。
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
                setStatusFilter(e.target.value as "" | ActionStatus)
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
            <span>国</span>
            <select
              className="select"
              value={factionFilter}
              onChange={(e) => setFactionFilter(e.target.value)}
            >
              <option value="">すべて</option>
              {factionOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
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
                setRoleFilter(e.target.value as "" | "attack" | "defense-only")
              }
            >
              <option value="">すべて</option>
              <option value="attack">出兵あり</option>
              <option value="defense-only">守備のみ</option>
            </select>
          </label>
      </FilterPanel>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <p className="empty-title">表示できる行動データがありません</p>
            <p className="empty-hint">
              「戦闘履歴」タブで戦績を貼り付けて登録すると、各武将の行動時刻から
              行動状況を判定してここに表示します。
              絞り込みを設定している場合はステータス・国・役割の条件を見直してください。
            </p>
          </div>
        ) : (
          <table className="table-card">
            <caption className="sr-only">
              武将ごとの行動状況、所属国、タイプ、兵種、判定時刻の一覧
            </caption>
            <thead>
              <tr>
                <th>状況</th>
                <th>国</th>
                <th>武将名</th>
                <th>タイプ</th>
                <th>兵種タイプ</th>
                <th>兵種名</th>
                <th>判定時刻</th>
                <th>経過</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, info, hasAttack, canOpenDetail }) => (
                <tr key={w.name}>
                  <td className="cell-block" data-label="状況">
                    <span className="status-stack">
                      <span className={STATUS_CLASS[info.status]}>
                        {ACTION_LABEL[info.status]}
                      </span>
                      {!hasAttack && (
                        <span
                          className="status defense-only"
                          title="守備でのみ観測されています"
                        >
                          守備のみ
                        </span>
                      )}
                      {info.noRestLabel && (
                        <span
                          className={
                            info.noRestLabel === "固定分"
                              ? "status no-rest no-rest--evolved"
                              : info.noRestLabel === "休養なし"
                                ? "status no-rest no-rest--strict"
                                : "status no-rest no-rest--loose"
                          }
                          title={`末尾固定 ${info.noRestStreak}戦連続 / 休養なし ${info.strictStreak}戦連続`}
                        >
                          {info.noRestLabel}
                        </span>
                      )}
                    </span>
                  </td>
                  <td data-label="国">
                    {w.faction ? (
                      <span
                        className="tag faction"
                        style={factionBadgeStyle(w.faction, colors)}
                      >
                        {w.faction}
                      </span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td className="cell-title">
                    {canOpenDetail ? (
                      <button
                        type="button"
                        className="link-like"
                        onClick={() => onSelectWarlord(w.name)}
                        title={`${w.name} の戦績を見る`}
                      >
                        {w.name}
                      </button>
                    ) : (
                      <span>{w.name}</span>
                    )}
                  </td>
                  <td data-label="タイプ">
                    <span className="tag type">{displayWarlordType(w)}</span>
                  </td>
                  <td data-label="兵種タイプ">
                    <span className="tag branch">{w.branch}</span>
                  </td>
                  <td data-label="兵種名">
                    {w.unit ? (
                      <span className="tag unit">{w.unit}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td
                    className="muted"
                    data-label="判定時刻"
                    style={{ fontSize: 12 }}
                    title={
                      info.status === "depleted"
                        ? "兵力減の原因となった守備敗北時刻"
                        : "行動状況の判定に使用した時刻"
                    }
                  >
                    {info.actionAt ?? "-"}
                  </td>
                  <td className="muted" data-label="経過" style={{ fontSize: 12 }}>
                    {formatElapsed(info.minutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
