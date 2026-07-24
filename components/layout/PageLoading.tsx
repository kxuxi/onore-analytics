type PageLoadingProps = {
  announce?: boolean;
};

export function PageLoading({ announce = true }: PageLoadingProps) {
  return (
    <div
      className="panel page-loading"
      aria-busy="true"
      aria-live={announce ? "polite" : undefined}
    >
      <span className="sr-only">読み込み中…</span>
      <div aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton-grid">
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
        </div>
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line skeleton-line--80" />
        <div className="skeleton skeleton-line skeleton-line--60" />
      </div>
    </div>
  );
}
