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
  latestUpdatedAt: number | null;
  resolvedTheme: ResolvedTheme | null;
  onToggleTheme: () => void;
  refreshing: boolean;
  hydrated: boolean;
  onRefresh: () => void;
  linkCopied: boolean;
  onShareLink: () => void;
}

function formatUpdatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppHeader({
  sidebarId,
  sidebarOpen,
  onToggleSidebar,
  onSelectHome,
  latestUpdatedAt,
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
  const updatedTimePending = latestUpdatedAt == null;

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
            "header-updated muted" + (updatedTimePending ? " is-pending" : "")
          }
          aria-hidden={updatedTimePending ? true : undefined}
          title={
            updatedTimePending
              ? undefined
              : "管理者が最後にデータを登録した日時"
          }
        >
          最終更新{" "}
          {updatedTimePending
            ? "00/00/00 00:00"
            : formatUpdatedAt(latestUpdatedAt)}
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
