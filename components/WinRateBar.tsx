import type { StatSummary } from "@/lib/stats";

export function WinRateBar({ summary }: { summary: StatSummary }) {
  const { wins, losses, decided } = summary;
  const winPct = decided > 0 ? (wins / decided) * 100 : 0;
  const lossPct = decided > 0 ? (losses / decided) * 100 : 0;
  return (
    <div
      className="wr-bar"
      role="img"
      aria-label={`勝率 ${decided > 0 ? Math.round(winPct) : 0}%`}
    >
      <div className="wr-win" style={{ width: `${winPct}%` }} />
      <div className="wr-loss" style={{ width: `${lossPct}%` }} />
    </div>
  );
}
