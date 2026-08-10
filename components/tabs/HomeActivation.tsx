"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { HistoryIcon, TrophyIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { moveHomeSuggestionIndex } from "./homeSearch";

const SEARCH_INPUT_ID = "home-warlord-search";
const SEARCH_HINT_ID = "home-warlord-search-hint";
const SEARCH_STATUS_ID = "home-warlord-search-status";
const SUGGESTION_LIST_ID = "home-warlord-suggestions";

export function HomeWarlordSearch({
  query,
  suggestions,
  inputRef,
  onQueryChange,
  onChoose,
}: {
  query: string;
  suggestions: string[];
  inputRef: RefObject<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onChoose: (name: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const hasQuery = query.trim() !== "";
  const hasSuggestions = hasQuery && suggestions.length > 0;
  const validActiveIndex =
    activeIndex >= 0 && activeIndex < suggestions.length ? activeIndex : -1;
  const activeOptionId =
    hasSuggestions && validActiveIndex >= 0
      ? `${SUGGESTION_LIST_ID}-${validActiveIndex}`
      : undefined;
  const describedBy = hasQuery
    ? `${SEARCH_HINT_ID} ${SEARCH_STATUS_ID}`
    : SEARCH_HINT_ID;

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    if (validActiveIndex < 0) return;
    optionRefs.current[validActiveIndex]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [validActiveIndex]);

  const changeQuery = (value: string) => {
    setActiveIndex(-1);
    onQueryChange(value);
  };

  const closeSuggestions = () => {
    changeQuery("");
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && hasQuery) {
      event.preventDefault();
      event.stopPropagation();
      closeSuggestions();
      return;
    }
    if (!hasSuggestions) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        moveHomeSuggestionIndex(
          current,
          suggestions.length,
          event.key === "ArrowDown" ? "next" : "previous"
        )
      );
      return;
    }
    if (
      validActiveIndex >= 0 &&
      (event.key === "Home" || event.key === "End")
    ) {
      event.preventDefault();
      setActiveIndex(
        moveHomeSuggestionIndex(
          validActiveIndex,
          suggestions.length,
          event.key === "Home" ? "first" : "last"
        )
      );
      return;
    }
    if (event.key === "Enter" && validActiveIndex >= 0) {
      event.preventDefault();
      onChoose(suggestions[validActiveIndex]);
    }
  };

  return (
    <div className="home-warlord-search">
      <label className="home-search-label" htmlFor={SEARCH_INPUT_ID}>
        自分の武将を検索
      </label>
      <SearchBox
        id={SEARCH_INPUT_ID}
        inputRef={inputRef}
        value={query}
        onChange={changeQuery}
        onKeyDown={handleInputKeyDown}
        placeholder="武将名を入力"
        ariaLabel="自分の武将を検索"
        role="combobox"
        ariaControls={hasSuggestions ? SUGGESTION_LIST_ID : undefined}
        ariaExpanded={hasSuggestions}
        ariaAutocomplete="list"
        ariaActiveDescendant={activeOptionId}
        ariaDescribedBy={describedBy}
      />
      <p id={SEARCH_HINT_ID} className="home-search-hint muted">
        ↑↓キーで候補を選び、Enterキーで決定できます。
      </p>

      <div
        id={SEARCH_STATUS_ID}
        className={
          hasQuery && !hasSuggestions
            ? "home-search-status home-search-empty"
            : "home-search-status muted"
        }
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {hasSuggestions ? (
          `${suggestions.length}件の候補を表示`
        ) : hasQuery ? (
          <>
            <p className="empty-title">
              「{query.trim()}」に一致する武将が見つかりません
            </p>
            <p className="empty-hint muted">
              武将名の表記、またはサイドバーで対象の期を確認してください。
            </p>
          </>
        ) : null}
      </div>

      {hasSuggestions && (
        <>
          <ul
            id={SUGGESTION_LIST_ID}
            className="home-suggest"
            role="listbox"
            aria-label="武将候補"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                id={`${SUGGESTION_LIST_ID}-${index}`}
                className="home-suggest-item"
                role="option"
                aria-selected={validActiveIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onChoose(suggestion)}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function HomeActivation({
  query,
  suggestions,
  inputRef,
  onQueryChange,
  onChoose,
  onSelectRanking,
  onSelectHistory,
}: {
  query: string;
  suggestions: string[];
  inputRef: RefObject<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onChoose: (name: string) => void;
  onSelectRanking?: () => void;
  onSelectHistory?: () => void;
}) {
  const hasExploreActions = Boolean(onSelectRanking || onSelectHistory);

  return (
    <section className="panel home-panel">
      <div className="home-activation">
        <div className="home-activation-hero">
          <div className="home-activation-intro">
            <p className="section-title">ダッシュボード</p>
            <p className="home-activation-description muted">
              武将を選ぶと、ここで確認できます。
            </p>
          </div>

          <div className="home-picker-card">
            <h3 className="home-picker-card-title">自分の武将を選ぶ</h3>
            <p className="home-picker-card-description muted">
              対象の期に登場した武将名で検索してください。
            </p>
            <HomeWarlordSearch
              query={query}
              suggestions={suggestions}
              inputRef={inputRef}
              onQueryChange={onQueryChange}
              onChoose={onChoose}
            />
            <p className="home-picker-privacy muted">
              選択はこのブラウザに保存されます。
            </p>
          </div>
        </div>

        {hasExploreActions && (
          <div className="home-explore">
            <div>
              <h3 className="home-explore-title">武将を選ばずに見る</h3>
              <p className="home-explore-description muted">
                全体の傾向や、最近登録された戦闘から確認できます。
              </p>
            </div>
            <div className="home-explore-actions">
              {onSelectRanking && (
                <button
                  type="button"
                  className="btn home-explore-action"
                  onClick={onSelectRanking}
                >
                  <TrophyIcon />
                  武将ランキングを見る
                </button>
              )}
              {onSelectHistory && (
                <button
                  type="button"
                  className="btn home-explore-action"
                  onClick={onSelectHistory}
                >
                  <HistoryIcon />
                  戦闘履歴を見る
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
