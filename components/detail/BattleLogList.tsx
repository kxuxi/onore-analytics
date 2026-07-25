"use client";

import { useEffect, useRef, useState } from "react";
import { BATTLE_LOG_PAGE_SIZE as PAGE_SIZE } from "@/lib/stats";
import type { BattleOutcome, OutcomeResult } from "@/lib/stats";
import type { FactionColorMap } from "@/lib/factionColors";
import { useAntiIndex } from "@/lib/useAntiIndex";
import { BattleHistoryCard } from "@/components/tabs/BattleHistoryCard";
import {
  useYearRangeFilter,
  YearRangeFilterBar,
  type YearRangeFilter,
} from "@/components/detail/YearRangeFilter";
import { ChevronLeft, ChevronRight } from "@/components/icons";

interface Props {
  outcomes: BattleOutcome[];
  /**
   * @deprecated 対象側は各 BattleOutcome.side から判定する。
   * 既存の呼び出し互換性のため受け付けるが、表示には使用しない。
   */
  currentName?: string;
  /** @deprecated currentName と同様に後方互換のため受け付ける。 */
  currentUnit?: string;
  factionColors?: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectEquip?: (name: string, slot: "weapon" | "item") => void;
  /**
   * 年フィルターを外部（呼び出し側）と共有する場合に渡す。
   * 渡された場合、自前の年フィルターUIは表示せず、渡された絞り込み済み結果をそのまま使う。
   */
  yearFilter?: YearRangeFilter;
}

export function BattleLogList({
  outcomes,
  factionColors,
  onSelectWarlord,
  onSelectUnit,
  onSelectEquip,
  yearFilter,
}: Props) {
  // 呼び出し側から年フィルターが渡されなければ、自前で管理する（フックは常に呼ぶ）。
  const ownYearFilter = useYearRangeFilter(outcomes);
  const yf = yearFilter ?? ownYearFilter;
  const showOwnFilterBar = !yearFilter;
  const filtered = yf.filtered;
  // 兵種アンチ（じゃんけん）の得意兵種索引。兵種名の横の矢印に使う。
  const antiIndex = useAntiIndex();

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
          <ul className="battle-list">
            {paged.map((o, i) => (
              <BattleHistoryCard
                key={`${o.record.savedAt}-${start + i}-${o.side}`}
                record={o.record}
                card={o.card}
                factionColors={factionColors}
                highlight=""
                antiIndex={antiIndex}
                onSelectWarlord={onSelectWarlord}
                onSelectUnit={onSelectUnit}
                onSelectEquip={onSelectEquip}
                subdued
                perspective={{ side: o.side, result: o.result }}
              />
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
