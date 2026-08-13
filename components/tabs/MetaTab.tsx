"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { BattleRecord } from "@/lib/types";
import { metaOverview, rankingPeriods } from "@/lib/stats";

interface Props {
  log: BattleRecord[];
  onSelectUnit: (name: string) => void;
}

/** 採用率ランキングに表示する上位件数。 */
const TOP_N = 10;

/** パーセント表示（整数）。 */
function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * 環境ダッシュボード。期間内の兵種採用率ランキングを表示する。
 * 兵種名クリックで兵種詳細へ遷移する。
 */
export function MetaTab({ log, onSelectUnit }: Props) {
  const [period, setPeriod] = useState<string>("all");
  const [type, setType] = useState<string>("");

  // 集計期間（先頭＝過去10年間、以降はメタ分析の絶対年バケット＋全期間）。
  const periods = useMemo(() => rankingPeriods(log), [log]);
  const range = useMemo(
    () => periods.find((p) => p.key === period) ?? null,
    [periods, period]
  );

  // 武将タイプの選択肢は期間に依存せず安定させたいので、全期間から抽出する。
  const typeOptions = useMemo(
    () => metaOverview(log).traits.map((t) => t.trait),
    [log]
  );

  const { totalBattles, units } = useMemo(
    () => metaOverview(log, range ?? undefined, type || undefined),
    [log, range, type]
  );

  // 採用率上位（少なくとも 1 回は登場した兵種のみ）。
  const topUnits = useMemo(
    () => units.filter((u) => u.appearances > 0).slice(0, TOP_N),
    [units]
  );

  return (
    <section className="panel">
      <PageHeader
        title="環境ダッシュボード"
        description="期間内に登場した兵種の採用率ランキングと勝率を表示します。"
      />

      <div className="tmx-periods" role="group" aria-label="集計期間">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            className={"tmx-period" + (period === p.key ? " active" : "")}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="meta-filter">
        <label className="meta-filter-label" htmlFor="meta-type">
          武将タイプ
        </label>
        <select
          id="meta-type"
          className="select meta-filter-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">すべて</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {totalBattles === 0 ? (
        <p className="muted">この期間の対戦データがありません。</p>
      ) : (
        <>
          <div className="meta-block">
            <h3 className="meta-h3">
              採用率 TOP {TOP_N}
              {type && <span className="meta-h3-tag">{type}</span>}
              <span className="meta-h3-sub">全{totalBattles}戦</span>
            </h3>
            {topUnits.length === 0 ? (
              <p className="muted">この条件に当てはまる兵種がありません。</p>
            ) : (
              <ol className="meta-units">
                {topUnits.map((u, i) => (
                  <li className="meta-row" key={u.unit}>
                    <span className="meta-rank">{i + 1}</span>
                    <button
                      type="button"
                      className="link-like meta-name"
                      onClick={() => onSelectUnit(u.unit)}
                    >
                      {u.unit}
                    </button>
                    <span className="meta-pick">
                      採用 <strong>{pct(u.pickRate)}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
