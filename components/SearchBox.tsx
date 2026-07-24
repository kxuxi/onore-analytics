"use client";

import { useCallback, useRef } from "react";
import type {
  AriaAttributes,
  KeyboardEventHandler,
  MutableRefObject,
  Ref,
} from "react";
import { SearchIcon, CloseIcon } from "@/components/icons";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  role?: "combobox" | "searchbox";
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaAutocomplete?: AriaAttributes["aria-autocomplete"];
  ariaActiveDescendant?: string;
  ariaDescribedBy?: string;
}

/** 各タブ共通の検索ボックス。左に虫眼鏡、入力があれば右にクリア（×）ボタンを出す。 */
export function SearchBox({
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  id,
  inputRef,
  onKeyDown,
  role,
  ariaControls,
  ariaExpanded,
  ariaAutocomplete,
  ariaActiveDescendant,
  ariaDescribedBy,
}: SearchBoxProps) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      internalInputRef.current = element;
      if (typeof inputRef === "function") {
        inputRef(element);
      } else if (inputRef) {
        (inputRef as MutableRefObject<HTMLInputElement | null>).current =
          element;
      }
    },
    [inputRef]
  );

  return (
    <div className="search-box">
      <span className="search-icon">
        <SearchIcon />
      </span>
      <input
        id={id}
        ref={setInputRef}
        type="search"
        className="text-input search-input"
        data-search-input=""
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        role={role}
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        aria-autocomplete={ariaAutocomplete}
        aria-activedescendant={ariaActiveDescendant}
        aria-describedby={ariaDescribedBy}
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
      />
      {value !== "" && (
        <button
          type="button"
          className="search-clear"
          onClick={() => {
            onChange("");
            onClear?.();
            internalInputRef.current?.focus();
          }}
          aria-label="検索をクリア"
        >
          <CloseIcon className="search-clear-icon" />
        </button>
      )}
    </div>
  );
}
