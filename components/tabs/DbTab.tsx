"use client";

import { useMemo, useState } from "react";
import type { WarlordMap } from "@/lib/types";
import { copyText } from "@/lib/clipboard";
import { parseWarlordStats } from "@/lib/warlordStats";
import { displayWarlordType } from "@/lib/warlordType";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { FilterIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";

interface Props {
  db: WarlordMap;
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onSelectFaction: (name: string) => void;
  /** ランキングから解析した能力値を取り込む。更新/新規件数を返す。 */
  onImportStats: (
    stats: ReturnType<typeof parseWarlordStats>["stats"],
    skipped: number
  ) => Promise<{ updated: number; created: number }>;
}

/** 並び替えできる列キー（updatedAt は既定の更新日時順）。 */
type SortKey =
  | "faction"
  | "name"
  | "type"
  | "branch"
  | "unit"
  | "lastActionAt"
  | "updatedAt";

/** ローカル登録時刻（ミリ秒）を「YY/MM/DD HH:mm」形式に整形する。 */
function formatUpdatedAt(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("ja-JP", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DbTab({ db, colors, onSelectWarlord, onSelectFaction, onImportStats }: Props) {
  const [keyword, setKeyword] = useState("");
  const [faction, setFaction] = useState("");
  const [type, setType] = useState("");
  const [branch, setBranch] = useState("");
  const [unit, setUnit] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const all = useMemo(() => {
    // 同じ household を持つ武将をグループ化して、最新の武将だけを表示する。
    const byHousehold = new Map<string, typeof db[string]>();
    const noHousehold: typeof db[string][] = [];
    for (const w of Object.values(db)) {
      if (!w.household) {
        noHousehold.push(w);
      } else {
        const existing = byHousehold.get(w.household);
        if (!existing || w.updatedAt > existing.updatedAt) {
          byHousehold.set(w.household, w);
        }
      }
    }
    return [...byHousehold.values(), ...noHousehold];
  }, [db]);

  // 各項目の選択肢（出現する値を昇順で）
  const options = useMemo(() => {
    const collect = (pick: (w: (typeof all)[number]) => string | undefined) =>
      Array.from(
        new Set(
          all
            .map((w) => pick(w)?.trim())
            .filter((v): v is string => !!v)
        )
      ).sort((a, b) => a.localeCompare(b, "ja"));
    return {
      faction: collect((w) => w.faction),
      type: collect((w) => w.type),
      branch: collect((w) => w.branch),
      unit: collect((w) => w.unit),
    };
  }, [all]);

  const filtered = useMemo(() => {
    // 武将名検索は大文字小文字を区別しない（他タブと挙動を揃える）。
    const k = keyword.trim().toLowerCase();
    const list = all.filter((w) => {
      if (k && !w.name.toLowerCase().includes(k)) return false;
      if (faction && w.faction !== faction) return false;
      if (type && w.type !== type) return false;
      if (branch && w.branch !== branch) return false;
      if (unit && w.unit !== unit) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const strOf = (w: (typeof all)[number]): string => {
      switch (sortKey) {
        case "faction":
          return w.faction ?? "";
        case "name":
          return w.name;
        case "type":
          return w.type;
        case "branch":
          return w.branch;
        case "unit":
          return w.unit ?? "";
        case "lastActionAt":
          return w.lastActionAt ?? "";
        default:
          return "";
      }
    };
    return [...list].sort((a, b) => {
      if (sortKey === "updatedAt") return (a.updatedAt - b.updatedAt) * dir;
      const av = strOf(a);
      const bv = strOf(b);
      // 空値は並び順に関わらず常に末尾へ。
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      if (!av && !bv) return a.name.localeCompare(b.name, "ja");
      const c = av.localeCompare(bv, "ja");
      return c !== 0 ? c * dir : a.name.localeCompare(b.name, "ja");
    });
  }, [all, keyword, faction, type, branch, unit, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 既定は文字列=昇順、更新日時=降順。
      setSortDir(key === "updatedAt" ? "desc" : "asc");
    }
  };

  const hasFilter = !!(keyword || faction || type || branch || unit);
  // 検索ボックスとは別に管理するドロップダウン系の絞り込み（フィルターボタンの強調用）。
  const hasDropdownFilter = !!(faction || type || branch || unit);

  const clearFilters = () => {
    setKeyword("");
    setFaction("");
    setType("");
    setBranch("");
    setUnit("");
  };

  // ランキング表を貼り付けて能力値を取り込む。
  const handleImport = async () => {
    if (importing) return;
    const { stats, parsed, skipped } = parseWarlordStats(importText);
    if (parsed === 0) {
      setImportMsg({
        kind: "error",
        text:
          "取り込める行がありませんでした。ランキング表をタブ区切りのままコピーして貼り付けてください。",
      });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const { updated, created } = await onImportStats(stats, skipped);
      const parts = [`${updated}件更新`, `${created}件新規`];
      if (skipped > 0) parts.push(`${skipped}行スキップ`);
      setImportMsg({ kind: "ok", text: `取り込み完了：${parts.join(" / ")}` });
      setImportText("");
    } catch (e) {
      setImportMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "取り込みに失敗しました",
      });
    } finally {
      setImporting(false);
    }
  };

  // 絞り込み中の一覧をタブ区切り（TSV）でクリップボードへコピーする。
  const handleCopyTsv = async () => {
    if (filtered.length === 0) return;
    const header = ["国", "武将名", "タイプ", "兵科", "兵種", "行動時間", "更新日時"].join(
      "\t"
    );
    const lines = filtered.map((w) =>
      [
        w.faction ?? "",
        w.name,
        w.type,
        w.branch,
        w.unit ?? "",
        w.lastActionAt ?? "",
        formatUpdatedAt(w.updatedAt),
      ].join("\t")
    );
    const ok = await copyText([header, ...lines].join("\n"));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <section className="panel">
      <h2>DB確認</h2>

      <div className="import-block">
        <button
          type="button"
          className={"btn import-toggle" + (showImport ? " active" : "")}
          onClick={() => setShowImport((v) => !v)}
          aria-expanded={showImport}
        >
          <span>ステータス取り込み</span>
        </button>
        {showImport && (
          <div className="import-body">
            <p className="import-hint">
              武将ランキング表をコピーして、そのまま貼り付けてください。武力・知力・統率力・政治力・計略・自己PR を各武将ページへ反映します。
            </p>
            <textarea
              className="import-box"
              value={importText}
              aria-label="武将ランキング表の貼り付け"
              placeholder={
                "順位\t名前\t武力\t知力\t統率力\t政治力\t計略\t資金\t兵糧\t年齢\t勝率\t仕官月数\t自己PR\t階級\t国名\n（ランキング表をタブ区切りのまま貼り付け）"
              }
              onChange={(e) => setImportText(e.target.value)}
              spellCheck={false}
            />
            <div className="import-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || !importText.trim()}
              >
                {importing ? "取り込み中…" : "取り込む"}
              </button>
              {importMsg && (
                <span
                  className={
                    "import-msg" + (importMsg.kind === "error" ? " error" : " ok")
                  }
                >
                  {importMsg.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">登録武将数</div>
          <div className="value">{all.length.toLocaleString("ja-JP")}</div>
        </div>
        <div className="stat">
          <div className="label">絞り込み結果</div>
          <div className="value">{filtered.length.toLocaleString("ja-JP")}</div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        絞り込み結果 {filtered.length.toLocaleString("ja-JP")}件
      </p>

      <div className="search-row">
        <SearchBox
          value={keyword}
          onChange={setKeyword}
          placeholder="武将名で絞り込み"
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
          <span>国</span>
          <select
            className="select"
            value={faction}
            onChange={(e) => setFaction(e.target.value)}
          >
            <option value="">すべて</option>
            {options.faction.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>タイプ</span>
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">すべて</option>
            {options.type.map((v) => (
              <option key={v} value={v}>
                {v}
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
            {options.branch.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>兵種</span>
          <select
            className="select"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">すべて</option>
            {options.unit.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        </div>
      )}

      <div className="db-sort-mobile">
        <label className="filter">
          <span>並び替え</span>
          <select
            className="select"
            value={sortKey}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSortKey(key);
              setSortDir(key === "updatedAt" ? "desc" : "asc");
            }}
          >
            <option value="updatedAt">更新日時</option>
            <option value="faction">国</option>
            <option value="name">武将名</option>
            <option value="type">タイプ</option>
            <option value="branch">兵科</option>
            <option value="unit">兵種</option>
            <option value="lastActionAt">行動時間</option>
          </select>
        </label>
        <button
          type="button"
          className="btn db-sort-dir"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          aria-label={
            sortDir === "asc" ? "昇順（押すと降順）" : "降順（押すと昇順）"
          }
        >
          {sortDir === "asc" ? "昇順 ▲" : "降順 ▼"}
        </button>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={handleCopyTsv}
          disabled={filtered.length === 0}
        >
          {copied ? "コピーしました" : "結果をコピー(TSV)"}
        </button>
      </div>

      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="empty">
            {all.length === 0
              ? "まだ登録された武将はありません。"
              : "条件に一致する武将がいません。"}
          </div>
        ) : (
          <table className="table-card">
            <thead>
              <tr>
                <SortableTh label="国" field="faction" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="武将名" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="タイプ" field="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="兵科" field="branch" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="兵種" field="unit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="行動時間" field="lastActionAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="更新日時" field="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.name}>
                  <td data-label="国">
                    {w.faction ? (
                      <button
                        type="button"
                        className="tag faction faction-link"
                        style={factionBadgeStyle(w.faction, colors)}
                        onClick={() => onSelectFaction(w.faction!)}
                        title={`${w.faction} の成績を見る`}
                      >
                        {w.faction}
                      </button>
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
                  <td data-label="兵科">
                    <span className="tag branch">{w.branch}</span>
                  </td>
                  <td data-label="兵種">
                    {w.unit ? (
                      <span className="tag unit">{w.unit}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td className="muted" data-label="行動時間" style={{ fontSize: 12 }}>
                    {w.lastActionAt ?? "-"}
                  </td>
                  <td className="muted" data-label="更新日時" style={{ fontSize: 12 }}>
                    {formatUpdatedAt(w.updatedAt)}
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

/** 並び替え可能な見出しセル。クリックで昇順／降順をトグルする。 */
function SortableTh({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === field;
  return (
    <th
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button type="button" className="th-sort" onClick={() => onSort(field)}>
        <span>{label}</span>
        <span className="th-sort-ind" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
