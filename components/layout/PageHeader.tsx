import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * 一覧・分析・管理画面で共通利用するページ見出し。
 *
 * アプリ名が全体の h1 なので、各表示画面の見出しは h2 に統一する。
 * 補足情報と操作を見出しから分離し、狭い画面では自然に縦積みにする。
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  const classes = ["page-header", className].filter(Boolean).join(" ");

  return (
    <header className={classes}>
      <div className="page-header-copy">
        <div className="page-header-title-row">
          <h2 className="page-header-title">{title}</h2>
          {meta && <div className="page-header-meta">{meta}</div>}
        </div>
        {description && (
          <div className="page-header-description">{description}</div>
        )}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
