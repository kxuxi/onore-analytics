"use client";

import { useEffect, useMemo, useState } from "react";
import { outcomeYear } from "@/lib/stats";
import type { BattleOutcome } from "@/lib/stats";

export interface YearRangeFilter {
  /** 対象データに含まれるゲーム内の年（新しい順） */
  years: number[];
  fromYear: number;
  toYear: number;
  setFromYear: (y: number) => void;
  setToYear: (y: number) => void;
  /** 全期間から絞り込んでいるか */
  isFiltered: boolean;
  /** 全期間に戻す */
  reset: () => void;
  /** 年範囲で絞り込んだ結果 */
  filtered: BattleOutcome[];
}

/**
 * 戦闘の一覧をゲーム内の年で絞り込む共通ロジック。
 * 「使用兵種の割合」と「戦闘ログ」など、複数セクションで同じ絞り込みを共有する場合に使う。
 */
export function useYearRangeFilter(outcomes: BattleOutcome[]): YearRangeFilter {
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const o of outcomes) {
      const y = outcomeYear(o);
      if (y != null) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [outcomes]);
  const minYear = years.length ? years[years.length - 1] : 0;
  const maxYear = years.length ? years[0] : 0;

  const [fromYear, setFromYear] = useState(minYear);
  const [toYear, setToYear] = useState(maxYear);

  // データが変わって年の範囲が変わったら、選択を全期間へ戻す。
  useEffect(() => {
    setFromYear(minYear);
    setToYear(maxYear);
  }, [minYear, maxYear]);

  const lo = Math.min(fromYear, toYear);
  const hi = Math.max(fromYear, toYear);
  const isFiltered = lo !== minYear || hi !== maxYear;

  // 年の範囲で絞り込む。範囲を狭めた場合のみ「年が不明な戦闘」を除外する。
  const filtered = useMemo(() => {
    if (!isFiltered) return outcomes;
    return outcomes.filter((o) => {
      const y = outcomeYear(o);
      if (y == null) return false;
      return y >= lo && y <= hi;
    });
  }, [outcomes, isFiltered, lo, hi]);

  const reset = () => {
    setFromYear(minYear);
    setToYear(maxYear);
  };

  return { years, fromYear, toYear, setFromYear, setToYear, isFiltered, reset, filtered };
}

/** 年範囲フィルターの操作 UI。2 年分以上のデータがある場合のみ呼び出し側で表示する。 */
export function YearRangeFilterBar({
  years,
  fromYear,
  toYear,
  setFromYear,
  setToYear,
  isFiltered,
  reset,
}: YearRangeFilter) {
  return (
    <div className="log-filter">
      <span className="log-filter-label">表示する年</span>
      <label className="log-filter-field">
        <span className="sr-only">開始年</span>
        <select
          className="select"
          value={fromYear}
          onChange={(e) => setFromYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
      </label>
      <span className="log-filter-sep" aria-hidden="true">
        〜
      </span>
      <label className="log-filter-field">
        <span className="sr-only">終了年</span>
        <select
          className="select"
          value={toYear}
          onChange={(e) => setToYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
      </label>
      {isFiltered && (
        <button type="button" className="btn log-filter-clear" onClick={reset}>
          全期間
        </button>
      )}
    </div>
  );
}
