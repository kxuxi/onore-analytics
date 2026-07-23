"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import type { BattleRecord } from "@/lib/types";
import { parseActionDate } from "@/lib/action";
import {
  parseBattleCard,
  isSpecialToken,
  normalizeDisplayToken,
  extractBattleUrl,
  battleKey,
  parseBattleEntriesChecked,
  type BattleCard,
  type BattleSide,
} from "@/lib/parser";
import {
  resolveFactionColor,
  factionNameStyle,
  DEFAULT_WIN_LEFT,
  DEFAULT_WIN_RIGHT,
  type FactionColorMap,
} from "@/lib/factionColors";
import { htmlToMarkdown, copyText } from "@/lib/clipboard";
import {
  FilterIcon,
  TrophyIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLinkIcon,
  SortIcon,
  CloseIcon,
  CopyIcon,
  CheckIcon,
  TrashIcon,
} from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { BATTLE_LOG_PAGE_SIZE as PAGE_SIZE } from "@/lib/stats";
import { useAntiIndex } from "@/lib/useAntiIndex";
import { AntiArrows } from "@/components/AntiArrows";
import {
  buildBattleSearchText,
  formatGameMonthOrder,
  parseGameMonthOrder,
} from "@/lib/historyFilters";

interface Props {
  canRegister: boolean;
  canDelete?: boolean;
  onRegister: (text: string) => Promise<{
    added: number;
    updated: number;
    parsed: number;
    skipped: number;
    rejected: number;
  }>;
  log: BattleRecord[];
  factionColors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onDelete: (id: number) => Promise<void>;
  /** 表示中（絞り込み結果）の戦闘履歴をまとめて削除する。 */
  onBulkDelete: (ids: number[]) => Promise<void>;
}

/** 片側の装備・兵種タグを組み立てる（兵種 → 兵種 → 装備）。
 * `unit: true` のタグ（兵種名）は兵種ページへ遷移できる。 */
function sideTags(
  side: BattleSide
): { text: string; highlight: boolean; unit: boolean }[] {
  const tags: { text: string; highlight: boolean; unit: boolean }[] = [];
  if (side.unit) {
    // 兵種は表示名（オリジナル兵は括弧内の素の兵種名）に正規化されるため、
    // `*`始まり（オリジナル兵）かどうかで色を変えると、同じ「ライフル銃兵」でも
    // 色が割れてしまう。兵種タグは常に同じスタイルで表示する。
    tags.push({
      text: normalizeDisplayToken(side.unit),
      highlight: false,
      unit: true,
    });
  }
  if (side.branch)
    tags.push({ text: side.branch, highlight: false, unit: false });
  for (const e of side.equips) {
    tags.push({
      text: normalizeDisplayToken(e),
      highlight: isSpecialToken(e),
      unit: false,
    });
  }
  return tags;
}

const PLACEHOLDER = `戦闘履歴をここに貼り付けてください。（スマホからのコピー＆ペーストにも対応しています）`;

export function HistoryTab({
  canRegister,
  canDelete = false,
  onRegister,
  log,
  factionColors,
  onSelectWarlord,
  onSelectUnit,
  onDelete,
  onBulkDelete,
}: Props) {
  const [text, setText] = useState("");
  const [keyword, setKeyword] = useState("");
  // 兵種アンチの得意兵種索引（兵種名の横の矢印表示に使う）。
  const antiIndex = useAntiIndex();
  const [factionFilter, setFactionFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  // ゲーム内年月の範囲（order = year*12+month）。null は未指定。
  const [fromYm, setFromYm] = useState<number | null>(null);
  const [toYm, setToYm] = useState<number | null>(null);
  // 実際の日付の範囲（"YYYY-MM-DD"）。空文字は未指定。
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilter, setShowFilter] = useState(true);
  const [page, setPage] = useState(1);
  // 入力中の体感を軽く保つため、フィルタ計算は遅延値で行う（大量履歴対策）。
  const deferredKeyword = useDeferredValue(keyword);
  // ページ送り時に一覧の先頭へスクロールするための参照。
  const listTopRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<
    | null
    | {
        kind: "success";
        added: number;
        updated: number;
        parsed: number;
        skipped: number;
        rejected: number;
      }
    | { kind: "warn"; message: string }
    | { kind: "error"; message: string }
  >(null);
  const [busy, setBusy] = useState(false);
  // 表示中の一括削除の実行中フラグ（ボタンの二重押下防止）。
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // 入力中の体感を保つため、プレビュー集計は遅延値で行う。
  const deferredText = useDeferredValue(text);
  // 登録前に「何件取り込めるか」を事前集計して表示する（貼り付けの取りこぼし検知用）。
  const preview = useMemo(() => {
    if (!deferredText.trim()) return null;
    const { entries, rejected } = parseBattleEntriesChecked(deferredText);
    let warlords = 0;
    for (const e of entries) warlords += e.warlords.length;
    return { battles: entries.length, warlords, rejected: rejected.length };
  }, [deferredText]);

  const handleRegister = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await onRegister(text);
      if (r.parsed === 0) {
        setResult({
          kind: "warn",
          message:
            r.rejected > 0
              ? `項目の過不足が見つかりました。該当の戦闘は登録していません（${r.rejected}件）。出兵側・守備側はそれぞれ8項目（勢力名・武将名・家名・タイプ・兵種名・兵種タイプ・武将の持つ品物・武将の持つ武器）かをご確認ください。`
              : "解析できる行が見つかりませんでした。タブ区切り・半角スペース区切りのどちらでも登録できます。",
        });
        return;
      }
      setResult({ kind: "success", ...r });
      // 連続登録しやすいよう、成功時は入力欄をクリアする（重複は自動スキップされる）。
      setText("");
    } catch {
      // 保存失敗時は入力を残し（再貼り付け不要）、成功扱いにしない。
      setResult({
        kind: "error",
        message:
          "登録に失敗しました。通信状態を確認してもう一度お試しください。入力内容は保持しています。",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setText("");
    setResult(null);
  };

  // ブラウザからコピーした内容を貼り付けたとき、クリップボードの HTML を
  // Markdown に変換してから挿入する。これにより `<a href>` が `[テキスト](URL)`
  // となり、プレーンテキストでは失われる戦闘ログの URL を保持できる。
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    // HTML が無い（プレーンテキスト）場合は通常の貼り付けに任せる。
    if (!html.trim()) return;

    const md = htmlToMarkdown(html);
    if (!md) return;

    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + md + text.slice(end);
    setText(next);

    // 再レンダリング後にカーソル位置を挿入末尾へ復元する。
    const caret = start + md.length;
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* 選択範囲の復元失敗は無視 */
      }
    });
  };

  // 各履歴をカード表示用に解析（取得・並びロジックは従来通り）。
  // 内容が同一の行（正規化後に一致）は重複表示しないよう除外する。
  const cards = useMemo(() => {
    const seen = new Set<string>();
    const out: {
      record: BattleRecord;
      card: BattleCard | null;
      search: string;
    }[] = [];
    for (const record of log) {
      const key = battleKey(record.line);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const card = parseBattleCard(record.line);
      out.push({ record, card, search: buildBattleSearchText(record, card) });
    }
    return out;
  }, [log]);

  // フィルター用の国一覧（カードの左右いずれかに登場する勢力）
  const factionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const { card } of cards) {
      if (card?.left.faction) set.add(card.left.faction);
      if (card?.right.faction) set.add(card.right.faction);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [cards]);

  // フィルター用のゲーム内年月一覧（新しい順）。
  const yearMonthOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const { record } of cards) {
      const order = parseGameMonthOrder(record.time);
      if (order != null && !map.has(order)) {
        map.set(order, formatGameMonthOrder(order));
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([order, label]) => ({ order, label }));
  }, [cards]);

  // 戦闘時刻順で表示（新しい順 / 古い順）。キーワード・国・期間で絞り込み。
  const visibleLog = useMemo(() => {
    const k = deferredKeyword.trim().toLowerCase();
    const now = new Date();
    // ゲーム内年月の範囲（未指定側は開放）。
    const ymLo =
      fromYm != null && toYm != null ? Math.min(fromYm, toYm) : fromYm ?? toYm;
    const ymHi =
      fromYm != null && toYm != null ? Math.max(fromYm, toYm) : fromYm ?? toYm;
    // 実日付の範囲（その日の 00:00〜23:59 を含む）。
    const dateLo = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const dateHi = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    const list = cards.filter((item) => {
      if (k && !item.search.includes(k)) return false;
      const { card, record } = item;
      if (factionFilter) {
        const f =
          card?.left.faction === factionFilter ||
          card?.right.faction === factionFilter;
        if (!f) return false;
      }
      // ゲーム内年月で絞り込み。
      if (ymLo != null || ymHi != null) {
        const order = parseGameMonthOrder(record.time);
        if (order == null) return false;
        if (ymLo != null && order < ymLo) return false;
        if (ymHi != null && order > ymHi) return false;
      }
      // 実日付で絞り込み。
      if (dateLo != null || dateHi != null) {
        const d = parseActionDate(record.time, now)?.getTime() ?? null;
        if (d == null) return false;
        if (dateLo != null && d < dateLo) return false;
        if (dateHi != null && d > dateHi) return false;
      }
      return true;
    });
    const timeOf = (r: BattleRecord) =>
      parseActionDate(r.time, now)?.getTime() ?? null;
    // newest=1（降順）/ oldest=-1（昇順）。時刻が無い行は常に末尾。
    const dir = sortOrder === "newest" ? 1 : -1;
    return [...list].sort((a, b) => {
      const ta = timeOf(a.record);
      const tb = timeOf(b.record);
      if (ta != null && tb != null) {
        if (tb !== ta) return (tb - ta) * dir;
        return (b.record.savedAt - a.record.savedAt) * dir;
      }
      if (ta != null) return -1;
      if (tb != null) return 1;
      return (b.record.savedAt - a.record.savedAt) * dir;
    });
  }, [
    cards,
    deferredKeyword,
    factionFilter,
    sortOrder,
    fromYm,
    toYm,
    fromDate,
    toDate,
  ]);

  const hasActiveFilter =
    keyword.trim() !== "" ||
    factionFilter !== "" ||
    fromYm != null ||
    toYm != null ||
    fromDate !== "" ||
    toDate !== "";

  const clearFilters = () => {
    setKeyword("");
    setFactionFilter("");
    setFromYm(null);
    setToYm(null);
    setFromDate("");
    setToDate("");
  };

  const totalPages = Math.max(1, Math.ceil(visibleLog.length / PAGE_SIZE));

  // 絞り込み・件数変化でページ範囲を補正
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  // キーワード・国・並び順・期間の変更時は1ページ目へ
  useEffect(() => {
    setPage(1);
  }, [deferredKeyword, factionFilter, sortOrder, fromYm, toYm, fromDate, toDate]);

  // ページ送り時に一覧の先頭へスクロールする。
  const scrollToListTop = () => {
    listTopRef.current?.scrollIntoView({ block: "start" });
  };

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleLog.slice(start, start + PAGE_SIZE);
  }, [visibleLog, page]);

  // 表示中の件数範囲（例: 1–20 件目）。
  const rangeStart = visibleLog.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, visibleLog.length);

  // 現在表示中のページ（最大 20 件）だけをまとめて削除する。
  const handleBulkDelete = async () => {
    if (bulkDeleting) return;
    const ids = pageItems
      .map((r) => r.record.id)
      .filter((id): id is number => typeof id === "number");
    if (ids.length === 0) return;
    const ok = window.confirm(
      `表示中の${ids.length.toLocaleString(
        "ja-JP"
      )}件（このページ）の戦闘履歴を削除します。\n集計・戦績にも反映され、この操作は取り消せません。よろしいですか？`
    );
    if (!ok) return;
    setBulkDeleting(true);
    try {
      await onBulkDelete(ids);
    } catch {
      // エラー通知は呼び出し側（page.tsx）のトーストで行う。
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      {canRegister && (
      <section className="panel">
        <h2>戦闘履歴を登録</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          ゲームの戦闘履歴をブラウザからコピーして貼り付け、「登録する」を押してください。
          リンク付き（各戦の詳細ページ URL）も自動で保持されます。
          出兵側・防衛側どちらの武将も自動で抽出され、同じ内容の行は重複登録されません。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Enter で登録（入力欄から手を離さず登録できる）。
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (text.trim() && !busy) handleRegister();
            }
          }}
          placeholder={PLACEHOLDER}
          aria-label="戦闘履歴の貼り付け"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {preview && (
          <p
            className="paste-preview"
            aria-live="polite"
            style={{ margin: "8px 0 0", fontSize: 13 }}
          >
            <span className="muted">登録プレビュー:</span> 戦闘{" "}
            <strong>{preview.battles}</strong>件 / 武将{" "}
            <strong>{preview.warlords}</strong>名
            {preview.rejected > 0 && (
              <span className="paste-preview-warn">
                {" "}
                ・ 項目過不足 {preview.rejected}件（登録対象外）
              </span>
            )}
          </p>
        )}
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRegister}
            disabled={!text.trim() || busy}
            title="Cmd/Ctrl + Enter でも登録できます"
          >
            {busy ? "登録中…" : "登録する"}
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            クリア
          </button>
        </div>

        {result?.kind === "success" && (
          <div className="stat-grid">
            <div className="stat">
              <div className="label">解析行(武将数)</div>
              <div className="value">{result.parsed}</div>
            </div>
            <div className="stat">
              <div className="label">新規登録</div>
              <div className="value">{result.added}</div>
            </div>
            <div className="stat">
              <div className="label">上書き更新</div>
              <div className="value">{result.updated}</div>
            </div>
            <div className="stat">
              <div className="label">重複スキップ</div>
              <div className="value">{result.skipped}</div>
            </div>
            {result.rejected > 0 && (
              <div className="stat">
                <div className="label">過不足スキップ</div>
                <div className="value">{result.rejected}</div>
              </div>
            )}
          </div>
        )}
        {result?.kind === "warn" && (
          <div className="tag warn" role="alert">
            {result.message}
          </div>
        )}
        {result?.kind === "error" && (
          <div className="tag danger" role="alert">
            {result.message}
          </div>
        )}
      </section>
      )}

      <section className="panel">
        <div className="history-head" ref={listTopRef}>
          <h2>登録済み戦闘履歴</h2>
          <span className="count-badge" role="status" aria-live="polite">
            {hasActiveFilter
              ? `全${cards.length.toLocaleString("ja-JP")}件中 ${visibleLog.length.toLocaleString("ja-JP")}件`
              : `全${cards.length.toLocaleString("ja-JP")}件`}
          </span>
        </div>

        <div className="search-row">
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder="履歴を絞り込み（武将名など）"
          />
          <button
            type="button"
            className="btn sort-toggle"
            onClick={() =>
              setSortOrder((o) => (o === "newest" ? "oldest" : "newest"))
            }
            aria-label={
              sortOrder === "newest"
                ? "並び順: 新しい順（クリックで古い順に切替）"
                : "並び順: 古い順（クリックで新しい順に切替）"
            }
            title="登録日時の並び替え"
          >
            <SortIcon />
            <span>{sortOrder === "newest" ? "新しい順" : "古い順"}</span>
          </button>
          <button
            type="button"
            className={
              "btn filter-toggle" +
              (showFilter ||
              factionFilter ||
              fromYm != null ||
              toYm != null ||
              fromDate ||
              toDate
                ? " active"
                : "")
            }
            onClick={() => setShowFilter((v) => !v)}
            aria-expanded={showFilter}
          >
            <FilterIcon />
            <span>フィルター</span>
          </button>
          {hasActiveFilter && (
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
          {canDelete && pageItems.length > 0 && (
            <button
              type="button"
              className="btn faction-delete"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              title="このページに表示中の戦闘履歴を削除します（取り消せません）"
            >
              <TrashIcon />
              <span>
                {bulkDeleting
                  ? "削除中…"
                  : `表示中の${pageItems.length.toLocaleString(
                      "ja-JP"
                    )}件を削除`}
              </span>
            </button>
          )}
        </div>

        {showFilter && (
          <div className="filter-grid">
            <label className="filter">
              <span>国</span>
              <select
                className="select"
                value={factionFilter}
                onChange={(e) => setFactionFilter(e.target.value)}
              >
                <option value="">すべて</option>
                {factionOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>年月（開始）</span>
              <select
                className="select"
                value={fromYm ?? ""}
                onChange={(e) =>
                  setFromYm(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">指定なし</option>
                {yearMonthOptions.map(({ order, label }) => (
                  <option key={order} value={order}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>年月（終了）</span>
              <select
                className="select"
                value={toYm ?? ""}
                onChange={(e) =>
                  setToYm(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">指定なし</option>
                {yearMonthOptions.map(({ order, label }) => (
                  <option key={order} value={order}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>日付（開始）</span>
              <input
                type="date"
                className="text-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="実際の日付で絞り込む（開始）"
              />
            </label>
            <label className="filter">
              <span>日付（終了）</span>
              <input
                type="date"
                className="text-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="実際の日付で絞り込む（終了）"
              />
            </label>
          </div>
        )}

        {visibleLog.length === 0 ? (
          log.length === 0 ? (
            <div className="empty">
              <p className="empty-title">まだ戦闘履歴がありません</p>
              <p className="empty-hint">
                {canRegister
                  ? "上の入力欄にゲームの戦闘履歴を貼り付けて「登録する」を押すと、ここに一覧表示されます。リンク付きでコピーすれば詳細ページのURLも保持されます。"
                  : "管理者が戦闘履歴を登録すると、ここに一覧表示されます。"}
              </p>
            </div>
          ) : (
            <div className="empty">
              <p className="empty-title">条件に一致する履歴がありません</p>
              <p className="empty-hint">
                キーワードや国フィルターを変更・解除してください。
              </p>
            </div>
          )
        ) : (
          <>
            <ul className="battle-list">
              {pageItems.map(({ record, card }, i) => (
                <BattleHistoryCard
                  key={`${record.savedAt}-${i}-${record.line.slice(0, 16)}`}
                  record={record}
                  card={card}
                  factionColors={factionColors}
                  highlight={deferredKeyword}
                  antiIndex={antiIndex}
                  onSelectWarlord={onSelectWarlord}
                  onSelectUnit={onSelectUnit}
                  onDelete={onDelete}
                  canDelete={canDelete}
                />
              ))}
            </ul>

            <div className="pager">
              <button
                type="button"
                className="btn pager-btn"
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  scrollToListTop();
                }}
                disabled={page <= 1}
              >
                <ChevronLeft />
                <span>前へ</span>
              </button>
              <span className="pager-info">
                {rangeStart.toLocaleString("ja-JP")}–
                {rangeEnd.toLocaleString("ja-JP")} /{" "}
                {visibleLog.length.toLocaleString("ja-JP")}件（{page} /{" "}
                {totalPages}）
              </span>
              <button
                type="button"
                className="btn pager-btn"
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  scrollToListTop();
                }}
                disabled={page >= totalPages}
              >
                <span>次へ</span>
                <ChevronRight />
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

interface CardProps {
  record: BattleRecord;
  card: BattleCard | null;
  factionColors: FactionColorMap;
  highlight: string;
  antiIndex: Map<string, Set<string>>;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onDelete: (id: number) => Promise<void>;
  canDelete?: boolean;
}

/** 検索語に一致する部分を <mark> で強調表示する（大文字小文字を区別しない）。 */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lowerQ, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark key={key++} className="hl">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  return out;
}

function BattleHistoryCard({
  record,
  card,
  factionColors,
  highlight,
  antiIndex,
  onSelectWarlord,
  onSelectUnit,
  onDelete,
  canDelete = false,
}: CardProps) {
  // コピー完了の一時表示（フックは早期 return より前で宣言する）
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 解析できなかった行は生テキストで表示（データを失わない）
  if (!card) {
    const { url } = extractBattleUrl(record.line);
    return (
      <li className="battle-card battle-card--raw">
        {record.time && <span className="bc-time">{record.time}</span>}
        <span className="bc-raw-line">{highlightMatch(record.line, highlight)}</span>
        {url && (
          <a
            className="bc-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLinkIcon />
            <span>詳細を見る</span>
          </a>
        )}
      </li>
    );
  }

  const safeCard = card;

  // 左右それぞれの国の色を求める（未設定なら左=緑 / 右=橙の既定色）。
  const leftColor = resolveFactionColor(
    safeCard.left.faction,
    DEFAULT_WIN_LEFT,
    factionColors
  );
  const rightColor = resolveFactionColor(
    safeCard.right.faction,
    DEFAULT_WIN_RIGHT,
    factionColors
  );
  // 勝者の名前はその国の色で塗る（引分・撤退・不明は色なし）。
  const winnerColor =
    safeCard.winner === "left"
      ? leftColor
      : safeCard.winner === "right"
      ? rightColor
      : undefined;
  const winnerName =
    safeCard.winner === "left"
      ? safeCard.left.name
      : safeCard.winner === "right"
      ? safeCard.right.name
      : "—";
  const resultLabel =
    safeCard.winner === "draw"
      ? "引分"
      : safeCard.winner === "retreat"
      ? "撤退"
      : safeCard.winner === "unknown"
      ? safeCard.resultRaw
      : "勝利";

  // カード余白のクリックで戦闘ログ URL を開く（武将名・兵種ボタンは stopPropagation）。
  const openUrl = () => {
    if (safeCard.url) window.open(safeCard.url, "_blank", "noopener,noreferrer");
  };

  // 戦闘ログの URL をクリップボードへコピー（共有用）。
  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!safeCard.url) return;
    const ok = await copyText(safeCard.url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  // 戦闘記録を削除（確認後）。
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!record.id) return; // id がない場合は削除不可
    if (!window.confirm("この戦闘履歴を削除してよろしいですか？（取り消せません）")) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(record.id);
    } catch {
      window.alert("削除に失敗しました。もう一度お試しください。");
    } finally {
      setDeleting(false);
    }
  };

  const renderTeam = (
    side: BattleSide,
    opponent: BattleSide,
    align: "left" | "right",
    color: string
  ) => (
    <div className={`bc-team bc-team--${align}`}>
      {side.faction && (
        <span
          className="bc-faction"
          style={factionNameStyle(side.faction, factionColors)}
        >
          {highlightMatch(side.faction, highlight)}
        </span>
      )}
      <button
        type="button"
        className="bc-name bc-name-btn"
        style={{ color }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectWarlord(side.name);
        }}
        title={`${side.name} の戦績を見る`}
      >
        {highlightMatch(side.name, highlight)}
      </button>
      <div className="bc-tags">
        {sideTags(side).map((t, i) =>
          t.unit ? (
            <span key={`${t.text}-${i}`} className="pill-anti-group">
              <button
                type="button"
                className={"pill pill-btn" + (t.highlight ? " highlight" : "")}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectUnit(t.text);
                }}
                title={`${t.text} の戦績を見る`}
              >
                {highlightMatch(t.text, highlight)}
              </button>
              <AntiArrows self={side} opponent={opponent} antiIndex={antiIndex} />
            </span>
          ) : (
            <span
              key={`${t.text}-${i}`}
              className={"pill" + (t.highlight ? " highlight" : "")}
            >
              {highlightMatch(t.text, highlight)}
            </span>
          )
        )}
      </div>
    </div>
  );

  return (
    <li
      className={"battle-card" + (safeCard.url ? " battle-card--link" : "")}
      style={{
        borderLeftWidth: 2,
        borderLeftStyle: "solid",
        borderLeftColor: leftColor,
        borderRightWidth: 2,
        borderRightStyle: "solid",
        borderRightColor: rightColor,
      }}
      onClick={safeCard.url ? openUrl : undefined}
      role={safeCard.url ? "link" : undefined}
      tabIndex={safeCard.url ? 0 : undefined}
      onKeyDown={
        safeCard.url
          ? (e) => {
              if (e.key === "Enter") openUrl();
            }
          : undefined
      }
    >
      <div className="bc-header">
        <div className="bc-header-left">
          {safeCard.battleNo && (
            <span className="bc-badge">{safeCard.battleNo}</span>
          )}
          {safeCard.place && <span className="bc-place">{safeCard.place}</span>}
        </div>
        <div className="bc-header-right">
          {safeCard.turns && (
            <span className="bc-turns">{safeCard.turns}ターン</span>
          )}
          {(safeCard.battleAt || record.time) && (
            <span className="bc-time">{safeCard.battleAt ?? record.time}</span>
          )}
          {safeCard.url && (
            <button
              type="button"
              className={"bc-link-icon bc-copy-btn" + (copied ? " copied" : "")}
              onClick={copyLink}
              aria-label={
                copied ? "リンクをコピーしました" : "戦闘ログのリンクをコピー"
              }
              title={copied ? "コピーしました" : "リンクをコピー"}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          )}
          {safeCard.url && (
            <a
              className="bc-link-icon"
              href={safeCard.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="戦闘ログの詳細を開く"
              title="戦闘ログの詳細を開く"
            >
              <ExternalLinkIcon />
            </a>
          )}
          {canDelete && (
            <button
              type="button"
              className="bc-link-icon bc-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="戦闘履歴を削除"
              title="戦闘履歴を削除"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      <div className="bc-vs">
        {renderTeam(safeCard.left, safeCard.right, "left", leftColor)}
        <div className="bc-vs-label">VS</div>
        {renderTeam(safeCard.right, safeCard.left, "right", rightColor)}
      </div>

      <div className="bc-result">
        <span className="bc-result-label">
          <TrophyIcon />
          {resultLabel}
        </span>
        <span
          className="bc-winner"
          style={winnerColor ? { color: winnerColor } : undefined}
        >
          {winnerName}
        </span>
      </div>
    </li>
  );
}
