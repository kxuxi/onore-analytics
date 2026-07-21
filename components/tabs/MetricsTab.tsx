"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BattleRecord, UnitType, WarlordMap } from "@/lib/types";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { fetchUnitTypes } from "@/lib/api";
import { antiContactRanking, type AntiContactStat } from "@/lib/stats";

interface Props {
  log: BattleRecord[];
  db?: WarlordMap;
  onSelectWarlord: (name: string) => void;
}

/** 並べ替えの指標。 */
type SortKey = "antiRate" | "antiContacts";

/** ノイズ除去用の最低接触数の選択肢。 */
const MIN_CONTACT_OPTIONS = [1, 5, 10, 20, 30];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "antiRate", label: "Anti-Contact率" },
  { key: "antiContacts", label: "Anti-Contact数" },
];

/** アンチ接触率（0..1）を表示用の整数パーセントにする。 */
function formatRate(rate: number, contacts: number): string {
  if (contacts <= 0) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * 指標タブ。武将ごとの Anti-Contact 数・率を表示する。
 *
 * アンチ＝兵科のじゃんけん。自分の兵種の得意兵科（兵種一覧のデータ）に相手の兵科が
 * 含まれる戦闘を「アンチ接触（有利に接触）」として数える。ダブルアンチにも対応。
 */
export function MetricsTab({ log, db, onSelectWarlord }: Props) {
  const [unitTypes, setUnitTypes] = useState<UnitType[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("antiRate");
  const [minContacts, setMinContacts] = useState(10);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const loadUnitTypes = useCallback(() => {
    setLoadError(false);
    let alive = true;
    fetchUnitTypes()
      .then((list) => {
        if (alive) setUnitTypes(list);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => loadUnitTypes(), [loadUnitTypes]);

  const ranking = useMemo(
    () => (unitTypes ? antiContactRanking(log, unitTypes, db) : []),
    [log, db, unitTypes]
  );

  // 兵科の選択肢（集計対象から収集）。
  const branchOptions = useMemo(
    () =>
      Array.from(
        new Set(
          ranking
            .map((r) => r.branch?.trim())
            .filter((v): v is string => !!v)
        )
      ).sort((a, b) => a.localeCompare(b, "ja")),
    [ranking]
  );

  // 絞り込み・並べ替えを適用した表示用リスト。
  const view = useMemo(() => {
    const q = query.trim();
    const filtered = ranking.filter(
      (r) =>
        r.contacts >= minContacts &&
        (branch ? r.branch === branch : true) &&
        (q ? r.name.includes(q) : true)
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "antiRate") {
        if (b.antiRate !== a.antiRate) return b.antiRate - a.antiRate;
        return b.antiContacts - a.antiContacts;
      }
      if (b.antiContacts !== a.antiContacts) return b.antiContacts - a.antiContacts;
      return b.antiRate - a.antiRate;
    });
  }, [ranking, query, branch, minContacts, sortKey]);

  const valueOf = (r: AntiContactStat) =>
    sortKey === "antiRate" ? r.antiRate : r.antiContacts;

  // バー幅の基準となる最大値（表示対象の最大）。
  const maxValue = view.reduce((m, r) => Math.max(m, valueOf(r)), 0) || 1;

  const formatValue = (r: AntiContactStat) =>
    sortKey === "antiRate"
      ? formatRate(r.antiRate, r.contacts)
      : r.antiContacts.toLocaleString("ja-JP");

  // 検索ボックスとは別にトグルするドロップダウン系の絞り込み。
  const hasDropdownFilter =
    !!branch || sortKey !== "antiRate" || minContacts !== 10;
  const hasFilter = !!(query || branch);
  const clearFilters = () => {
    setQuery("");
    setBranch("");
  };

  return (
    <section className="panel">
      <h2>指標</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        アンチは兵科のじゃんけんです（歩兵＞騎兵＞弓兵＞歩兵、万能は相互に強いなど）。
        自分の兵種の得意兵科に相手の兵科が含まれる戦闘を「Anti-Contact（有利に接触）」として数えます。
      </p>

      <details className="swi-formula">
        <summary>Anti-Contact の詳細</summary>
        <p className="muted">
          Anti-Contact数 = 自分の兵種の得意兵科（兵種一覧のデータ）に相手の兵科が含まれた戦闘数。
          Anti-Contact率 = Anti-Contact数 ÷ 接触数（攻撃・守備を合わせた総戦闘数）。
          得意兵科を2つ持つ兵種（ダブルアンチ）は、どちらかに一致すれば成立します。
          自分の兵種が兵種一覧に無い・相手の兵科が不明な戦闘は非アンチとして接触数にのみ数えます。
        </p>
      </details>

      <div className="search-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="武将名で検索"
        />
        <button
          type="button"
          className={
            "btn filter-toggle" +
            (showFilter || hasDropdownFilter ? " active" : "")
          }
          onClick={() => setShowFilter((v) => !v)}
          aria-expanded={showFilter}
        >
          <FilterIcon />
          <span>フィルター</span>
        </button>
        {hasFilter && (
          <button
            type="button"
            className="btn clear-filters"
            onClick={clearFilters}
            title="絞り込み条件をすべて解除"
          >
            <CloseIcon />
            <span>解除</span>
          </button>
        )}
      </div>

      {showFilter && (
        <div className="filter-grid">
          <label className="filter">
            <span>指標</span>
            <select
              className="select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>最低接触数</span>
            <select
              className="select"
              value={minContacts}
              onChange={(e) => setMinContacts(Number(e.target.value))}
            >
              {MIN_CONTACT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}回以上
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>兵科</span>
            <select
              className="select"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option value="">すべて</option>
              {branchOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        該当 {view.length.toLocaleString("ja-JP")}件
      </p>

      {loadError ? (
        <div className="empty" role="alert">
          <p className="empty-title">兵種一覧の取得に失敗しました</p>
          <p className="empty-hint">
            アンチ判定には兵種一覧のデータが必要です。通信状況を確認して再試行してください。
          </p>
          <button type="button" className="btn" onClick={loadUnitTypes}>
            再試行
          </button>
        </div>
      ) : unitTypes === null ? (
        <div className="empty">
          <p className="empty-title">読み込み中…</p>
        </div>
      ) : view.length === 0 ? (
        <div className="empty">
          <p className="empty-title">条件を満たす武将がいません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を登録すると、兵科の相性から Anti-Contact を算出します。
            すでに登録済みの場合は、指標・検索語・兵科・最低接触数の条件を見直してください。
          </p>
        </div>
      ) : (
        <ol className="swi-list">
          {view.map((r, i) => {
            const value = valueOf(r);
            return (
              <li key={r.name} className="swi-row">
                <span className="swi-rank">{i + 1}</span>
                <div className="swi-main">
                  <div className="swi-head">
                    <button
                      type="button"
                      className="swi-name link-like"
                      onClick={() => onSelectWarlord(r.name)}
                      title={`${r.name} の戦績を見る`}
                    >
                      {r.name}
                    </button>
                    <span className="swi-value">{formatValue(r)}</span>
                  </div>
                  <span
                    className="swi-bar"
                    role="progressbar"
                    aria-valuenow={Math.round((value / maxValue) * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${r.name} の Anti-Contact ${formatValue(r)}`}
                  >
                    <span
                      className="swi-bar-fill"
                      style={{ width: `${(value / maxValue) * 100}%` }}
                    />
                  </span>
                  <div className="swi-meta muted">
                    <span className="rank-side-active">
                      アンチ {r.antiContacts.toLocaleString("ja-JP")} ／ 接触{" "}
                      {r.contacts.toLocaleString("ja-JP")}（率{" "}
                      {formatRate(r.antiRate, r.contacts)}）
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
