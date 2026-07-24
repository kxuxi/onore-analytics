"use client";

import {
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
import { copyText } from "@/lib/clipboard";
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
  const normalizedQuery = query.trim();
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
    card.winner === "draw"
      ? "引分"
      : card.winner === "retreat"
      ? "撤退"
      : card.winner === "unknown"
      ? card.resultRaw
      : "勝利";
  const displayTime = card.battleAt ?? record.time;
  const matchupLabel = `${card.left.name} 対 ${card.right.name}`;
  const hasActions = Boolean(card.url || canDelete);
  const hasContext = Boolean(card.battleNo || card.place || card.turns);

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

  const renderParticipant = (
    side: BattleSide,
    sideLabel: "出兵側" | "守備側",
    color: string,
    isWinner: boolean
  ) => (
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
      <span className="sr-only">{sideLabel}：</span>
      {isWinner && (
        <>
          <TrophyIcon className="bh-winner-icon" />
          <span className="sr-only">勝者：</span>
        </>
      )}
      {highlightMatch(side.name, highlight)}
    </button>
  );

  const renderTeamDetails = (
    side: BattleSide,
    opponent: BattleSide,
    sideLabel: "出兵側" | "守備側"
  ) => (
    <section className="bh-team-details">
      <h4 className="sr-only">
        {sideLabel}・{side.name}の戦闘情報
      </h4>
      {side.faction && (
        <span
          className="bh-faction"
          style={factionNameStyle(side.faction, factionColors)}
        >
          {highlightMatch(side.faction, highlight)}
        </span>
      )}
      <div className="bh-tags">
        {buildSideTags(side).map((tag, index) =>
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
        <div className="bh-outcome">
          <span className={`bh-result bh-result--${card.winner}`}>
            {(card.winner === "left" || card.winner === "right") && (
              <TrophyIcon />
            )}
            {resultLabel}
          </span>
        </div>

        {(displayTime || hasActions) && (
          <div className="bh-primary-meta">
            {displayTime && <time className="bh-time">{displayTime}</time>}
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
          </div>
        )}
      </header>

      <div className="bh-matchup">
        {renderParticipant(
          card.left,
          "出兵側",
          leftColor,
          card.winner === "left"
        )}
        <span className="bh-vs" aria-hidden="true">
          VS
        </span>
        {renderParticipant(
          card.right,
          "守備側",
          rightColor,
          card.winner === "right"
        )}
      </div>

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
          {detailsExpanded ? "戦闘情報を閉じる" : "戦闘情報を表示"}
        </span>
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
        {hasContext && (
          <div className="bh-context">
            {card.battleNo && (
              <span className="bh-battle-number">{card.battleNo}</span>
            )}
            {card.place && <span className="bh-place">{card.place}</span>}
            {card.turns && (
              <span className="bh-turns">{card.turns}ターン</span>
            )}
          </div>
        )}
        <div className="bh-team-details-grid">
          {renderTeamDetails(card.left, card.right, "出兵側")}
          {renderTeamDetails(card.right, card.left, "守備側")}
        </div>
      </div>
    </li>
  );
}
