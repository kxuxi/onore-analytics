"use client";

import { useMemo, useState } from "react";
import type { BattleRecord } from "@/lib/types";
import {
  traitMatchupMatrix,
  collectTraitMatchupBattles,
  formatWinRate,
  META_PERIODS,
} from "@/lib/stats";
import { BattleLogList } from "@/components/detail/BattleLogList";
import { CloseIcon } from "@/components/icons";

interface Props {
  log: BattleRecord[];
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
}

/** 集計期間のプリセット（ゲーム内の年で区切る）。環境ダッシュボードと共通。 */
type PeriodKey = (typeof META_PERIODS)[number]["key"];

/** 統計的に意味を持たせる最小サンプル数（これ未満のマスは「–」表示）。 */
const MIN_SAMPLE = 5;

/** 勝率を5段階の色レベルに変換する（70 / 60 / 45 / 35% をしきい値とする）。 */
function winLevel(winRate: number): 1 | 2 | 3 | 4 | 5 {
  const pct = winRate * 100;
  if (pct >= 70) return 5;
  if (pct >= 60) return 4;
  if (pct >= 45) return 3;
  if (pct >= 35) return 2;
  return 1;
}

/**
 * 相性マトリックス。特性（タイプ）の組み合わせごとの勝率を 6×6 のヒートマップで表示する。
 * 行＝攻撃側の特性 / 列＝防衛側の特性。各マスは攻撃側視点の勝率で、クリックすると
 * その相性の対戦履歴を下に表示する。サンプルが MIN_SAMPLE 戦未満のマスは「–」とする。
 */
export function TraitMatrixTab({ log, onSelectWarlord, onSelectUnit }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [selected, setSelected] = useState<{ row: string; col: string } | null>(
    null
  );

  const range = useMemo(
    () => META_PERIODS.find((p) => p.key === period) ?? null,
    [period]
  );

  const { traits, matrix } = useMemo(
    () => traitMatchupMatrix(log, range ?? undefined),
    [log, range]
  );

  const totalBattles = useMemo(
    () => matrix.reduce((s, row) => s + row.reduce((r, c) => r + c.battles, 0), 0),
    [matrix]
  );

  // 選択中マスの対戦履歴（新しい順）。
  const drilldown = useMemo(() => {
    if (!selected) return [];
    return collectTraitMatchupBattles(
      log,
      selected.row,
      selected.col,
      range ?? undefined
    );
  }, [log, selected, range]);

  const selectPeriod = (key: PeriodKey) => {
    setPeriod(key);
    setSelected(null);
  };

  return (
    <section className="panel">
      <h2>相性マトリックス</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        出兵側が、守備側にどれだけ勝てるかを示します。
      </p>

      <div className="tmx-periods" role="tablist" aria-label="集計期間">
        {META_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={period === p.key}
            className={"tmx-period" + (period === p.key ? " active" : "")}
            onClick={() => selectPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {totalBattles === 0 ? (
        <p className="muted">この期間の対戦データがありません。</p>
      ) : (
        <>
          <div className="tmx-wrap">
            <table className="tmx-table">
              <thead>
                <tr>
                  <th className="tmx-corner" scope="col">
                    <span className="tmx-corner-atk">出 ↓</span>
                    <span className="tmx-corner-def">守 →</span>
                  </th>
                  {traits.map((t) => (
                    <th key={t} scope="col" className="tmx-colhead">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {traits.map((rowTrait, i) => (
                  <tr key={rowTrait}>
                    <th scope="row" className="tmx-rowhead">
                      {rowTrait}
                    </th>
                    {traits.map((colTrait, j) => {
                      const cell = matrix[i][j];
                      const enough = cell.battles >= MIN_SAMPLE;
                      const isSel =
                        selected?.row === rowTrait && selected?.col === colTrait;
                      const isDiag = i === j;
                      return (
                        <td key={colTrait} className="tmx-td">
                          <button
                            type="button"
                            className={
                              "tmx-cell" +
                              (enough ? ` lv${winLevel(cell.winRate)}` : " empty") +
                              (isDiag ? " diag" : "") +
                              (isSel ? " sel" : "")
                            }
                            onClick={() =>
                              setSelected(
                                isSel ? null : { row: rowTrait, col: colTrait }
                              )
                            }
                            disabled={!enough}
                            aria-label={`${rowTrait} 対 ${colTrait}：${
                              enough
                                ? `勝率 ${formatWinRate(
                                    cell.winRate,
                                    cell.decided
                                  )}（${cell.wins}勝 ${cell.losses}敗）`
                                : "サンプル不足"
                            }`}
                            title={
                              cell.battles > 0
                                ? `${rowTrait} → ${colTrait}｜${cell.wins}勝 ${cell.losses}敗 / ${cell.battles}戦`
                                : "対戦データなし"
                            }
                          >
                            <span className="tmx-rate">
                              {enough
                                ? formatWinRate(cell.winRate, cell.decided)
                                : "–"}
                            </span>
                            {enough && (
                              <span className="tmx-count">
                                {cell.wins}-{cell.losses}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tmx-legend">
            <span className="tmx-legend-item">
              <span className="tmx-chip lv5" />
              70%以上
            </span>
            <span className="tmx-legend-item">
              <span className="tmx-chip lv4" />
              60–70%
            </span>
            <span className="tmx-legend-item">
              <span className="tmx-chip lv3" />
              45–60%
            </span>
            <span className="tmx-legend-item">
              <span className="tmx-chip lv2" />
              35–45%
            </span>
            <span className="tmx-legend-item">
              <span className="tmx-chip lv1" />
              35%未満
            </span>
          </div>
        </>
      )}

      {selected && (
        <div className="tmx-drill">
          <div className="tmx-drill-head">
            <span>
              <strong>
                {selected.row} → {selected.col}
              </strong>{" "}
              の対戦履歴（{drilldown.length}件）
            </span>
            <button
              type="button"
              className="btn tmx-drill-close"
              onClick={() => setSelected(null)}
            >
              <CloseIcon />
              <span>閉じる</span>
            </button>
          </div>
          {drilldown.length > 0 ? (
            <BattleLogList
              outcomes={drilldown}
              onSelectWarlord={onSelectWarlord}
              onSelectUnit={onSelectUnit}
            />
          ) : (
            <p className="muted">この相性の対戦履歴がありません。</p>
          )}
        </div>
      )}
    </section>
  );
}
