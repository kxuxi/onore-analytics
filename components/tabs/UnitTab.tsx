"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { BattleRecord, UnitType } from "@/lib/types";
import { fetchUnitTypes, bulkUpsertUnitTypes } from "@/lib/api";
import { unitNamesInLog } from "@/lib/stats";
import { UnitEditModal } from "@/components/tabs/UnitEditModal";
import {
  EMPTY_UNIT,
  parseReqStats,
  parseUnitTypesTsv,
  BASE_STAT_OPTIONS,
} from "@/lib/unitTypeForm";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ImportMessage,
  ImportPreview,
  type ImportMessageValue,
} from "@/components/ImportFeedback";
import { UnitCatalogResults } from "./UnitCatalogResults";
import { CatalogListHead, CatalogSelect, CatalogToolbar } from "./CatalogParts";
import {
  UNIT_CATALOG_SORT_OPTIONS,
  filterAndSortUnitCatalog,
  type UnitCatalogSortKey,
} from "./unitCatalog";

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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<ImportMessageValue | null>(null);
  const importId = useId();
  const importIds = {
    toggle: `${importId}-toggle`,
    body: `${importId}-body`,
    input: `${importId}-input`,
    hint: `${importId}-hint`,
    preview: `${importId}-preview`,
    result: `${importId}-result`,
  };

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

  // 必要能力値セレクタの候補（基本候補 + データ中に現れるもの）
  const statOptions = useMemo(() => {
    const found = units
      .map((u) => parseReqStats(u.reqStats).stat)
      .filter(Boolean);
    return Array.from(new Set([...BASE_STAT_OPTIONS, ...found]));
  }, [units]);

  const filtered = useMemo(
    () => filterAndSortUnitCatalog(baseUnits, { query, category }, sortKey),
    [baseUnits, query, category, sortKey]
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
      <PageHeader
        title="兵種図鑑"
        actions={
          isAdmin && (
            <>
              <button type="button" className="btn" onClick={openNew}>
                兵種を追加
              </button>
              <button
                type="button"
                className={"btn import-toggle" + (showImport ? " active" : "")}
                onClick={() => setShowImport((v) => !v)}
                aria-expanded={showImport}
                aria-controls={importIds.body}
                id={importIds.toggle}
              >
                <span>一括インポート</span>
              </button>
            </>
          )
        }
      />

      {isAdmin && (
        <>
          {showImport && (
            <div className="import-block">
              <fieldset
                id={importIds.body}
                className="import-body"
                aria-busy={importing}
              >
                <legend className="import-legend">兵種データの取り込み</legend>
                <p id={importIds.hint} className="import-hint">
                  兵種一覧の表をコピーして、そのまま貼り付けてください。名前が一致する兵種は上書き、無い兵種は新規追加します（一覧に無い既存の兵種は削除されません）。
                </p>
                <label className="import-label" htmlFor={importIds.input}>
                  兵種一覧の表の貼り付け
                </label>
                <textarea
                  id={importIds.input}
                  className="import-box"
                  value={importText}
                  aria-label="兵種一覧の表の貼り付け"
                  aria-describedby={[
                    importIds.hint,
                    importText.trim() ? importIds.preview : "",
                    importMsg ? importIds.result : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  placeholder={
                    "兵種\t種類\t得意兵種\t攻撃\t防御\t雇用金\t技術\t年数\t必要能力値\t施設/国宝\t特殊攻撃\tボーナス\n（兵種一覧の表をタブ区切りのまま貼り付け）"
                  }
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportMsg(null);
                  }}
                  spellCheck={false}
                />
                {importText.trim() && (
                  <ImportPreview
                    id={importIds.preview}
                    parsed={importPreview.parsed}
                    skipped={importPreview.skipped}
                  />
                )}
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
                  <ImportMessage
                    id={importIds.result}
                    message={importMsg}
                  />
                </div>
              </fieldset>
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

      <CatalogToolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="兵種名・得意・ボーナスで検索"
          ariaLabel="兵種名・得意・ボーナスで検索"
        />
        <CatalogSelect
          id="unit-catalog-category"
          label="種類"
          value={category}
          options={[
            { value: "", label: "すべて" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          onChange={setCategory}
        />
      </CatalogToolbar>

      {loading ? (
        <p className="muted catalog-none">兵種を読み込み中…</p>
      ) : baseUnits.length === 0 ? (
        <div className="empty">
          <p className="empty-title">兵種のデータがありません</p>
        </div>
      ) : (
        <>
          <CatalogListHead
            total={baseUnits.length}
            shown={filtered.length}
            sort={sortKey}
            options={UNIT_CATALOG_SORT_OPTIONS}
            onSort={setSortKey}
          />
          {filtered.length === 0 ? (
            <p className="muted catalog-none">該当する兵種がありません。</p>
          ) : (
            <UnitCatalogResults units={filtered} onSelectUnit={onSelectUnit} />
          )}
        </>
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
