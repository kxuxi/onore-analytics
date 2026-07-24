"use client";

import { useId, useMemo, useState } from "react";
import type { WarlordMap } from "@/lib/types";
import { lookup } from "@/lib/storage";
import { normalizeDisplayToken } from "@/lib/parser";
import { shortUnit } from "@/lib/unitShortNames";
import { copyText } from "@/lib/clipboard";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { displayWarlordType } from "@/lib/warlordType";
import { PageHeader } from "@/components/layout/PageHeader";

interface Props {
  db: WarlordMap;
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
}

export interface ScoutRow {
  name: string;
  faction?: string;
  type?: string;
  power?: number;
  intelligence?: number;
  leadership?: number;
  politics?: number;
  branch?: string;
  unit?: string;
  found: boolean;
}

/** 謎タイプなら現在のステータスから "謎(武>統)" のように付記した表示用タイプを返す。 */
function rowType(r: ScoutRow): string {
  if (!r.type) return "？";
  return displayWarlordType({
    type: r.type,
    power: r.power,
    intelligence: r.intelligence,
    leadership: r.leadership,
    politics: r.politics,
  });
}

function splitNames(text: string): string[] {
  // 改行 / 半角空白 / 全角空白 / タブ / 読点 / カンマで分割
  return text
    .split(/[\s\u3000、,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * タイプを報告用に短縮する。
 * 「政治家」→「政」、「知特/武特/統特」→末尾の「特」を除去。
 * 統武・知武などの 2 文字複合タイプや「謎」はそのまま。
 */
function shortType(type: string | undefined): string {
  if (!type) return "？";
  if (type === "政治家") return "政";
  if (type === "戦闘狂") return "狂";
  if (type.length === 2 && type.endsWith("特")) return type[0];
  return type;
}

/** 偵察結果コピーの列順・欠損表現を一か所に固定する。 */
export function buildScoutTsv(rows: ScoutRow[]): string {
  const header = [
    "国",
    "武将名",
    "タイプ",
    "兵種タイプ",
    "兵種名",
  ].join("\t");
  const body = rows
    .map((row) =>
      row.found
        ? [
            row.faction ?? "",
            row.name,
            row.type ?? "",
            row.branch ?? "",
            row.unit ?? "",
          ].join("\t")
        : ["-", row.name, "未登録", "-", "-"].join("\t")
    )
    .join("\n");
  return `${header}\n${body}`;
}

/** 150文字以内の報告文を既存の入力順・短縮規則で生成する。 */
export function buildScoutReport(
  rows: ScoutRow[],
  includeUnit: boolean
): { parts: string[]; text: string } {
  const separator = ", ";
  const limit = 150;
  const parts: string[] = [];
  let length = 0;

  for (const row of rows) {
    const displayName =
      row.name.length > 6 ? row.name.slice(0, 6) : row.name;
    const item = (() => {
      if (!row.found) return `${displayName}［？］`;
      if (!includeUnit) {
        return `${displayName}［${shortType(rowType(row))}］`;
      }
      const unit = row.unit
        ? shortUnit(normalizeDisplayToken(row.unit))
        : "？";
      return `${displayName}［${shortType(rowType(row))}｜${unit}］`;
    })();
    const needed = parts.length === 0 ? item.length : separator.length + item.length;
    if (length + needed > limit) break;
    parts.push(item);
    length += needed;
  }

  return { parts, text: parts.join(separator) };
}

export function ScoutTab({ db, colors, onSelectWarlord }: Props) {
  const [text, setText] = useState("");
  const [unregisteredOnly, setUnregisteredOnly] = useState(false);
  const [includeUnit, setIncludeUnit] = useState(true);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [reportCopied, setReportCopied] = useState<"idle" | "ok" | "fail">(
    "idle"
  );
  const inputId = useId();
  const inputHelpId = `${inputId}-help`;
  const inputSummaryId = `${inputId}-summary`;
  const reportId = `${inputId}-report`;
  const reportTitleId = `${inputId}-report-title`;

  const rows = useMemo<ScoutRow[]>(() => {
    const names = splitNames(text);
    // 重複は1回だけ
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const n of names) {
      if (!seen.has(n)) {
        seen.add(n);
        unique.push(n);
      }
    }
    return unique.map((name) => {
      const w = lookup(db, name);
      if (!w) return { name, found: false };
      return {
        name,
        faction: w.faction,
        type: w.type,
        power: w.power,
        intelligence: w.intelligence,
        leadership: w.leadership,
        politics: w.politics,
        branch: w.branch,
        unit: w.unit,
        found: true,
      };
    });
  }, [text, db]);

  // 「未登録のみ表示」を適用した表示用リスト。
  const visibleRows = unregisteredOnly ? rows.filter((r) => !r.found) : rows;

  // 登録済・未登録の件数サマリー。
  const foundCount = rows.filter((r) => r.found).length;
  const unregisteredCount = rows.length - foundCount;

  // 入力名のうち重複として除外した件数（同名は1回だけ集計する）。
  const duplicateCount = useMemo(() => {
    const names = splitNames(text);
    return names.length - new Set(names).size;
  }, [text]);

  const handleCopy = async () => {
    if (visibleRows.length === 0) return;
    const ok = await copyText(buildScoutTsv(visibleRows));
    setCopied(ok ? "ok" : "fail");
    window.setTimeout(() => setCopied("idle"), 1800);
  };

  // 国へ敵の守備の並びを報告するためのテキスト。
  // 兵種名を含める場合は「名前［タイプ｜兵種名］」、外す場合は「名前［タイプ］」を入力順に連結する。
  // 全角150文字（300 Byte）以内に収まる要素だけを含める。
  const { parts: reportParts, text: reportText } = useMemo(
    () => buildScoutReport(rows, includeUnit),
    [includeUnit, rows]
  );

  const handleCopyReport = async () => {
    if (!reportText) return;
    const ok = await copyText(reportText);
    setReportCopied(ok ? "ok" : "fail");
    window.setTimeout(() => setReportCopied("idle"), 1800);
  };

  return (
    <section className="panel">
      <PageHeader
        title="偵察検索"
        description="偵察結果の武将名をスペース・改行・カンマ区切りで貼り付けてください。DBに登録済みの武将はタイプ・兵種名・兵種タイプを表示し、「名前［タイプ｜兵種名］」形式の報告用テキストも生成します。"
      />
      <label className="scout-input-label" htmlFor={inputId}>
        偵察リスト
      </label>
      <span id={inputHelpId} className="sr-only">
        武将名をスペース、改行、読点、カンマのいずれかで区切って入力します
      </span>
      <textarea
        id={inputId}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCopied("idle");
          setReportCopied("idle");
        }}
        placeholder={`例:\n織田信長 武田勝頼 上杉謙信\n徳川家康`}
        aria-label="偵察リスト（武将名）の入力"
        aria-describedby={
          rows.length > 0
            ? `${inputHelpId} ${inputSummaryId}`
            : inputHelpId
        }
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />

      <div className="row scout-input-row">
        <button
          type="button"
          className="btn"
          onClick={() => setText("")}
          disabled={!text.trim()}
        >
          クリア
        </button>
        {rows.length > 0 && (
          <span
            id={inputSummaryId}
            className="scout-summary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            入力 <strong>{rows.length}</strong>件（登録済{" "}
            <strong>{foundCount}</strong> / 未登録{" "}
            <strong>{unregisteredCount}</strong>）
            {duplicateCount > 0 && (
              <span className="muted">
                {" "}
                ・重複 {duplicateCount}件を除外
              </span>
            )}
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="scout-report">
            <div className="scout-report-head">
              <label
                id={reportTitleId}
                className="scout-report-title"
                htmlFor={reportId}
              >
                報告用テキスト（{includeUnit ? "タイプ｜兵種名" : "タイプのみ"}）
                <span className="scout-report-count">
                  {reportParts.length < rows.length
                    ? `${reportParts.length}/${rows.length}件`
                    : `${rows.length}件`}
                  ・{reportText.length}/150文字
                </span>
              </label>
              <label className="scout-toggle">
                <input
                  type="checkbox"
                  checked={includeUnit}
                  onChange={(e) => {
                    setIncludeUnit(e.target.checked);
                    setReportCopied("idle");
                  }}
                />
                <span>兵種名を含める</span>
              </label>
              <button
                type="button"
                className="btn"
                onClick={handleCopyReport}
                disabled={!reportText}
                aria-label="報告用テキストをコピー"
              >
                {reportCopied === "ok"
                  ? "コピーしました"
                  : reportCopied === "fail"
                    ? "コピーできませんでした"
                    : "報告用をコピー"}
              </button>
              {reportCopied !== "idle" && (
                <span
                  className="sr-only"
                  role={reportCopied === "fail" ? "alert" : "status"}
                >
                  {reportCopied === "ok"
                    ? "報告用テキストをコピーしました"
                    : "報告用テキストをコピーできませんでした"}
                </span>
              )}
            </div>
            <textarea
              id={reportId}
              className="scout-report-text"
              readOnly
              value={reportText}
              rows={3}
              aria-labelledby={reportTitleId}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="scout-controls">
            <label className="scout-toggle">
              <input
                type="checkbox"
                checked={unregisteredOnly}
                onChange={(e) => setUnregisteredOnly(e.target.checked)}
              />
              <span>未登録のみ表示</span>
            </label>
            <button
              type="button"
              className="btn"
              onClick={handleCopy}
              disabled={visibleRows.length === 0}
              aria-label="偵察結果をTSVでコピー"
            >
              {copied === "ok"
                ? "コピーしました"
                : copied === "fail"
                  ? "コピーできませんでした"
                  : "結果をコピー"}
            </button>
            {copied !== "idle" && (
              <span
                className="sr-only"
                role={copied === "fail" ? "alert" : "status"}
              >
                {copied === "ok"
                  ? "偵察結果をTSVでコピーしました"
                  : "偵察結果をTSVでコピーできませんでした"}
              </span>
            )}
          </div>
          {visibleRows.length === 0 ? (
            <div className="empty">
              <p className="empty-title">未登録の武将はありません</p>
              <p className="empty-hint">
                「未登録のみ表示」を解除すると、登録済みの武将も含めて一覧表示します。
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table-card">
                <thead>
                  <tr>
                    <th>国</th>
                    <th>武将名</th>
                    <th>タイプ</th>
                    <th>兵種タイプ</th>
                    <th>兵種名</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.name}>
                      <td data-label="国">
                        {r.found && r.faction ? (
                          <span
                            className="tag faction"
                            style={factionBadgeStyle(r.faction, colors)}
                          >
                            {r.faction}
                          </span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className="cell-title">
                        <button
                          type="button"
                          className="link-like"
                          onClick={() => onSelectWarlord(r.name)}
                          title={`${r.name} の戦績を見る`}
                        >
                          {r.name}
                        </button>
                      </td>
                      <td data-label="タイプ">
                        {r.found ? (
                          <span className="tag type">{rowType(r)}</span>
                        ) : (
                          <span className="tag warn">データなし</span>
                        )}
                      </td>
                      <td data-label="兵種タイプ">
                        {r.found ? (
                          <span className="tag branch">{r.branch}</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td data-label="兵種名">
                        {r.found && r.unit ? (
                          <span className="tag unit">{r.unit}</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
