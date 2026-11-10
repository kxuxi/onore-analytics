import type { ReactNode } from "react";

/**
 * データが無いとき・絞り込みで0件のときの空状態。
 * 文言と追加導線（ボタンなど）は呼び出し側が持つ。
 */
export function EmptyState({
  title,
  hint,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {title != null && <p className="empty-title">{title}</p>}
      {hint != null && <p className="empty-hint">{hint}</p>}
      {children}
    </div>
  );
}
