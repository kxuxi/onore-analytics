import type { BattleSide } from "@/lib/parser";
import { unitCountersBranch } from "@/lib/stats";

interface Props {
  /** 矢印を表示する側。 */
  self: BattleSide;
  /** 相手側（アンチ判定に使う）。 */
  opponent: BattleSide;
  /** 兵種 → 得意兵種 の索引（useAntiIndex で取得）。 */
  antiIndex: Map<string, Set<string>>;
}

/**
 * 兵種名の横に出すアンチ矢印。
 * - 赤い ↑：自分の兵種が相手の兵種にアンチ（有利＝アンチを取っている）。
 * - 青い ↓：相手の兵種が自分の兵種にアンチ（不利＝アンチを取られている）。
 * 取り合い（相互アンチ）のときは上下どちらも表示する。
 */
export function AntiArrows({ self, opponent, antiIndex }: Props) {
  const takesAnti = unitCountersBranch(self.unit, opponent.branch, antiIndex);
  const isAntied = unitCountersBranch(opponent.unit, self.branch, antiIndex);
  if (!takesAnti && !isAntied) return null;
  return (
    <span className="anti-arrows">
      {takesAnti && (
        <span
          className="anti-arrow anti-arrow--up"
          role="img"
          title="アンチを取っている（有利）"
          aria-label="アンチを取っている"
        >
          ↑
        </span>
      )}
      {isAntied && (
        <span
          className="anti-arrow anti-arrow--down"
          role="img"
          title="アンチを取られている（不利）"
          aria-label="アンチを取られている"
        >
          ↓
        </span>
      )}
    </span>
  );
}
