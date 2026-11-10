import { formatWinRate, type StatSummary } from "@/lib/stats";
import { WinRateBar } from "@/components/WinRateBar";

/**
 * 出兵・守備のどちらか一方の勝率タイル（勝率 / N勝M敗・N戦 / 勝敗バー）。
 * ホームの自分の武将と武将詳細で同じ並びにする。大きさは className で変える。
 */
export function SideWinRate({
  title,
  summary,
  emptyText = "戦闘なし",
  headingLevel = "h4",
  className,
}: {
  title: string;
  summary: StatSummary;
  emptyText?: string;
  headingLevel?: "h3" | "h4";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div className={["side-wr", className].filter(Boolean).join(" ")}>
      <Heading className="side-wr-title">{title}</Heading>
      {summary.battles === 0 ? (
        <p className="side-wr-empty muted">{emptyText}</p>
      ) : (
        <>
          <div className="side-wr-rate">
            {formatWinRate(summary.winRate, summary.decided)}
          </div>
          <div className="side-wr-meta muted">
            {summary.wins.toLocaleString("ja-JP")}勝{" "}
            {summary.losses.toLocaleString("ja-JP")}敗・
            {summary.battles.toLocaleString("ja-JP")}戦
          </div>
          <WinRateBar summary={summary} />
        </>
      )}
    </div>
  );
}
