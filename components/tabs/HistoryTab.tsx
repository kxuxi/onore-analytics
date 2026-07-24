"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import type { BattleRecord } from "@/lib/types";
import { parseBattleEntriesChecked } from "@/lib/parser";
import type { FactionColorMap } from "@/lib/factionColors";
import { htmlToMarkdown } from "@/lib/clipboard";
import {
  ChevronLeft,
  ChevronRight,
  SortIcon,
  TrashIcon,
} from "@/components/icons";
import { FilterPanel, type ActiveFilter } from "@/components/FilterPanel";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";
import { BattleHistoryCard } from "@/components/tabs/BattleHistoryCard";
import { BATTLE_LOG_PAGE_SIZE as PAGE_SIZE } from "@/lib/stats";
import { useAntiIndex } from "@/lib/useAntiIndex";
import {
  buildBattleHistoryItems,
  filterAndSortBattleHistory,
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
  onSelectEquip: (name: string, slot: "weapon" | "item") => void;
  onDelete: (id: number) => Promise<void>;
  /** 現在のページに表示している戦闘履歴をまとめて削除する。 */
  onBulkDelete: (ids: number[]) => Promise<void>;
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
  onSelectEquip,
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

  // 内容が同一の行は、従来どおり最初のレコードを残して重複表示しない。
  const cards = useMemo(() => buildBattleHistoryItems(log), [log]);

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

  // 戦闘時刻順で表示（新しい順 / 古い順）。キーワード・国・期間で絞り込む。
  const visibleLog = useMemo(
    () =>
      filterAndSortBattleHistory(
        cards,
        {
          keyword: deferredKeyword,
          faction: factionFilter,
          fromGameMonth: fromYm,
          toGameMonth: toYm,
          fromDate,
          toDate,
          sortOrder,
        },
        new Date()
      ),
    [
      cards,
      deferredKeyword,
      factionFilter,
      sortOrder,
      fromYm,
      toYm,
      fromDate,
      toDate,
    ]
  );

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

  const activeFilters: ActiveFilter[] = [
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
    ...(fromYm != null
      ? [
          {
            key: "fromYm",
            label: "ゲーム内年月（開始）",
            value: formatGameMonthOrder(fromYm),
            onRemove: () => setFromYm(null),
          },
        ]
      : []),
    ...(toYm != null
      ? [
          {
            key: "toYm",
            label: "ゲーム内年月（終了）",
            value: formatGameMonthOrder(toYm),
            onRemove: () => setToYm(null),
          },
        ]
      : []),
    ...(fromDate
      ? [
          {
            key: "fromDate",
            label: "実日付（開始）",
            value: fromDate,
            onRemove: () => setFromDate(""),
          },
        ]
      : []),
    ...(toDate
      ? [
          {
            key: "toDate",
            label: "実日付（終了）",
            value: toDate,
            onRemove: () => setToDate(""),
          },
        ]
      : []),
  ];

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
        <PageHeader
          title="戦闘履歴"
          description="戦闘結果の登録と、保存済み履歴の検索・確認を行います。"
        />
        <h3 className="section-title">戦闘履歴を登録</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          ゲームの戦闘履歴をブラウザからコピーして貼り付け、「登録する」を押してください。
          リンク付き（各戦の詳細ページ URL）も自動で保持されます。
          出兵側・守備側どちらの武将も自動で抽出され、同じ内容の行は重複登録されません。
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
        {!canRegister && (
          <PageHeader
            title="戦闘履歴"
            description="勝敗と出兵側・守備側を見比べながら、期間・国・武将名などで検索できます。"
          />
        )}
        <div className="history-head" ref={listTopRef}>
          <h3 className="section-title">登録済み戦闘履歴</h3>
        </div>

        <FilterPanel
          id="history-filters"
          search={
            <SearchBox
              value={keyword}
              onChange={setKeyword}
              placeholder="武将・国・兵種・装備を検索"
            />
          }
          expanded={showFilter}
          onToggle={() => setShowFilter((v) => !v)}
          toggleActive={Boolean(
            showFilter ||
              factionFilter ||
              fromYm != null ||
              toYm != null ||
              fromDate ||
              toDate
          )}
          hasActiveFilters={hasActiveFilter}
          onClear={clearFilters}
          activeFilters={activeFilters}
          resultText={
            hasActiveFilter
              ? `全${cards.length.toLocaleString(
                  "ja-JP"
                )}件中 ${visibleLog.length.toLocaleString("ja-JP")}件`
              : `全${cards.length.toLocaleString("ja-JP")}件`
          }
          leadingActions={
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
              title="戦闘日時の並び替え"
            >
              <SortIcon />
              <span>{sortOrder === "newest" ? "新しい順" : "古い順"}</span>
            </button>
          }
          trailingActions={
            canDelete && pageItems.length > 0 ? (
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
            ) : undefined
          }
        >
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
            <span>ゲーム内年月（開始）</span>
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
            <span>ゲーム内年月（終了）</span>
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
            <span>実日付（開始）</span>
            <input
              type="date"
              className="text-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="実際の日付で絞り込む（開始）"
            />
          </label>
          <label className="filter">
            <span>実日付（終了）</span>
            <input
              type="date"
              className="text-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="実際の日付で絞り込む（終了）"
            />
          </label>
        </FilterPanel>

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
                武将・国・兵種・装備の検索語や、期間・国の条件を変更してください。
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
                  onSelectEquip={onSelectEquip}
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
