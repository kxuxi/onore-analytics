import { useMemo, useState } from "react";
import { rankingPeriods, type MetaPeriod } from "@/lib/stats";
import type { BattleRecord } from "@/lib/types";
import { SegmentedControl } from "./SegmentedControl";

/**
 * ランキング・メタ分析で共通の「集計期間」の状態。
 * keys を渡すと、その期間だけを選択肢にする（並びは rankingPeriods のまま）。
 */
export function useRankingPeriod(
  log: BattleRecord[],
  defaultKey: string,
  keys?: readonly string[]
) {
  const [periodKey, setPeriodKey] = useState(defaultKey);
  const all = useMemo(() => rankingPeriods(log), [log]);
  const periods = useMemo(
    () => (keys ? all.filter((p) => keys.includes(p.key)) : all),
    // keys は呼び出し側の定数を想定する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all]
  );
  const period: MetaPeriod | undefined = useMemo(
    () => all.find((p) => p.key === periodKey),
    [all, periodKey]
  );
  return { periods, periodKey, setPeriodKey, period };
}

/** 集計期間の切り替えボタン。 */
export function PeriodSelector({
  periods,
  value,
  onChange,
}: {
  periods: readonly MetaPeriod[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <SegmentedControl
      className="tmx-periods"
      ariaLabel="集計期間"
      options={periods}
      value={value}
      onChange={onChange}
    />
  );
}
