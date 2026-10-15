"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { formatWinRate, type StatSummary, type unitAntiSummary } from "@/lib/stats";
import { ChevronLeft, ShareIcon, CheckIcon } from "@/components/icons";
import { copyText } from "@/lib/copyText";
import { BattleLogList } from "@/components/detail/BattleLogList";
import { Section } from "@/components/detail/Section";

interface HeaderProps {
  kind: string;
  title: string;
  /** 見出しと外側のランドマークを関連付けるためのID。 */
  headingId?: string;
  /** 見出し（国名など）に適用する文字色。未指定なら既定色。 */
  titleColor?: string;
  tags?: ReactNode;
  actions?: ReactNode;
  onBack: () => void;
}

/** 現在のページURL（ディープリンク）をクリップボードへコピーする共有ボタン。 */
function ShareLinkButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const ok = await copyText(window.location.href);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      type="button"
      className={"btn detail-share" + (copied ? " copied" : "")}
      onClick={share}
      aria-label={
        copied ? "リンクをコピーしました" : "このページのリンクをコピー"
      }
      title={copied ? "コピーしました" : "リンクをコピー"}
    >
      {copied ? <CheckIcon /> : <ShareIcon />}
      <span>{copied ? "コピー済み" : "共有"}</span>
    </button>
  );
}

export function DetailHeader({
  kind,
  title,
  headingId,
  titleColor,
  tags,
  actions,
  onBack,
}: HeaderProps) {
  // 詳細ページへ遷移したら見出しへフォーカスを移す（キーボード／スクリーンリーダー対応）。
  // kind・title が変わるたびに発火し、武将→兵種などの遷移や戻る操作にも追従する。
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [kind, title]);

  return (
    <div className="detail-head">
      <button type="button" className="btn detail-back" onClick={onBack}>
        <ChevronLeft />
        <span>戻る</span>
      </button>
      <div className="detail-title">
        <span className="detail-kind">{kind}</span>
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          style={titleColor ? { color: titleColor } : undefined}
        >
          {title}
        </h2>
        {tags && <div className="detail-tags">{tags}</div>}
      </div>
      <div className="detail-head-actions">
        {actions}
        <ShareLinkButton />
      </div>
    </div>
  );
}

type DetailPageProps = Omit<HeaderProps, "headingId"> & {
  children: ReactNode;
};

/**
 * 詳細画面の共通外枠。見出しとランドマークを関連付けるだけに責務を限定し、
 * 各画面固有の内容・表示順・状態は children としてそのまま保持する。
 */
export function DetailPage({ children, ...headerProps }: DetailPageProps) {
  const headingId = useId();

  return (
    <section
      className="panel detail-panel"
      aria-labelledby={headingId}
    >
      <DetailHeader {...headerProps} headingId={headingId} />
      {children}
    </section>
  );
}

interface DetailLayoutProps extends Omit<DetailPageProps, "children"> {
  profile?: ReactNode;
  summary?: ReactNode;
  emptyState?: ReactNode;
  sections?: ReactNode;
  battleLog?: ReactNode;
  footer?: ReactNode;
}

/** 詳細画面の共通本文レイアウト。ページ固有の内容は名前付きスロットで渡す。 */
export function DetailLayout({
  profile,
  summary,
  emptyState,
  sections,
  battleLog,
  footer,
  ...pageProps
}: DetailLayoutProps) {
  return (
    <DetailPage {...pageProps}>
      {profile}
      {emptyState ?? (
        <>
          {summary}
          {sections}
          {battleLog}
        </>
      )}
      {footer}
    </DetailPage>
  );
}

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

/** 詳細画面で共通の主要戦績。既存のカードと勝敗バーを同じ順序で表示する。 */
interface DetailSummaryProps {
  summary: StatSummary;
  antiSummary?: ReturnType<typeof unitAntiSummary>;
}

export function DetailSummary({ summary, antiSummary }: DetailSummaryProps) {
  const headingId = useId();

  return (
    <section className="detail-summary" aria-labelledby={headingId}>
      <h3 id={headingId} className="detail-summary-title">
        戦績サマリー
      </h3>
      <StatCards summary={summary} />
      <WinRateBar summary={summary} />
      {antiSummary && (
        <>
          <table className="unit-summary-table">
            <caption>アンチ別戦績</caption>
            <thead>
              <tr>
                <th scope="col">条件</th>
                <th scope="col">回数</th>
                <th scope="col">勝敗</th>
                <th scope="col">勝率</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "アンチ", contacts: antiSummary.antiContacts, stats: antiSummary.anti },
                { label: "被アンチ", contacts: antiSummary.antiedContacts, stats: antiSummary.antied },
              ].map(({ label, contacts, stats }) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{contacts.toLocaleString("ja-JP")}</td>
                  <td>
                    <span className="unit-summary-record">
                      <span className="stat-win-text">{stats.wins.toLocaleString("ja-JP")}勝</span>
                      <span className="stat-loss-text">{stats.losses.toLocaleString("ja-JP")}敗</span>
                    </span>
                  </td>
                  <td className="unit-summary-table-rate">{formatWinRate(stats.winRate, stats.decided)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="unit-summary-note">相互アンチは両方に含みます。勝率は撤退・引分を除いて算出。</p>
        </>
      )}
    </section>
  );
}

interface DetailEmptyStateProps {
  title?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}

/** 詳細画面の空状態。文言と追加導線は呼び出し側に残す。 */
export function DetailEmptyState({
  title,
  hint,
  children,
}: DetailEmptyStateProps) {
  return (
    <div className="empty">
      {title != null && <p className="empty-title">{title}</p>}
      {hint != null && <p className="empty-hint">{hint}</p>}
      {children}
    </div>
  );
}

type BattleLogListProps = ComponentProps<typeof BattleLogList>;

interface DetailBattleLogSectionProps extends BattleLogListProps {
  count: number | string;
}

/**
 * 詳細画面共通の戦闘ログSection。強調対象と年フィルターを含む一覧のPropsは
 * 加工せず BattleLogList へ渡す。
 */
export function DetailBattleLogSection({
  count,
  ...battleLogProps
}: DetailBattleLogSectionProps) {
  return (
    <Section title="戦闘ログ" count={count} mobileCollapsed>
      <BattleLogList {...battleLogProps} />
    </Section>
  );
}

export function StatCards({ summary }: Pick<DetailSummaryProps, "summary">) {
  const rate = formatWinRate(summary.winRate, summary.decided);
  return (
    <div className="detail-summary-overview">
      <div className="detail-summary-rate">
        <span>全体勝率</span>
        <strong>{rate}</strong>
      </div>
      <dl className="detail-summary-totals">
        {[
          { label: "戦闘数", value: summary.battles, className: "" },
          { label: "勝利", value: summary.wins, className: "stat-win-text" },
          { label: "敗北", value: summary.losses, className: "stat-loss-text" },
          { label: "撤退・引分", value: summary.others, className: "stat-other-text" },
        ].map(({ label, value, className }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={className}>{value.toLocaleString("ja-JP")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
