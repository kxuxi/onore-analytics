"use client";

import { useMemo } from "react";
import type { WarlordMap } from "@/lib/types";
import type { BattleRecord } from "@/lib/types";
import { lookup, householdAliases } from "@/lib/storage";
import { displayWarlordType } from "@/lib/warlordType";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import {
  collectWarlordBattles,
  summarize,
  unitUsage,
  latestSelfProfile,
  matchupRanking,
  branchStats,
  winHeatmap,
  factionTimeline,
  type YearRankTag,
} from "@/lib/stats";
import { PieChart, chartColor } from "@/components/PieChart";
import { StarIcon } from "@/components/icons";
import { BattleLogList } from "@/components/detail/BattleLogList";
import { useYearRangeFilter, YearRangeFilterBar } from "@/components/detail/YearRangeFilter";
import { Section } from "@/components/detail/Section";
import {
  DetailHeader,
  StatCards,
  WinRateBar,
} from "@/components/detail/DetailParts";
import {
  MatchupRanking,
  BranchWinRates,
  WinHeatmapSection,
  FactionHistory,
  WarlordComment,
  AbilityStats,
} from "@/components/detail/WarlordInsights";

interface Props {
  name: string;
  db: WarlordMap;
  log: BattleRecord[];
  colors: FactionColorMap;
  /** コメント欄（一言コメント）を表示するか。未ログインでは非表示。 */
  canComment: boolean;
  /** 管理者か（ウォッチリスト・戦績カード等の管理者機能の表示可否）。 */
  isAdmin?: boolean;
  /** この武将がウォッチリストに入っているか。 */
  isWatched?: boolean;
  /** ウォッチリストの追加／削除。 */
  onToggleWatch?: (name: string) => void;
  /** 年代別勝率ランキングでの入賞タグ（全期間集計）。 */
  yearRankTags?: YearRankTag[];
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectFaction: (name: string) => void;
  onBack: () => void;
}

export function WarlordDetail({
  name,
  db,
  log,
  colors,
  canComment,
  isAdmin = false,
  isWatched = false,
  onToggleWatch,
  yearRankTags,
  onSelectWarlord,
  onSelectUnit,
  onSelectFaction,
  onBack,
}: Props) {
  const aliases = useMemo(() => householdAliases(db, name), [db, name]);
  const outcomes = useMemo(
    () => collectWarlordBattles(log, name, aliases),
    [log, name, aliases]
  );
  const summary = useMemo(() => summarize(outcomes), [outcomes]);
  // 使用兵種の割合は戦闘ログと同じ年フィルターを共有する。
  const yearFilter = useYearRangeFilter(outcomes);
  const usage = useMemo(() => unitUsage(yearFilter.filtered), [yearFilter.filtered]);
  const ranking = useMemo(() => matchupRanking(outcomes), [outcomes]);
  const branches = useMemo(() => branchStats(outcomes), [outcomes]);
  const heatmap = useMemo(() => winHeatmap(outcomes), [outcomes]);
  const timeline = useMemo(() => factionTimeline(outcomes), [outcomes]);

  // プロフィールは DB を優先し、無ければ直近の戦闘から補完する。
  const dbInfo = lookup(db, name);
  const recent = latestSelfProfile(outcomes);
  const faction = dbInfo?.faction ?? recent?.faction;
  const type = dbInfo?.type ?? recent?.type;
  const branch = dbInfo?.branch ?? recent?.branch;
  const displayType = type
    ? displayWarlordType({
        type,
        power: dbInfo?.power,
        intelligence: dbInfo?.intelligence,
        leadership: dbInfo?.leadership,
        politics: dbInfo?.politics,
      })
    : type;

  const pieData = useMemo(
    () =>
      usage.map((u, i) => ({
        label: u.name,
        value: u.count,
        color: chartColor(i),
      })),
    [usage]
  );
  const usageTotal = usage.reduce((s, u) => s + u.count, 0);

  const tags = (
    <>
      {faction && (
        <button
          type="button"
          className="tag faction faction-link"
          style={factionBadgeStyle(faction, colors)}
          onClick={() => onSelectFaction(faction)}
          title={`${faction} の成績を見る`}
        >
          {faction}
        </button>
      )}
      {displayType && <span className="tag type">{displayType}</span>}
      {branch && <span className="tag branch">{branch}</span>}
      {yearRankTags?.map((t) => (
        <span
          key={t.bucketKey}
          className={`tag year-rank rank-${t.rank}`}
          title={`${t.label}の勝率ランキング 第${t.rank}位（勝率 ${Math.round(
            t.winRate * 100
          )}% / ${t.wins}勝${t.losses}敗）`}
        >
          {t.label} #{t.rank}
        </span>
      ))}
    </>
  );

  return (
    <section className="panel detail-panel">
      <DetailHeader
        kind="武将"
        title={name}
        tags={tags}
        actions={
          isAdmin && onToggleWatch ? (
            <button
              type="button"
              className={"btn detail-watch" + (isWatched ? " active" : "")}
              onClick={() => onToggleWatch(name)}
              aria-pressed={isWatched}
              title={
                isWatched ? "ウォッチリストから外す" : "ウォッチリストに追加"
              }
            >
              <StarIcon filled={isWatched} />
              <span>{isWatched ? "ウォッチ中" : "ウォッチ"}</span>
            </button>
          ) : undefined
        }
        onBack={onBack}
      />

      <AbilityStats warlord={dbInfo} />

      {outcomes.length === 0 ? (
        !dbInfo ? (
          <div className="empty">
            <p className="empty-title">武将が見つかりません</p>
            <p className="empty-hint">
              「{name}」は現在のDB・戦闘履歴のどちらにも見つかりませんでした。
              名前が変更・削除されたか、共有リンクが古い可能性があります。
            </p>
          </div>
        ) : (
          <>
            <div className="empty">
              この武将が登場する戦闘履歴がまだありません。
            </div>
            {canComment && <WarlordComment name={name} />}
          </>
        )
      ) : (
        <>
          <StatCards summary={summary} />
          <WinRateBar summary={summary} />

          <FactionHistory stints={timeline} colors={colors} />

          <MatchupRanking
            ranking={ranking}
            colors={colors}
            onSelectWarlord={onSelectWarlord}
          />

          <BranchWinRates branches={branches} />

          <WinHeatmapSection heatmap={heatmap} />

          {canComment && <WarlordComment name={name} />}

          <Section title="使用兵種の割合" mobileCollapsed>
            {yearFilter.years.length >= 2 && (
              <YearRangeFilterBar {...yearFilter} />
            )}
            <div className="pie-block">
              <PieChart data={pieData} />
              <ul className="pie-legend">
                {usage.map((u, i) => {
                  const pct =
                    usageTotal > 0
                      ? Math.round((u.count / usageTotal) * 100)
                      : 0;
                  return (
                    <li key={u.name} className="pie-legend-item">
                      <span
                        className="pie-dot"
                        style={{ background: chartColor(i) }}
                      />
                      {u.name === "不明" ? (
                        <span className="pie-legend-name muted">不明</span>
                      ) : (
                        <button
                          type="button"
                          className="pie-legend-name link-like"
                          onClick={() => onSelectUnit(u.name)}
                          title={`${u.name} の戦績を見る`}
                        >
                          {u.name}
                        </button>
                      )}
                      <span className="pie-legend-val">
                        {u.count.toLocaleString("ja-JP")}戦 ({pct}%)
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Section>

          <Section
            title="戦闘ログ"
            count={`${yearFilter.filtered.length}件`}
            mobileCollapsed
          >
            <BattleLogList
              outcomes={outcomes}
              currentName={name}
              onSelectWarlord={onSelectWarlord}
              onSelectUnit={onSelectUnit}
              yearFilter={yearFilter}
            />
          </Section>
        </>
      )}
    </section>
  );
}
