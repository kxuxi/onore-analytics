"use client";

import { useMemo } from "react";
import type { BattleRecord } from "@/lib/types";
import {
  collectEquipBattles,
  summarize,
  unitMatchupRanking,
  userWinRates,
  unitUsage,
  type EquipSlot,
} from "@/lib/stats";
import { BattleLogList } from "@/components/detail/BattleLogList";
import { Section } from "@/components/detail/Section";
import {
  DetailHeader,
  StatCards,
  WinRateBar,
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
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onBack: () => void;
}

export function EquipDetail({
  name,
  slot,
  log,
  onSelectWarlord,
  onSelectUnit,
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
  // この装備をよく持っている兵種（上位）。
  const topUnits = useMemo(
    () => unitUsage(outcomes).filter((u) => u.name !== "不明").slice(0, 8),
    [outcomes]
  );

  return (
    <section className="panel detail-panel">
      <DetailHeader kind={kind} title={name} onBack={onBack} />

      {outcomes.length === 0 ? (
        <div className="empty">
          <p className="empty-title">この{kind}の戦闘履歴がまだありません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を登録すると、この{kind}を装備した戦闘の
            勝率や使用武将がここに表示されます。
          </p>
        </div>
      ) : (
        <>
          <StatCards summary={summary} />
          <WinRateBar summary={summary} />

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

          <Section title="戦闘ログ" count={`${outcomes.length}件`} mobileCollapsed>
            <BattleLogList
              outcomes={outcomes}
              onSelectWarlord={onSelectWarlord}
              onSelectUnit={onSelectUnit}
            />
          </Section>
        </>
      )}
    </section>
  );
}
