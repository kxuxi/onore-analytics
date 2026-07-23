"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FALLBACK_TERM,
  TERM_OPTIONS_STORAGE_KEY,
  TERM_SELECTED_STORAGE_KEY,
  collectTermDecades,
  decadeOf,
  includeSelectedTerm,
  mergeTermOptions,
  parseStoredSelectedTerm,
  parseStoredTermOptions,
  termsInDecade,
  type SelectedTerm,
} from "./termSelection";

export interface TermSelectionState {
  latestTerm: number;
  termOptionsWithSelected: number[];
  termDecades: number[];
  selectedDecade: number | null;
  termsInSelectedDecade: number[];
  addManualTerm: (term: number) => void;
  selectDecade: (decade: number) => void;
}

export function useTermSelection(
  serverTerms: number[],
  selectedTerm: SelectedTerm,
  setSelectedTerm: (term: SelectedTerm) => void
): TermSelectionState {
  const [manualTerms, setManualTerms] = useState<number[]>([]);
  const [hasRestoredManualTerms, setHasRestoredManualTerms] = useState(false);
  const [hasRestoredSelection, setHasRestoredSelection] = useState(false);

  useEffect(() => {
    try {
      setManualTerms(
        parseStoredTermOptions(
          window.localStorage.getItem(TERM_OPTIONS_STORAGE_KEY)
        )
      );
    } catch {
      // localStorage が利用できない場合はサーバー取得分だけで続行する。
    } finally {
      setHasRestoredManualTerms(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredManualTerms) return;
    try {
      window.localStorage.setItem(
        TERM_OPTIONS_STORAGE_KEY,
        JSON.stringify(manualTerms)
      );
    } catch {
      // 保存できない環境でも現在の選択は維持する。
    }
  }, [hasRestoredManualTerms, manualTerms]);

  const termOptions = useMemo(
    () => mergeTermOptions(serverTerms, manualTerms),
    [serverTerms, manualTerms]
  );
  const latestTerm = termOptions[0] ?? FALLBACK_TERM;

  useEffect(() => {
    if (hasRestoredSelection) return;
    try {
      const storedTerm = parseStoredSelectedTerm(
        window.localStorage.getItem(TERM_SELECTED_STORAGE_KEY)
      );
      if (storedTerm !== null) {
        setSelectedTerm(storedTerm);
        setHasRestoredSelection(true);
        return;
      }
    } catch {
      // 復元できない場合は最新期を選ぶ。
    }
    if (termOptions.length > 0) {
      setSelectedTerm(latestTerm);
      setHasRestoredSelection(true);
    }
  }, [
    hasRestoredSelection,
    latestTerm,
    setSelectedTerm,
    termOptions.length,
  ]);

  useEffect(() => {
    if (!hasRestoredSelection || selectedTerm === null) return;
    try {
      window.localStorage.setItem(
        TERM_SELECTED_STORAGE_KEY,
        selectedTerm === "all" ? "all" : String(selectedTerm)
      );
    } catch {
      // 保存できない環境でも現在の選択は維持する。
    }
  }, [hasRestoredSelection, selectedTerm]);

  const termOptionsWithSelected = useMemo(
    () => includeSelectedTerm(termOptions, selectedTerm),
    [termOptions, selectedTerm]
  );
  const termDecades = useMemo(
    () => collectTermDecades(termOptionsWithSelected),
    [termOptionsWithSelected]
  );
  const selectedDecade =
    selectedTerm === "all" || selectedTerm === null
      ? null
      : decadeOf(selectedTerm);
  const termsInSelectedDecade = useMemo(
    () => termsInDecade(termOptionsWithSelected, selectedDecade),
    [selectedDecade, termOptionsWithSelected]
  );

  const addManualTerm = useCallback((term: number) => {
    setManualTerms((currentTerms) =>
      currentTerms.includes(term)
        ? currentTerms
        : [...currentTerms, term].sort((a, b) => b - a)
    );
  }, []);

  const selectDecade = useCallback(
    (decade: number) => {
      const matchingTerms = termsInDecade(termOptionsWithSelected, decade);
      if (matchingTerms.length > 0) setSelectedTerm(matchingTerms[0]);
    },
    [setSelectedTerm, termOptionsWithSelected]
  );

  return {
    latestTerm,
    termOptionsWithSelected,
    termDecades,
    selectedDecade,
    termsInSelectedDecade,
    addManualTerm,
    selectDecade,
  };
}
