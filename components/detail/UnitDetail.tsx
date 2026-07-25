"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BattleRecord, UnitType } from "@/lib/types";
import type { FactionColorMap } from "@/lib/factionColors";
import {
  collectUnitBattles,
  summarize,
  unitMatchupRanking,
  userWinRates,
  unitUsageTrend,
  unitBranchLabel,
} from "@/lib/stats";
import { fetchUnitTypes } from "@/lib/api";
import { parseReqStats, splitGoodAgainst } from "@/lib/unitTypeForm";
import { Section } from "@/components/detail/Section";
import {
  DetailBattleLogSection,
  DetailEmptyState,
  DetailPage,
  DetailSummary,
} from "@/components/detail/DetailParts";
import {
  UnitMatchupRanking,
  UserWinRateList,
  UsageTrend,
} from "@/components/detail/UnitInsights";
import { UnitEditModal } from "@/components/tabs/UnitEditModal";

interface Props {
  name: string;
  log: BattleRecord[];
  colors?: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectEquip?: (name: string, slot: "weapon" | "item") => void;
  onBack: () => void;
}

export function UnitDetail({
  name,
  log,
  colors,
  onSelectWarlord,
  onSelectUnit,
  onSelectEquip,
  onBack,
}: Props) {
  const outcomes = useMemo(() => collectUnitBattles(log, name), [log, name]);
  const summary = useMemo(() => summarize(outcomes), [outcomes]);

  const branch = useMemo(() => unitBranchLabel(outcomes), [outcomes]);
  const unitRanking = useMemo(
    () => unitMatchupRanking(outcomes),
    [outcomes]
  );
  const users = useMemo(() => userWinRates(outcomes), [outcomes]);
  const trend = useMemo(() => unitUsageTrend(log, name), [log, name]);

  // 兵種マスタ（図鑑データ）を取得。詳細画面で内容の表示と編集に使う。
  const [units, setUnits] = useState<UnitType[]>([]);
  const [editing, setEditing] = useState(false);

  const reloadUnits = useCallback(async () => {
    try {
      setUnits(await fetchUnitTypes());
    } catch {
      /* マスタ取得失敗時は戦績のみ表示する（致命的ではない） */
    }
  }, []);

  useEffect(() => {
    reloadUnits();
  }, [reloadUnits]);

  const unit = useMemo(
    () => units.find((u) => u.name === name),
    [units, name]
  );

  const statOptions = useMemo(
    () =>
      Array.from(
        new Set(
          units.map((u) => parseReqStats(u.reqStats).stat).filter(Boolean)
        )
      ),
    [units]
  );

  const goodAgainst = unit ? splitGoodAgainst(unit.goodAgainst) : [];

  return (
    <DetailPage
      kind="兵種"
      title={name}
      tags={
        branch ? <span className="tag branch">{branch}</span> : undefined
      }
      actions={
        unit ? (
          <button
            type="button"
            className="btn"
            onClick={() => setEditing(true)}
          >
            編集
          </button>
        ) : undefined
      }
      onBack={onBack}
    >
      {unit && (
        <Section title="兵種データ" mobileCollapsed>
          <dl className="unit-spec">
            <div className="spec-row">
              <dt>種類</dt>
              <dd>{unit.category || "—"}</dd>
            </div>
            <div className="spec-row">
              <dt>攻撃</dt>
              <dd>{unit.attack}</dd>
            </div>
            <div className="spec-row">
              <dt>防御</dt>
              <dd>{unit.defense}</dd>
            </div>
            <div className="spec-row">
              <dt>雇用</dt>
              <dd>{unit.cost || "—"}</dd>
            </div>
            <div className="spec-row">
              <dt>技術</dt>
              <dd>{unit.tech || "—"}</dd>
            </div>
            <div className="spec-row">
              <dt>年数</dt>
              <dd>{unit.years || "—"}</dd>
            </div>
            <div className="spec-row">
              <dt>必要能力値</dt>
              <dd>{unit.reqStats || "—"}</dd>
            </div>
            <div className="spec-row">
              <dt>得意兵種</dt>
              <dd>
                {goodAgainst.length > 0 ? (
                  <span className="tag-list">
                    {goodAgainst.map((g) => (
                      <span key={g} className="tag unit">
                        {g}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="spec-row">
              <dt>施設/国宝</dt>
              <dd>{unit.facility || "—"}</dd>
            </div>
            <div className="spec-row spec-wide">
              <dt>特殊攻撃</dt>
              <dd>{unit.special || "—"}</dd>
            </div>
            <div className="spec-row spec-wide">
              <dt>ボーナス</dt>
              <dd>{unit.bonus || "—"}</dd>
            </div>
          </dl>
        </Section>
      )}

      {outcomes.length === 0 ? (
        <DetailEmptyState
          title="この兵種の戦闘データがありません"
          hint={
            <>
              「{name}」が使われた戦闘履歴が見つかりませんでした。
              「戦闘履歴」タブで戦績を登録すると、勝率や相性がここに表示されます。
            </>
          }
        />
      ) : (
        <>
          <DetailSummary summary={summary} />

          <UnitMatchupRanking
            ranking={unitRanking}
            onSelectUnit={onSelectUnit}
          />

          <UserWinRateList users={users} onSelectWarlord={onSelectWarlord} />

          <UsageTrend points={trend} />

          <DetailBattleLogSection
            count={`${outcomes.length}件`}
            outcomes={outcomes}
            factionColors={colors}
            onSelectWarlord={onSelectWarlord}
            onSelectUnit={onSelectUnit}
            onSelectEquip={onSelectEquip}
          />
        </>
      )}

      {editing && unit && (
        <UnitEditModal
          initial={unit}
          isNew={false}
          statOptions={statOptions}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reloadUnits();
          }}
          onDeleted={() => {
            setEditing(false);
            onBack();
          }}
        />
      )}
    </DetailPage>
  );
}
