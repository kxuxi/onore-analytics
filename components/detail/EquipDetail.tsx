"use client";

import { useMemo } from "react";
import type { BattleRecord } from "@/lib/types";
import type { FactionColorMap } from "@/lib/factionColors";
import {
  collectEquipBattles,
  summarize,
  unitMatchupRanking,
  userWinRates,
  unitUsage,
  type EquipSlot,
} from "@/lib/stats";
import { Section } from "@/components/detail/Section";
import {
  DetailBattleLogSection,
  DetailEmptyState,
  DetailLayout,
  DetailSummary,
} from "@/components/detail/DetailParts";
import {
  UnitMatchupRanking,
  UserWinRateList,
} from "@/components/detail/UnitInsights";

interface Props {
  name: string;
  /** 武将の持つ武器か武将の持つ品物か。 */
  slot: EquipSlot;
  log: BattleRecord[];
  colors?: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectEquip?: (name: string, slot: "weapon" | "item") => void;
  onBack: () => void;
}

export function EquipDetail({
  name,
  slot,
  log,
  colors,
  onSelectWarlord,
  onSelectUnit,
  onSelectEquip,
  onBack,
}: Props) {
  const kind = slot === "weapon" ? "武器" : "品物";
  const outcomes = useMemo(
    () => collectEquipBattles(log, name, slot),
    [log, name, slot]
  );
  const summary = useMemo(() => summarize(outcomes), [outcomes]);
  const unitRanking = useMemo(() => unitMatchupRanking(outcomes), [outcomes]);
  const users = useMemo(() => userWinRates(outcomes), [outcomes]);
  const topUnits = useMemo(
    () => unitUsage(outcomes).filter((u) => u.name !== "不明").slice(0, 8),
    [outcomes]
  );

  const summaryContent = outcomes.length > 0 ? (
    <DetailSummary summary={summary} />
  ) : undefined;
  const emptyState = outcomes.length === 0 ? (
    <DetailEmptyState
      title={`この${kind}の戦闘履歴がまだありません`}
      hint={
        <>
          「{name}」が戦闘履歴にまだ出ていません。登録すると、この{kind}の使用武将や相性を確認できます。
        </>
      }
    />
  ) : undefined;
  const sections = outcomes.length > 0 ? (
    <>
      <UserWinRateList users={users} onSelectWarlord={onSelectWarlord} />
      <UnitMatchupRanking
        ranking={unitRanking}
        onSelectUnit={onSelectUnit}
      />
      {topUnits.length > 0 && (
        <Section title="よく使う兵種" mobileCollapsed>
          <div className="equip-units">
            {topUnits.map((u) => (
              <button
                key={u.name}
                type="button"
                className="pill pill-btn"
                onClick={() => onSelectUnit(u.name)}
                title={`${u.name} の戦績を見る`}
              >
                {u.name}
                <span className="muted">×{u.count}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  ) : undefined;
  const battleLog = outcomes.length > 0 ? (
    <DetailBattleLogSection
      count={`${outcomes.length}件`}
      outcomes={outcomes}
      factionColors={colors}
      onSelectWarlord={onSelectWarlord}
      onSelectUnit={onSelectUnit}
      onSelectEquip={onSelectEquip}
    />
  ) : undefined;

  return (
    <DetailLayout
      kind={kind}
      title={name}
      onBack={onBack}
      summary={summaryContent}
      emptyState={emptyState}
      sections={sections}
      battleLog={battleLog}
    />
  );
}
