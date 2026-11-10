/**
 * 即時に切り替わるボタンのグループ（集計期間・並び順など）。
 * タブではなく、押下状態（aria-pressed）で現在値を伝える。
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  /** グループ（外側）のクラス。ボタンの見た目はこのクラスの子孫セレクタで調整する。 */
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            className={active ? "tmx-period active" : "tmx-period"}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
