"use client";

import { useMemo, useState } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import {
  collectFactionBattles,
  summarize,
  factionMemberStats,
  latestUnitsByBranch,
  factionMemberUnitTrends,
  latestGameYear,
  branchStats,
  formatWinRate,
} from "@/lib/stats";
import type { FactionMemberStat, MemberUnitTrend } from "@/lib/stats";
import {
  factionNameStyle,
  type FactionColorMap,
} from "@/lib/factionColors";
import { copyText } from "@/lib/copyText";
import { Section } from "@/components/detail/Section";
import {
  DetailBattleLogSection,
  DetailEmptyState,
  DetailPage,
  DetailSummary,
} from "@/components/detail/DetailParts";
import { BranchWinRates } from "@/components/detail/WarlordInsights";

interface Props {
  name: string;
  db: WarlordMap;
  log: BattleRecord[];
  colors: FactionColorMap;
  canViewLatestUnits: boolean;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectEquip?: (name: string, slot: "weapon" | "item") => void;
  onBack: () => void;
}

/** 所属武将（現在＋過去に在籍）と、その国での在籍区間の戦績を組み合わせた 1 行分のデータ。 */
interface MemberRow {
  name: string;
  type?: string;
  branch?: string;
  /** その国に在籍していた期間（最後に在籍した区間）の戦績。 */
  stat?: FactionMemberStat;
  /** 過去10年間にこの国で使った兵種の傾向。 */
  unitTrend?: MemberUnitTrend;
}

export function FactionDetail({
  name,
  db,
  log,
  colors,
  canViewLatestUnits,
  onSelectWarlord,
  onSelectUnit,
  onSelectEquip,
  onBack,
}: Props) {
  // 国全体の戦績（誰がこの国で戦ったかを問わず、この国の旗で戦った全戦闘）。
  const outcomes = useMemo(
    () => collectFactionBattles(log, name),
    [log, name]
  );
  const summary = useMemo(() => summarize(outcomes), [outcomes]);
  const branches = useMemo(() => branchStats(outcomes), [outcomes]);

  // 所属武将：この国で戦ったことのある武将を、在籍していた期間の戦績で表示する。
  const members = useMemo<MemberRow[]>(() => {
    const target = name.trim();
    const statMap = new Map<string, FactionMemberStat>();
    for (const s of factionMemberStats(log, target)) statMap.set(s.name, s);
    // 過去10年間（最新のゲーム内年から遡って10年）の兵種傾向。
    const latest = latestGameYear(log);
    const trendMap = factionMemberUnitTrends(
      log,
      target,
      latest != null ? latest - 9 : null
    );
    const rows: MemberRow[] = Array.from(statMap.keys()).map((n) => {
      const w = db[n];
      return {
        name: n,
        type: w?.type,
        branch: w?.branch,
        stat: statMap.get(n),
        unitTrend: trendMap.get(n),
      };
    });
    return rows.sort((a, b) => {
      const ab = a.stat?.battles ?? 0;
      const bb = b.stat?.battles ?? 0;
      if (ab !== bb) return bb - ab;
      return a.name.localeCompare(b.name, "ja");
    });
  }, [db, log, name]);

  const currentLatestUnits = useMemo(() => {
    const target = name.trim();
    const currentNames = new Set(
      Object.values(db)
        .filter((w) => w.faction?.trim() === target)
        .map((w) => w.name.trim())
        .filter(Boolean)
    );
    const currentMembers = factionMemberStats(log, target).filter((s) =>
      currentNames.has(s.name)
    );
    return latestUnitsByBranch(currentMembers);
  }, [db, log, name]);

  const tags = (
    <>
      {outcomes.length > 0 && (
        <span className="tag">{outcomes.length}戦</span>
      )}
    </>
  );

  return (
    <DetailPage
      kind="国"
      title={name}
      titleColor={factionNameStyle(name, colors)?.color as string | undefined}
      tags={tags}
      onBack={onBack}
    >
      {outcomes.length === 0 && members.length === 0 ? (
        <DetailEmptyState
          title="この国のデータがありません"
          hint={
            <>
              「{name}」が登場する戦闘履歴・所属武将が見つかりませんでした。
              「戦闘履歴」タブで戦績を登録すると、勝率や主力兵種がここに表示されます。
            </>
          }
        />
      ) : (
        <>
          {outcomes.length > 0 && (
            <DetailSummary summary={summary} />
          )}

          {canViewLatestUnits && (
            <LatestUnitsSection
              groups={currentLatestUnits}
              onSelectUnit={onSelectUnit}
            />
          )}

          <FactionMembers
            members={members}
            onSelectWarlord={onSelectWarlord}
            onSelectUnit={onSelectUnit}
          />

          {outcomes.length > 0 && (
            <>
              <BranchWinRates branches={branches} />

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
        </>
      )}
    </DetailPage>
  );
}

function LatestUnitsSection({
  groups,
  onSelectUnit,
}: {
  groups: ReturnType<typeof latestUnitsByBranch>;
  onSelectUnit: (name: string) => void;
}) {
  const [reportCopied, setReportCopied] = useState<"idle" | "ok" | "fail">(
    "idle"
  );

  const reportText = useMemo(
    () =>
      groups
        .map(
          (group) =>
            `【${group.branch}】${group.units
              .map((unit) => `${unit.unit}: ${unit.count.toLocaleString("ja-JP")}`)
              .join("、")}`
        )
        .join("\n"),
    [groups]
  );

  const handleCopyReport = async () => {
    if (!reportText) return;
    const ok = await copyText(reportText);
    setReportCopied(ok ? "ok" : "fail");
    window.setTimeout(() => setReportCopied("idle"), 1800);
  };

  return (
    <Section title="現在の主力兵種" mobileCollapsed>
      <p className="detail-note muted">
        現在この国に所属する武将が、最後に使っていた兵種の一覧です。
      </p>
      {groups.length === 0 ? (
        <p className="muted">
          現所属の武将に、兵種付きの戦闘データがまだありません。
        </p>
      ) : (
        <>
          <ul className="latest-units">
            {groups.map((group) => (
              <li key={group.branch} className="latest-units-row">
                <div className="latest-units-branch">
                  <span>{group.branch}</span>
                  <span className="latest-units-total">
                    {group.total.toLocaleString("ja-JP")}人
                  </span>
                </div>
                <div className="latest-units-units">
                  {group.units.map((entry) => (
                    <button
                      key={`${group.branch}:${entry.unit}`}
                      type="button"
                      className="latest-unit-chip"
                      onClick={() => onSelectUnit(entry.unit)}
                      title={`${entry.unit} の詳細を見る`}
                    >
                      <span className="latest-unit-name">{entry.unit}</span>
                      <span className="latest-unit-count">
                        {entry.count.toLocaleString("ja-JP")}
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="scout-report">
            <div className="scout-report-head">
              <span className="scout-report-title">連絡用テキスト</span>
              <button
                type="button"
                className="btn"
                onClick={handleCopyReport}
                disabled={!reportText}
              >
                {reportCopied === "ok"
                  ? "コピーしました"
                  : reportCopied === "fail"
                    ? "コピーできませんでした"
                    : "連絡用をコピー"}
              </button>
            </div>
            <textarea
              className="scout-report-text"
              readOnly
              value={reportText}
              rows={Math.max(2, groups.length)}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </>
      )}
    </Section>
  );
}

/* ---------- 所属武将一覧 ---------- */

/** 所属武将一覧で最初に表示する人数（これを超える分は「もっと見る」で展開）。 */
const INITIAL_MEMBERS = 8;

function FactionMembers({
  members,
  onSelectWarlord,
  onSelectUnit,
}: {
  members: MemberRow[];
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (members.length === 0) return null;
  const shown = expanded ? members : members.slice(0, INITIAL_MEMBERS);
  const hiddenCount = members.length - shown.length;
  return (
    <Section title="所属武将" count={`${members.length}人`} mobileCollapsed>
      <p className="detail-note muted">
        勝率は各武将がこの国に在籍していた期間の戦績です。兵種は過去10年間に
        この国で使ったものを多い順に表示します。
      </p>
      <ul className="user-winrate-list">
        {shown.map((m) => {
          const s = m.stat;
          const decided = s?.decided ?? 0;
          const pct = decided > 0 ? Math.round((s!.winRate) * 100) : 0;
          return (
            <li key={m.name} className="user-winrate-row">
              <div className="user-winrate-head">
                <button
                  type="button"
                  className="user-winrate-name link-like"
                  onClick={() => onSelectWarlord(m.name)}
                  title={`${m.name} の戦績を見る`}
                >
                  {m.name}
                </button>
                <span className="user-winrate-meta">
                  {s ? (
                    <>
                      <span className="user-winrate-rate">
                        {formatWinRate(s.winRate, s.decided)}
                      </span>
                      <span className="muted">
                        {s.wins}勝{s.losses}敗（{s.battles}戦）
                      </span>
                    </>
                  ) : (
                    <span className="muted">戦績なし</span>
                  )}
                </span>
              </div>
              <span
                className="branch-bar"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${m.name} の勝率 ${pct}%`}
              >
                <span
                  className="branch-bar-fill"
                  style={{ width: `${decided > 0 ? pct : 0}%` }}
                />
              </span>
              {m.unitTrend && m.unitTrend.units.length > 0 && (
                <div className="member-units">
                  {m.unitTrend.units.slice(0, 4).map((u) => (
                    <button
                      key={u.unit}
                      type="button"
                      className="member-unit-chip"
                      onClick={() => onSelectUnit(u.unit)}
                      title={`${u.unit} の詳細を見る`}
                    >
                      <span className="member-unit-name">{u.unit}</span>
                      <span className="member-unit-count">{u.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {members.length > INITIAL_MEMBERS && (
        <div className="show-more-row">
          <button
            type="button"
            className="btn show-more-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "一部だけ表示" : `もっと見る（残り${hiddenCount}人）`}
          </button>
        </div>
      )}
    </Section>
  );
}
