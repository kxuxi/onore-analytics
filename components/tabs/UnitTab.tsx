"use client";

import { useEffect, useMemo, useState } from "react";
import type { BattleRecord, UnitType } from "@/lib/types";
import { fetchUnitTypes, bulkUpsertUnitTypes } from "@/lib/api";
import { unitNamesInLog } from "@/lib/stats";
import { UnitEditModal } from "@/components/tabs/UnitEditModal";
import {
  EMPTY_UNIT,
  parseReqStats,
  splitGoodAgainst,
  parseUnitTypesTsv,
  BASE_STAT_OPTIONS,
} from "@/lib/unitTypeForm";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { UnitCatalogResults } from "./UnitCatalogResults";
import {
  UNIT_CATALOG_COLUMNS,
  filterAndSortUnitCatalog,
  type UnitCatalogFilters,
  type UnitCatalogSortDirection,
  type UnitCatalogSortKey,
} from "./unitCatalog";

const FILTER_LABELS: Partial<Record<UnitCatalogSortKey, string>> = {
  category: "種類",
  goodAgainst: "得意兵種",
  attack: "攻撃",
  defense: "防御",
  cost: "雇用",
  reqStats: "必要能力値",
  bonus: "ボーナス",
};

export function UnitTab({
  onSelectUnit,
  isAdmin,
  log = [],
  termScoped = false,
}: {
  onSelectUnit: (name: string) => void;
  isAdmin: boolean;
  /** 選択中の期の戦闘履歴（期で絞り込むときに使う）。 */
  log?: BattleRecord[];
  /** 特定の期を選択中か（true のとき、その期の戦闘に登場した兵種のみ表示）。 */
  termScoped?: boolean;
}) {
  const [units, setUnits] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<UnitCatalogSortKey>("name");
  const [sortDir, setSortDir] =
    useState<UnitCatalogSortDirection>("asc");
  const [filters, setFilters] = useState<UnitCatalogFilters>({});
  const [showFilter, setShowFilter] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await fetchUnitTypes();
      setUnits(list);
      setError(null);
    } catch {
      setError("兵種の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // 選択中の期の戦闘に登場した兵種名（term-scoped 時のみ算出）。
  const appearedUnits = useMemo(
    () => (termScoped ? unitNamesInLog(log) : null),
    [termScoped, log]
  );
  // 期で絞る場合は、その期の戦闘に登場した兵種だけを対象にする。
  const baseUnits = useMemo(
    () =>
      appearedUnits
        ? units.filter((u) => appearedUnits.has(u.name.trim()))
        : units,
    [units, appearedUnits]
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(units.map((u) => u.category.trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "ja")),
    [units]
  );

  // 得意兵種フィルタ用: 全兵種から個別トークンを収集
  const goodAgainstOptions = useMemo(
    () =>
      Array.from(
        new Set(units.flatMap((u) => splitGoodAgainst(u.goodAgainst)))
      ).sort((a, b) => a.localeCompare(b, "ja")),
    [units]
  );

  // 必要能力値セレクタの候補（基本候補 + データ中に現れるもの）
  const statOptions = useMemo(() => {
    const found = units
      .map((u) => parseReqStats(u.reqStats).stat)
      .filter(Boolean);
    return Array.from(new Set([...BASE_STAT_OPTIONS, ...found]));
  }, [units]);

  const filtered = useMemo(
    () => filterAndSortUnitCatalog(baseUnits, filters, sortKey, sortDir),
    [baseUnits, filters, sortKey, sortDir]
  );

  const toggleSort = (key: UnitCatalogSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const setFilter = (key: UnitCatalogSortKey, value: string) => {
    setFilters((cur) => ({ ...cur, [key]: value }));
  };

  const hasFilter = Object.values(filters).some((v) => !!v && !!v.trim());
  // 検索ボックス（兵種名）とは別管理の項目フィルター。「フィルター」ボタンの強調用。
  const hasDropdownFilter = Object.entries(filters).some(
    ([k, v]) => k !== "name" && !!v && !!v.trim()
  );

  const clearFilters = () => setFilters({});

  const activeFilters: ActiveFilter[] = UNIT_CATALOG_COLUMNS.flatMap(
    (column) => {
      if (column.key === "name") return [];
      const value = filters[column.key]?.trim();
      if (!value) return [];
      return [
        {
          key: column.key,
          label: FILTER_LABELS[column.key] ?? column.label,
          value,
          onRemove: () => setFilter(column.key, ""),
        },
      ];
    }
  );

  const openNew = () => {
    setAdding(true);
  };

  // 貼り付けたテキストを即時パースしてプレビュー件数を出す（取り込みボタンの表示用）。
  const importPreview = useMemo(
    () => parseUnitTypesTsv(importText),
    [importText]
  );

  // 兵種一覧の表を貼り付けて一括 upsert（名前一致は上書き・新規は追加）。
  const handleImport = async () => {
    if (importing) return;
    const { units, parsed, skipped } = parseUnitTypesTsv(importText);
    if (parsed === 0) {
      setImportMsg({
        kind: "error",
        text: "取り込める兵種がありませんでした。兵種一覧の表をタブ区切りのまま貼り付けてください。",
      });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const { count } = await bulkUpsertUnitTypes(units);
      const parts = [`${count.toLocaleString("ja-JP")}件を反映`];
      if (skipped > 0) parts.push(`${skipped}行スキップ`);
      setImportMsg({
        kind: "ok",
        text: `取り込み完了：${parts.join(" / ")}`,
      });
      setImportText("");
      await reload();
    } catch (e) {
      setImportMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "取り込みに失敗しました",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="panel catalog-panel">
      <PageHeader title="兵種図鑑" />

      {isAdmin && (
        <>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={openNew}
            >
              兵種を追加
            </button>
            <button
              type="button"
              className={"btn import-toggle" + (showImport ? " active" : "")}
              onClick={() => setShowImport((v) => !v)}
              aria-expanded={showImport}
            >
              <span>一括インポート</span>
            </button>
          </div>

          {showImport && (
            <div className="import-block">
              <div className="import-body">
                <p className="import-hint">
                  兵種一覧の表をコピーして、そのまま貼り付けてください。名前が一致する兵種は上書き、無い兵種は新規追加します（一覧に無い既存の兵種は削除されません）。
                </p>
                <textarea
                  className="import-box"
                  value={importText}
                  aria-label="兵種一覧の表の貼り付け"
                  placeholder={
                    "兵種\t種類\t得意兵種\t攻撃\t防御\t雇用金\t技術\t年数\t必要能力値\t施設/国宝\t特殊攻撃\tボーナス\n（兵種一覧の表をタブ区切りのまま貼り付け）"
                  }
                  onChange={(e) => setImportText(e.target.value)}
                  spellCheck={false}
                />
                <div className="import-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImport}
                    disabled={importing || importPreview.parsed === 0}
                  >
                    {importing
                      ? "取り込み中…"
                      : importPreview.parsed > 0
                        ? `${importPreview.parsed.toLocaleString("ja-JP")}件を取り込む`
                        : "取り込む"}
                  </button>
                  {importMsg && (
                    <span
                      className={
                        "import-msg" +
                        (importMsg.kind === "error" ? " error" : " ok")
                      }
                    >
                      {importMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="muted" role="alert">
          {error}{" "}
          <button type="button" className="link-like" onClick={reload}>
            再試行
          </button>
        </p>
      )}

      <FilterPanel
        id="unit-catalog-filters"
        search={
          <SearchBox
            value={filters.name ?? ""}
            onChange={(v) => setFilter("name", v)}
            placeholder="兵種名で絞り込み"
          />
        }
        expanded={showFilter}
        onToggle={() => setShowFilter((v) => !v)}
        toggleActive={showFilter || hasDropdownFilter}
        hasActiveFilters={hasFilter}
        onClear={clearFilters}
        activeFilters={activeFilters}
        resultText={
          loading
            ? "兵種を読み込み中…"
            : hasFilter
            ? `全${baseUnits.length.toLocaleString("ja-JP")}件中 ${filtered.length.toLocaleString("ja-JP")}件`
            : `全${baseUnits.length.toLocaleString("ja-JP")}件`
        }
      >
        <label className="filter">
          <span>種類</span>
          <select
            className="select"
            value={filters.category ?? ""}
            onChange={(e) => setFilter("category", e.target.value)}
          >
            <option value="">すべて</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>得意兵種</span>
          <select
            className="select"
            value={filters.goodAgainst ?? ""}
            onChange={(e) => setFilter("goodAgainst", e.target.value)}
          >
            <option value="">すべて</option>
            {goodAgainstOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>攻撃</span>
          <input
            className="text-input"
            inputMode="numeric"
            value={filters.attack ?? ""}
            onChange={(e) => setFilter("attack", e.target.value)}
            placeholder="数値で絞り込み"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <label className="filter">
          <span>防御</span>
          <input
            className="text-input"
            inputMode="numeric"
            value={filters.defense ?? ""}
            onChange={(e) => setFilter("defense", e.target.value)}
            placeholder="数値で絞り込み"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <label className="filter">
          <span>雇用</span>
          <input
            className="text-input"
            value={filters.cost ?? ""}
            onChange={(e) => setFilter("cost", e.target.value)}
            placeholder="例: 金:600"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <label className="filter">
          <span>必要能力値</span>
          <input
            className="text-input"
            value={filters.reqStats ?? ""}
            onChange={(e) => setFilter("reqStats", e.target.value)}
            placeholder="例: 統率"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <label className="filter">
          <span>ボーナス</span>
          <input
            className="text-input"
            value={filters.bonus ?? ""}
            onChange={(e) => setFilter("bonus", e.target.value)}
            placeholder="ボーナスで絞り込み"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
      </FilterPanel>

      {loading ? (
        <div className="empty">
          <p className="empty-title">兵種を読み込み中…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <p className="empty-title">兵種がありません</p>
        </div>
      ) : (
        <UnitCatalogResults
          units={filtered}
          sortKey={sortKey}
          sortDirection={sortDir}
          onSort={toggleSort}
          onSelectUnit={onSelectUnit}
        />
      )}

      {adding && (
        <UnitEditModal
          initial={EMPTY_UNIT}
          isNew
          statOptions={statOptions}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </section>
  );
}
