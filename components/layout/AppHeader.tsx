import type { ResolvedTheme } from "@/lib/theme";
import {
  CheckIcon,
  MoonIcon,
  RefreshIcon,
  ShareIcon,
  SunIcon,
} from "@/components/icons";

interface AppHeaderProps {
  sidebarId: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSelectHome: () => void;
  lastFetchedAt: number | null;
  resolvedTheme: ResolvedTheme | null;
  onToggleTheme: () => void;
  refreshing: boolean;
  hydrated: boolean;
  onRefresh: () => void;
  linkCopied: boolean;
  onShareLink: () => void;
}

function formatFetchTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppHeader({
  sidebarId,
  sidebarOpen,
  onToggleSidebar,
  onSelectHome,
  lastFetchedAt,
  resolvedTheme,
  onToggleTheme,
  refreshing,
  hydrated,
  onRefresh,
  linkCopied,
  onShareLink,
}: AppHeaderProps) {
  const themeActionLabel =
    resolvedTheme === "dark"
      ? "ライトモードに切り替え"
      : "ダークモードに切り替え";
  const fetchTimePending = lastFetchedAt == null;

  return (
    <header className="header">
      <div className="header-left">
        <button
          type="button"
          className="hamburger"
          aria-label={sidebarOpen ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={sidebarOpen}
          aria-controls={sidebarId}
          onClick={onToggleSidebar}
        >
          <span />
          <span />
          <span />
        </button>
        <h1>
          <button
            type="button"
            className="brand-btn"
            onClick={onSelectHome}
            title="ホームへ"
          >
            ONORE ANALYTICS
          </button>
        </h1>
      </div>
      <div className="header-actions">
        <span
          className={
            "header-fetched muted" + (fetchTimePending ? " is-pending" : "")
          }
          aria-hidden={fetchTimePending ? true : undefined}
          title={
            fetchTimePending ? undefined : "共有DBを最後に取得した時刻"
          }
        >
          最終取得{" "}
          {fetchTimePending ? "00:00" : formatFetchTime(lastFetchedAt)}
        </span>
        <button
          type="button"
          className="btn header-theme"
          onClick={onToggleTheme}
          aria-label={themeActionLabel}
          title={themeActionLabel}
        >
          {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className={"btn header-refresh" + (refreshing ? " is-refreshing" : "")}
          onClick={onRefresh}
          disabled={refreshing || !hydrated}
          aria-label="共有DBを最新に更新"
          title="共有DBを最新に更新"
        >
          <RefreshIcon />
          <span>{refreshing ? "更新中…" : "更新"}</span>
        </button>
        <button
          type="button"
          className={"btn header-share" + (linkCopied ? " copied" : "")}
          onClick={onShareLink}
          aria-label={
            linkCopied ? "リンクをコピーしました" : "このページのリンクをコピー"
          }
          title={linkCopied ? "コピーしました" : "リンクをコピー"}
        >
          {linkCopied ? <CheckIcon /> : <ShareIcon />}
          <span>{linkCopied ? "コピー済み" : "共有"}</span>
        </button>
      </div>
    </header>
  );
}
