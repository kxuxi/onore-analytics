"use client";

import {
  useEffect,
  useId,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { BattleRecord } from "@/lib/types";
import {
  extractBattleUrl,
  isSpecialToken,
  normalizeDisplayToken,
  type BattleCard,
  type BattleSide,
} from "@/lib/parser";
import {
  DEFAULT_WIN_LEFT,
  DEFAULT_WIN_RIGHT,
  factionNameStyle,
  resolveFactionColor,
  type FactionColorMap,
} from "@/lib/factionColors";
import { copyText } from "@/lib/copyText";
import { AntiArrows } from "@/components/AntiArrows";
import {
  CheckIcon,
  ChevronDown,
  ChevronUp,
  CopyIcon,
  ExternalLinkIcon,
  TrashIcon,
  TrophyIcon,
} from "@/components/icons";

export interface BattleHistoryCardProps {
  record: BattleRecord;
  card: BattleCard | null;
  factionColors: FactionColorMap;
  highlight: string;
  antiIndex: Map<string, Set<string>>;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onDelete: (id: number) => Promise<void>;
  canDelete?: boolean;
}

interface SideTag {
  text: string;
  kind: "unit" | "branch" | "equip";
  highlight: boolean;
}

/** 兵種名、兵種タイプ、品物、武器を既存の表示順で返す。 */
function buildSideTags(side: BattleSide): SideTag[] {
  const tags: SideTag[] = [];
  if (side.unit) {
    tags.push({
      text: normalizeDisplayToken(side.unit),
      kind: "unit",
      highlight: false,
    });
  }
  if (side.branch) {
    tags.push({
      text: side.branch,
      kind: "branch",
      highlight: false,
    });
  }
  for (const equipment of side.equips) {
    tags.push({
      text: normalizeDisplayToken(equipment),
      kind: "equip",
      highlight: isSpecialToken(equipment),
    });
  }
  return tags;
}

/** 検索語に一致する部分を、大文字小文字を区別せず強調する。 */
function highlightMatch(text: string, query: string): ReactNode {
  const normalizedQuery = normalizeDisplayToken(query);
  if (!normalizedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const fragments: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      fragments.push(text.slice(cursor));
      break;
    }
    if (matchIndex > cursor) {
      fragments.push(text.slice(cursor, matchIndex));
    }
    fragments.push(
      <mark key={key++} className="bh-highlight">
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>
    );
    cursor = matchIndex + normalizedQuery.length;
  }

  return fragments;
}

interface DisplayBattleTime {
  gameMonth?: string;
  realDateTime?: string;
  raw?: string;
}

/**
 * 「1720年1月 07/16 20:08」をゲーム内年月と実日時へ分ける。
 * 形式が異なる値は加工せず、そのまま表示して情報を失わない。
 */
function splitDisplayBattleTime(
  value: string | undefined
): DisplayBattleTime | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d+\s*年\s*\d+\s*月)(?:\s+(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}))?$/
  );
  if (!match) return { raw: trimmed };
  return {
    gameMonth: match[1],
    realDateTime: match[2],
  };
}

function sideTagsMatchQuery(tags: readonly SideTag[], query: string): boolean {
  const normalizedQuery = normalizeDisplayToken(query).toLowerCase();
  return (
    normalizedQuery !== "" &&
    tags.some((tag) => tag.text.toLowerCase().includes(normalizedQuery))
  );
}

function RawBattleHistoryCard({
  record,
  highlight,
}: Pick<BattleHistoryCardProps, "record" | "highlight">) {
  const { url } = extractBattleUrl(record.line);

  return (
    <li className="bh-card bh-card--raw">
      {record.time && <span className="bh-time">{record.time}</span>}
      <span className="bh-raw-line">
        {highlightMatch(record.line, highlight)}
      </span>
      {url && (
        <a
          className="bh-raw-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon />
          <span>詳細を見る</span>
        </a>
      )}
    </li>
  );
}

export function BattleHistoryCard({
  record,
  card,
  factionColors,
  highlight,
  antiIndex,
  onSelectWarlord,
  onSelectUnit,
  onDelete,
  canDelete = false,
}: BattleHistoryCardProps) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const detailsId = `battle-history-details-${useId()}`;
  const leftTags = card ? buildSideTags(card.left) : [];
  const rightTags = card ? buildSideTags(card.right) : [];
  const detailsMatchQuery =
    sideTagsMatchQuery(leftTags, highlight) ||
    sideTagsMatchQuery(rightTags, highlight);

  useEffect(() => {
    if (detailsMatchQuery) {
      setDetailsExpanded(true);
    }
  }, [detailsMatchQuery, highlight]);

  if (!card) {
    return <RawBattleHistoryCard record={record} highlight={highlight} />;
  }

  const leftColor = resolveFactionColor(
    card.left.faction,
    DEFAULT_WIN_LEFT,
    factionColors
  );
  const rightColor = resolveFactionColor(
    card.right.faction,
    DEFAULT_WIN_RIGHT,
    factionColors
  );
  const resultLabel =
    card.winner === "left"
      ? "出兵側の勝利"
      : card.winner === "right"
        ? "守備側の勝利"
        : card.winner === "draw"
          ? "引分"
          : card.winner === "retreat"
            ? "撤退"
            : card.resultRaw;
  const displayTime = card.battleAt ?? record.time;
  const displayBattleTime = splitDisplayBattleTime(displayTime);
  const matchupLabel = `${card.left.name} 対 ${card.right.name}`;
  const hasActions = Boolean(card.url || canDelete);
  const hasContext = Boolean(card.battleNo || card.place || card.turns);
  const hasTeamDetails = leftTags.length > 0 || rightTags.length > 0;
  const hasDecidedWinner =
    card.winner === "left" || card.winner === "right";

  const openUrl = () => {
    if (card.url) {
      window.open(card.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleCardClick = (event: MouseEvent<HTMLLIElement>) => {
    if (!card.url) return;
    const target = event.target;
    if (target instanceof Element && target.closest("a, button")) return;
    openUrl();
  };

  const copyLink = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!card.url) return;

    const copiedSuccessfully = await copyText(card.url);
    if (copiedSuccessfully) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!record.id) return;
    if (
      !window.confirm(
        "この戦闘履歴を削除してよろしいですか？（取り消せません）"
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      await onDelete(record.id);
    } catch {
      window.alert("削除に失敗しました。もう一度お試しください。");
    } finally {
      setDeleting(false);
    }
  };

  const renderSideSummary = (
    side: BattleSide,
    sideLabel: "出兵側" | "守備側",
    sideClass: "attacker" | "defender",
    color: string,
    isWinner: boolean
  ) => {
    const sideOutcome = isWinner
      ? "winner"
      : hasDecidedWinner
        ? "loser"
        : null;

    return (
      <div
        className={[
          "bh-side",
          `bh-side--${sideClass}`,
          sideOutcome ? `bh-side--${sideOutcome}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="group"
        aria-label={`${sideLabel}：${side.name}${
          sideOutcome === "winner"
            ? "、勝者"
            : sideOutcome === "loser"
              ? "、敗者"
              : ""
        }`}
        style={{
          borderColor: `color-mix(in srgb, ${color} 48%, var(--border))`,
          background: `color-mix(in srgb, ${color} ${
            isWinner ? 12 : 6
          }%, var(--surface-raised))`,
        }}
      >
        <div className="bh-side-head">
          <span className="bh-side-role">{sideLabel}</span>
          {side.faction && (
            <span
              className="bh-faction"
              style={factionNameStyle(side.faction, factionColors)}
            >
              {highlightMatch(side.faction, highlight)}
            </span>
          )}
          {sideOutcome && (
            <span
              className={`bh-side-status bh-side-status--${sideOutcome}`}
            >
              {sideOutcome === "winner" && (
                <TrophyIcon className="bh-winner-icon" />
              )}
              {sideOutcome === "winner" ? "勝者" : "敗者"}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`bh-participant${
            isWinner ? " bh-participant--winner" : ""
          }`}
          style={{
            color: `color-mix(in srgb, ${color} 32%, var(--text))`,
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectWarlord(side.name);
          }}
          title={`${side.name} の戦績を見る`}
        >
          {highlightMatch(side.name, highlight)}
        </button>
      </div>
    );
  };

  const renderTeamDetails = (
    side: BattleSide,
    opponent: BattleSide,
    sideLabel: "出兵側" | "守備側",
    tags: readonly SideTag[]
  ) => (
    <section className="bh-team-details">
      <h4 className="bh-detail-title">{sideLabel}の兵種・装備</h4>
      {tags.length === 0 ? (
        <span className="bh-tags-empty">情報なし</span>
      ) : (
        <div className="bh-tags">
          {tags.map((tag, index) =>
            tag.kind === "unit" ? (
              <span
                key={`${tag.kind}-${tag.text}-${index}`}
                className="bh-unit-group"
              >
                <button
                  type="button"
                  className="bh-tag bh-tag--unit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectUnit(tag.text);
                  }}
                  title={`${tag.text} の戦績を見る`}
                >
                  {highlightMatch(tag.text, highlight)}
                </button>
                <AntiArrows
                  self={side}
                  opponent={opponent}
                  antiIndex={antiIndex}
                />
              </span>
            ) : (
              <span
                key={`${tag.kind}-${tag.text}-${index}`}
                className={[
                  "bh-tag",
                  `bh-tag--${tag.kind}`,
                  tag.highlight ? "bh-tag--highlight" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {highlightMatch(tag.text, highlight)}
              </span>
            )
          )}
        </div>
      )}
    </section>
  );

  return (
    <li
      className={`bh-card${card.url ? " bh-card--link" : ""}`}
      style={{
        borderLeftWidth: 2,
        borderLeftStyle: "solid",
        borderLeftColor: leftColor,
        borderRightWidth: 2,
        borderRightStyle: "solid",
        borderRightColor: rightColor,
      }}
      onClick={card.url ? handleCardClick : undefined}
    >
      {card.url && (
        <a
          className="bh-card-overlay"
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`戦闘ログを開く：${resultLabel}${
            displayTime ? `、${displayTime}` : ""
          }、${matchupLabel}`}
          title="戦闘ログを開く"
        />
      )}

      <header className="bh-primary">
        <div className="bh-primary-summary">
          <div className="bh-outcome">
            <span className={`bh-result bh-result--${card.winner}`}>
              {(card.winner === "left" || card.winner === "right") && (
                <TrophyIcon />
              )}
              {resultLabel}
            </span>
          </div>

          {displayBattleTime && (
            <span className="bh-time-group">
              {displayBattleTime.gameMonth && (
                <time className="bh-time">
                  <span className="bh-time-label">ゲーム内</span>
                  {displayBattleTime.gameMonth}
                </time>
              )}
              {displayBattleTime.realDateTime && (
                <time className="bh-time">
                  <span className="bh-time-label">実日時</span>
                  {displayBattleTime.realDateTime}
                </time>
              )}
              {displayBattleTime.raw && (
                <time className="bh-time">{displayBattleTime.raw}</time>
              )}
            </span>
          )}
        </div>

        {hasActions && (
          <div className="bh-actions">
            {card.url && (
              <button
                type="button"
                className={`bh-action bh-action--copy${
                  copied ? " bh-action--copied" : ""
                }`}
                onClick={copyLink}
                aria-label={
                  copied
                    ? `リンクをコピーしました：${matchupLabel}`
                    : `戦闘ログのリンクをコピー：${matchupLabel}`
                }
                title={copied ? "コピーしました" : "リンクをコピー"}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            )}
            {card.url && (
              <a
                className="bh-action bh-action--open"
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                aria-label={`戦闘ログの詳細を開く：${matchupLabel}`}
                title="戦闘ログの詳細を開く"
              >
                <ExternalLinkIcon />
                <span>詳細</span>
              </a>
            )}
            {canDelete && (
              <button
                type="button"
                className="bh-action bh-action--delete"
                onClick={handleDelete}
                disabled={deleting}
                aria-label={`戦闘履歴を削除：${matchupLabel}`}
                title="戦闘履歴を削除"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        )}

        {card.url && (
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "戦闘ログのリンクをコピーしました" : ""}
          </span>
        )}

        {hasContext && (
          <div className="bh-context" aria-label="戦闘情報">
            {card.battleNo && (
              <span className="bh-battle-number">{card.battleNo}</span>
            )}
            {card.place && (
              <span className="bh-place">
                <span className="bh-context-label">都市</span>
                {card.place}
              </span>
            )}
            {card.turns && (
              <span className="bh-turns">{card.turns}ターン</span>
            )}
          </div>
        )}
      </header>

      <div className="bh-matchup">
        {renderSideSummary(
          card.left,
          "出兵側",
          "attacker",
          leftColor,
          card.winner === "left"
        )}
        <span className="bh-vs" aria-hidden="true">
          対
        </span>
        {renderSideSummary(
          card.right,
          "守備側",
          "defender",
          rightColor,
          card.winner === "right"
        )}
      </div>

      {hasTeamDetails && (
        <>
          <button
            type="button"
            className="bh-disclosure"
            aria-expanded={detailsExpanded}
            aria-controls={detailsId}
            onClick={(event) => {
              event.stopPropagation();
              setDetailsExpanded((expanded) => !expanded);
            }}
          >
            {detailsExpanded ? <ChevronUp /> : <ChevronDown />}
            <span>
              {detailsExpanded
                ? "兵種・装備を閉じる"
                : "兵種・装備を表示"}
            </span>
            {detailsMatchQuery && (
              <span className="bh-disclosure-match">検索一致</span>
            )}
            <span className="sr-only">
              ：{card.left.name} 対 {card.right.name}
            </span>
          </button>

          <div
            id={detailsId}
            className={`bh-secondary${
              detailsExpanded ? " bh-secondary--expanded" : ""
            }`}
            data-expanded={detailsExpanded ? "true" : "false"}
          >
            <div className="bh-team-details-grid">
              {renderTeamDetails(
                card.left,
                card.right,
                "出兵側",
                leftTags
              )}
              {renderTeamDetails(
                card.right,
                card.left,
                "守備側",
                rightTags
              )}
            </div>
          </div>
        </>
      )}
    </li>
  );
}
