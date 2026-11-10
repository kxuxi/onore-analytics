/**
 * 一覧の一部だけを表示し、残りを開閉するボタン。
 * 呼び出し側は「残り何件か」と開閉状態を持ち、ここは文言と並びだけを揃える。
 */
export function ShowMoreButton({
  hiddenCount,
  unit,
  expanded,
  onToggle,
}: {
  /** 閉じているときに隠れている件数。 */
  hiddenCount: number;
  /** 件数の単位（人・件・種・兵種など）。 */
  unit: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="show-more-row">
      <button
        type="button"
        className="btn show-more-btn"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {expanded
          ? "一部だけ表示"
          : `残り${hiddenCount.toLocaleString("ja-JP")}${unit}を表示`}
      </button>
    </div>
  );
}
