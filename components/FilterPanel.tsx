"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { CloseIcon, FilterIcon } from "./icons";

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

export interface FilterPanelProps {
  id: string;
  search: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  toggleActive: boolean;
  hasActiveFilters: boolean;
  onClear: () => void;
  activeFilters?: ActiveFilter[];
  resultText: string;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  children: ReactNode;
}

export function ActiveFilterChips({
  filters,
  clearButtonRef,
  toggleButtonRef,
}: {
  filters: ActiveFilter[];
  clearButtonRef?: RefObject<HTMLButtonElement>;
  toggleButtonRef?: RefObject<HTMLButtonElement>;
}) {
  const chipButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<{
    nextKey?: string;
    previousKey?: string;
  } | null>(null);

  // 解除したボタンがDOMから消えた後も、次の条件をキーボードで続けて解除できるようにする。
  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus) return;
    pendingFocusRef.current = null;

    const nextButton = pendingFocus.nextKey
      ? chipButtonsRef.current.get(pendingFocus.nextKey)
      : undefined;
    const previousButton = pendingFocus.previousKey
      ? chipButtonsRef.current.get(pendingFocus.previousKey)
      : undefined;
    (
      nextButton ??
      previousButton ??
      clearButtonRef?.current ??
      toggleButtonRef?.current
    )?.focus();
  }, [filters, clearButtonRef, toggleButtonRef]);

  if (filters.length === 0) return null;

  return (
    <div
      className="active-filter-chips"
      role="group"
      aria-label="適用中の表示条件"
    >
      {filters.map((filter, index) => (
        <button
          key={filter.key}
          ref={(element) => {
            if (element) chipButtonsRef.current.set(filter.key, element);
            else chipButtonsRef.current.delete(filter.key);
          }}
          type="button"
          className="active-filter-chip"
          onClick={() => {
            pendingFocusRef.current = {
              nextKey: filters[index + 1]?.key,
              previousKey: filters[index - 1]?.key,
            };
            filter.onRemove();
          }}
          aria-label={`${filter.label}: ${filter.value}を解除`}
        >
          <span className="active-filter-label">{filter.label}</span>
          <span className="active-filter-value">{filter.value}</span>
          <CloseIcon />
        </button>
      ))}
    </div>
  );
}

/**
 * 一覧画面の検索・絞り込み操作を同じ順序とアクセシビリティ契約で表示する。
 * フィルターの状態と絞り込みロジックは各画面が所有する。
 */
export function FilterPanel({
  id,
  search,
  expanded,
  onToggle,
  toggleActive,
  hasActiveFilters,
  onClear,
  activeFilters,
  resultText,
  leadingActions,
  trailingActions,
  children,
}: FilterPanelProps) {
  const fieldsId = `${id}-fields`;
  const headingId = `${id}-heading`;
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <section className="filter-panel" aria-labelledby={headingId}>
      <h3 id={headingId} className="sr-only">
        絞り込み
      </h3>

      <div className="search-row filter-panel-toolbar">
        {search}
        {leadingActions}
        <button
          ref={toggleButtonRef}
          type="button"
          className={`btn filter-toggle${toggleActive ? " active" : ""}`}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={fieldsId}
          aria-label={expanded ? "フィルターを閉じる" : "フィルターを開く"}
        >
          <FilterIcon />
          <span>{expanded ? "閉じる" : "フィルター"}</span>
        </button>
        {hasActiveFilters && (
          <button
            ref={clearButtonRef}
            type="button"
            className="btn clear-filters"
            onClick={() => {
              onClear();
              window.requestAnimationFrame(() => {
                (clearButtonRef.current ?? toggleButtonRef.current)?.focus();
              });
            }}
            title="表示条件をすべて解除"
            aria-label="表示条件をすべて解除"
          >
            <CloseIcon />
            <span>条件を解除</span>
          </button>
        )}
        {trailingActions}
      </div>

      <div
        id={fieldsId}
        className="filter-grid filter-panel-fields"
        hidden={!expanded}
      >
        {children}
      </div>

      <div className="filter-panel-summary">
        <ActiveFilterChips
          filters={activeFilters ?? []}
          clearButtonRef={clearButtonRef}
          toggleButtonRef={toggleButtonRef}
        />

        <p
          className="filter-result"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {resultText}
        </p>
      </div>
    </section>
  );
}
