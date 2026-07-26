"use client";

import { useEffect, useMemo, useState } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { normalizationMap, householdAliases } from "@/lib/storage";
import { displayWarlordType } from "@/lib/warlordType";
import {
  ACTION_LABEL,
  formatElapsed,
  getActionInfo,
  STATUS_ORDER,
  type ActionStatus,
} from "@/lib/action";
import { buildActionAvailability } from "@/lib/actionObservation";

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
  db: WarlordMap;
  log: BattleRecord[];
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
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

export function DamageTab({ db, log, colors, onSelectWarlord }: Props) {
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

  const canonicalNames = useMemo(() => normalizationMap(db), [db]);
  // 戦闘ログの解析はログ変更時だけ行い、30秒ごとの時刻更新では再計算しない。
  const availabilityByWarlord = useMemo(
    () => buildActionAvailability(log, canonicalNames),
    [log, canonicalNames]
  );

  const rows = useMemo(() => {
    if (!now) return [];
    const q = nameQuery.trim().toLowerCase();

    // 家督名が同じ武将（＝改名前後の同一人物）は1人として統合する。
    // 代表名（正規化マップ上の最新名）のみを1行とし、行動時刻は
    // 旧名側も含めて合算した最新値を使う。
    // （旧名の行が別枠で残り続け、そちらは更新されないまま経過時間だけ
    // 増え続けて見える＝「最新の時間が取れない」不具合の修正）
    const seen = new Set<string>();
    const merged: { w: Warlord; info: ReturnType<typeof getActionInfo> }[] = [];
    for (const w of Object.values(db)) {
      const canonical = canonicalNames[w.name] ?? w.name;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const base = db[canonical];
      if (!base) continue;
      const actions = mergeAliasActions(
        householdAliases(db, canonical).map((n) => db[n])
      );
      const info = getActionInfo(
        { ...base, actions, lastActionAt: actions[actions.length - 1] },
        now,
        availabilityByWarlord.get(canonical)
      );
      merged.push({ w: base, info });
    }

    return merged
      .filter((r) => r.info.status !== "none")
      .filter((r) => (statusFilter ? r.info.status === statusFilter : true))
      .filter((r) => (factionFilter ? r.w.faction === factionFilter : true))
      .filter((r) => {
        if (roleFilter === "attack") return (r.w.actions?.length ?? 0) > 0;
        if (roleFilter === "defense-only") return (r.w.actions?.length ?? 0) === 0;
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
    db,
    now,
    statusFilter,
    factionFilter,
    roleFilter,
    nameQuery,
    canonicalNames,
    availabilityByWarlord,
  ]);

  // 国の選択肢（行動時刻を持つ武将の勢力名）
  const factionOptions = useMemo(() => {
    return Array.from(
      new Set(
        Object.values(db)
          .filter((w) => w.lastActionAt)
          .map((w) => w.faction?.trim())
          .filter((v): v is string => !!v)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [db]);

  const counts = useMemo(() => {
    const c = {
      done: 0,
      ready: 0,
      unknown: 0,
      depleted: 0,
      defenseOnly: 0,
    };
    for (const { info, w } of rows) {
      if (info.status === "done") c.done++;
      else if (info.status === "ready") c.ready++;
      else if (info.status === "unknown") c.unknown++;
      else if (info.status === "depleted") c.depleted++;
      if ((w.actions?.length ?? 0) === 0) c.defenseOnly++;
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
            40分以内={ACTION_LABEL.done} / 40分〜1時間20分=
            {ACTION_LABEL.ready} / 1時間20分以上={ACTION_LABEL.unknown}。
            守備敗北後は、次の出兵が確認できるまで{ACTION_LABEL.depleted}です。
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
              直近の出兵以降に守備で敗北しています。行動可の対象には含めません。
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
              {rows.map(({ w, info }) => (
                <tr key={w.name}>
                  <td className="cell-block" data-label="状況">
                    <span className="status-stack">
                      <span className={STATUS_CLASS[info.status]}>
                        {ACTION_LABEL[info.status]}
                      </span>
                      {(w.actions?.length ?? 0) === 0 && (
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
                    <button
                      type="button"
                      className="link-like"
                      onClick={() => onSelectWarlord(w.name)}
                      title={`${w.name} の戦績を見る`}
                    >
                      {w.name}
                    </button>
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
