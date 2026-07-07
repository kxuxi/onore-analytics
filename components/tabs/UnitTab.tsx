"use client";

import { useEffect, useMemo, useState } from "react";
import type { UnitType } from "@/lib/types";
import { fetchUnitTypes, bulkUpsertUnitTypes } from "@/lib/api";
import { UnitEditModal } from "@/components/tabs/UnitEditModal";
import {
  EMPTY_UNIT,
  parseReqStats,
  splitGoodAgainst,
  parseUnitTypesTsv,
  BASE_STAT_OPTIONS,
} from "@/lib/unitTypeForm";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";

type SortKey =
  | "name"
  | "category"
  | "goodAgainst"
  | "attack"
  | "defense"
  | "cost"
  | "reqStats"
  | "bonus";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric?: boolean;
  filter: "text" | "select" | "tokens";
}[] = [
  { key: "name", label: "兵種", filter: "text" },
  { key: "category", label: "種類", filter: "select" },
  { key: "goodAgainst", label: "得意", filter: "tokens" },
  { key: "attack", label: "攻", numeric: true, filter: "text" },
  { key: "defense", label: "防", numeric: true, filter: "text" },
  { key: "cost", label: "雇用", filter: "text" },
  { key: "reqStats", label: "必要", filter: "text" },
  { key: "bonus", label: "ボーナス", filter: "text" },
];

export function UnitTab({
  onSelectUnit,
  isAdmin,
}: {
  onSelectUnit: (name: string) => void;
  isAdmin: boolean;
}) {
  const [units, setUnits] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Partial<Record<SortKey, string>>>({});
  const [showFilter, setShowFilter] = useState(false);
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

  const filtered = useMemo(() => {
    const result = units.filter((u) =>
      COLUMNS.every((col) => {
        const f = filters[col.key]?.trim();
        if (!f) return true;
        if (col.filter === "tokens") {
          return splitGoodAgainst(String(u[col.key] ?? "")).includes(f);
        }
        const cell = String(u[col.key] ?? "");
        if (col.filter === "select") return cell === f;
        return cell.toLowerCase().includes(f.toLowerCase());
      })
    );
    const col = COLUMNS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...result].sort((a, b) => {
      if (col?.numeric) {
        return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
      }
      return (
        String(a[sortKey] ?? "").localeCompare(
          String(b[sortKey] ?? ""),
          "ja"
        ) * dir
      );
    });
  }, [units, filters, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const setFilter = (key: SortKey, value: string) => {
    setFilters((cur) => ({ ...cur, [key]: value }));
  };

  const hasFilter = Object.values(filters).some((v) => !!v && !!v.trim());
  // 検索ボックス（兵種名）とは別管理の項目フィルター。「フィルター」ボタンの強調用。
  const hasDropdownFilter = Object.entries(filters).some(
    ([k, v]) => k !== "name" && !!v && !!v.trim()
  );

  const clearFilters = () => setFilters({});

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
    <section className="panel">
      <div className="history-head">
        <h2>兵種図鑑</h2>
        {!loading && (
          <span className="count-badge">
            {hasFilter
              ? `全${units.length.toLocaleString("ja-JP")}件中 ${filtered.length.toLocaleString("ja-JP")}件`
              : `全${units.length.toLocaleString("ja-JP")}件`}
          </span>
        )}
      </div>

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

      <p className="sr-only" role="status" aria-live="polite">
        {filtered.length.toLocaleString("ja-JP")}件の兵種を表示
      </p>

      <div className="search-row">
        <SearchBox
          value={filters.name ?? ""}
          onChange={(v) => setFilter("name", v)}
          placeholder="兵種名で絞り込み"
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
        </div>
      )}

      <div className="table-wrap">
        <table className="unit-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th key={col.key}>
                    <button
                      type="button"
                      className={`th-sort${active ? " active" : ""}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      <span className="sort-ind">
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="muted"
                  style={{ padding: 16, textAlign: "center" }}
                >
                  読み込み中…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="muted"
                  style={{ padding: 16, textAlign: "center" }}
                >
                  兵種がありません
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr
                  key={u.name}
                  onClick={() => onSelectUnit(u.name)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <button
                      type="button"
                      className="link-like"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectUnit(u.name);
                      }}
                      title={`${u.name} の詳細を見る`}
                    >
                      {u.name}
                    </button>
                  </td>
                  <td>
                    {u.category ? (
                      <span className="tag branch">{u.category}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {splitGoodAgainst(u.goodAgainst).length > 0 ? (
                      <span className="tag-list">
                        {splitGoodAgainst(u.goodAgainst).map((g) => (
                          <span key={g} className="tag unit">
                            {g}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{u.attack}</td>
                  <td>{u.defense}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {u.cost || "-"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {u.reqStats || "-"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {u.bonus || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
