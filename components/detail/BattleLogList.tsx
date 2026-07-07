"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeDisplayToken } from "@/lib/parser";
import { BATTLE_LOG_PAGE_SIZE as PAGE_SIZE } from "@/lib/stats";
import type { BattleOutcome, OutcomeResult } from "@/lib/stats";
import type { BattleSide } from "@/lib/parser";
import { copyText } from "@/lib/clipboard";
import {
  useYearRangeFilter,
  YearRangeFilterBar,
  type YearRangeFilter,
} from "@/components/detail/YearRangeFilter";
import {
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
  ChevronLeft,
  ChevronRight,
} from "@/components/icons";

interface Props {
  outcomes: BattleOutcome[];
  /** 強調表示する武将名（武将ページ） */
  currentName?: string;
  /** 強調表示する兵種名（兵種ページ） */
  currentUnit?: string;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  /**
   * 年フィルターを外部（呼び出し側）と共有する場合に渡す。
   * 渡された場合、自前の年フィルターUIは表示せず、渡された絞り込み済み結果をそのまま使う。
   */
  yearFilter?: YearRangeFilter;
}

function resultLabel(o: BattleOutcome): string {
  if (o.result === "win") return "勝利";
  if (o.result === "loss") return "敗北";
  if (o.card.winner === "retreat") return "撤退";
  if (o.card.winner === "draw") return "引分";
  return "不明";
}

/** 戦闘ログ行の操作ボタン群（リンクコピー・詳細を開く）。行ごとにコピー状態を持つ。 */
function LogRowActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="dl-actions">
      <button
        type="button"
        className={"dl-link dl-copy" + (copied ? " copied" : "")}
        onClick={copy}
        aria-label={
          copied ? "リンクをコピーしました" : "戦闘ログのリンクをコピー"
        }
        title={copied ? "コピーしました" : "リンクをコピー"}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <a
        className="dl-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="戦闘ログの詳細を開く"
        title="戦闘ログの詳細を開く"
      >
        <ExternalLinkIcon />
      </a>
    </div>
  );
}

interface ChipProps {
  side: BattleSide;
  currentName?: string;
  currentUnit?: string;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
}

function SideChip({
  side,
  currentName,
  currentUnit,
  onSelectWarlord,
  onSelectUnit,
}: ChipProps) {
  const unit = side.unit ? normalizeDisplayToken(side.unit) : undefined;
  const nameActive = !!currentName && side.name === currentName;
  const unitActive = !!currentUnit && unit === currentUnit;
  return (
    <span className="dl-chip">
      <button
        type="button"
        className={"dl-name" + (nameActive ? " active" : "")}
        onClick={() => onSelectWarlord(side.name)}
        title={`${side.name} の戦績を見る`}
      >
        {side.name}
      </button>
      {unit && (
        <button
          type="button"
          className={"dl-unit" + (unitActive ? " active" : "")}
          onClick={() => onSelectUnit(unit)}
          title={`${unit} の戦績を見る`}
        >
          {unit}
        </button>
      )}
    </span>
  );
}

export function BattleLogList({
  outcomes,
  currentName,
  currentUnit,
  onSelectWarlord,
  onSelectUnit,
  yearFilter,
}: Props) {
  // 呼び出し側から年フィルターが渡されなければ、自前で管理する（フックは常に呼ぶ）。
  const ownYearFilter = useYearRangeFilter(outcomes);
  const yf = yearFilter ?? ownYearFilter;
  const showOwnFilterBar = !yearFilter;
  const filtered = yf.filtered;

  const [page, setPage] = useState(1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // 絞り込みの変化でページをリセットし、総ページ数の変化で範囲外を補正する。
  useEffect(() => {
    setPage(1);
  }, [yf.fromYear, yf.toYear]);
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const start = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);

  const goPage = (next: number) => {
    setPage(next);
    wrapRef.current?.scrollIntoView({ block: "nearest" });
  };

  if (outcomes.length === 0) {
    return <div className="empty">該当する戦闘履歴がありません。</div>;
  }

  return (
    <div className="detail-log-wrap" ref={wrapRef}>
      {showOwnFilterBar && yf.years.length >= 2 && <YearRangeFilterBar {...yf} />}

      {filtered.length === 0 ? (
        <div className="empty">
          選択した期間（{Math.min(yf.fromYear, yf.toYear)}年〜
          {Math.max(yf.fromYear, yf.toYear)}年）の戦闘履歴がありません。
        </div>
      ) : (
        <>
          <ul className="detail-log">
            {paged.map((o, i) => (
              <li
                key={`${o.record.savedAt}-${start + i}-${o.side}`}
                className={"dl-row dl-row--" + o.result}
              >
                <span className={"dl-result dl-result--" + o.result}>
                  {resultLabel(o)}
                </span>
                <div className="dl-main">
                  <div className="dl-meta">
                    {o.card.battleAt ?? o.record.time ?? ""}
                    {o.card.place ? ` · ${o.card.place}` : ""}
                    {o.card.turns ? ` · ${o.card.turns}ターン` : ""}
                  </div>
                  <div className="dl-match">
                    <SideChip
                      side={o.self}
                      currentName={currentName}
                      currentUnit={currentUnit}
                      onSelectWarlord={onSelectWarlord}
                      onSelectUnit={onSelectUnit}
                    />
                    <span className="dl-vs">vs</span>
                    <SideChip
                      side={o.opponent}
                      currentName={currentName}
                      currentUnit={currentUnit}
                      onSelectWarlord={onSelectWarlord}
                      onSelectUnit={onSelectUnit}
                    />
                  </div>
                </div>
                {o.card.url && <LogRowActions url={o.card.url} />}
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="pager">
              <button
                type="button"
                className="btn pager-btn"
                onClick={() => goPage(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft />
                <span>前へ</span>
              </button>
              <span className="pager-info">
                {rangeStart.toLocaleString("ja-JP")}–
                {rangeEnd.toLocaleString("ja-JP")} /{" "}
                {filtered.length.toLocaleString("ja-JP")}件（{page} / {totalPages}
                ）
              </span>
              <button
                type="button"
                className="btn pager-btn"
                onClick={() => goPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              >
                <span>次へ</span>
                <ChevronRight />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export type { OutcomeResult };
