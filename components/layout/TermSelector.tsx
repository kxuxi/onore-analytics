import type { SelectedTerm } from "@/lib/termSelection";

interface TermSelectorProps {
  selectedTerm: SelectedTerm;
  selectedDecade: number | null;
  termDecades: number[];
  termsInSelectedDecade: number[];
  latestTerm: number;
  isAdmin: boolean;
  showNewTermInput: boolean;
  newTermValue: string;
  onSelectTerm: (term: number | "all") => void;
  onSelectDecade: (decade: number) => void;
  onToggleNewTermInput: () => void;
  onChangeNewTermValue: (value: string) => void;
  onSubmitNewTerm: () => void;
  onCancelNewTerm: () => void;
}

export function TermSelector({
  selectedTerm,
  selectedDecade,
  termDecades,
  termsInSelectedDecade,
  latestTerm,
  isAdmin,
  showNewTermInput,
  newTermValue,
  onSelectTerm,
  onSelectDecade,
  onToggleNewTermInput,
  onChangeNewTermValue,
  onSubmitNewTerm,
  onCancelNewTerm,
}: TermSelectorProps) {
  return (
    <div className="sidebar-term">
      <label className="sidebar-term-label" htmlFor="sidebar-decade-select">
        対象の期
      </label>
      <div className="sidebar-term-row">
        <select
          id="sidebar-decade-select"
          className="select sidebar-term-select"
          value={selectedTerm === "all" ? "all" : String(selectedDecade)}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "all") onSelectTerm("all");
            else onSelectDecade(Number(value));
          }}
        >
          <option value="all">すべての期</option>
          {termDecades.map((decade) => (
            <option key={decade} value={String(decade)}>
              {decade}期台
            </option>
          ))}
        </select>
        {isAdmin && (
          <button
            type="button"
            className={
              "btn sidebar-term-new-btn" +
              (showNewTermInput ? " active" : "")
            }
            title="リストにない期番号を入力して切り替える"
            onClick={onToggleNewTermInput}
          >
            新期
          </button>
        )}
      </div>

      {selectedDecade != null && (
        <div
          className="sidebar-term-terms"
          role="group"
          aria-label={`${selectedDecade}期台の期`}
        >
          {termsInSelectedDecade.map((term) => (
            <button
              key={term}
              type="button"
              className={
                "term-chip term-chip-sm" +
                (selectedTerm === term ? " active" : "")
              }
              aria-pressed={selectedTerm === term}
              onClick={() => onSelectTerm(term)}
            >
              {term}期
              {term === latestTerm && (
                <span className="term-chip-latest">今</span>
              )}
            </button>
          ))}
        </div>
      )}

      {showNewTermInput && (
        <div
          className="sidebar-new-term"
          role="group"
          aria-label="新しい期の追加"
        >
          <div className="sidebar-new-term-field">
            <input
              id="sidebar-new-term-input"
              type="number"
              className="input sidebar-new-term-input"
              value={newTermValue}
              min={1}
              placeholder="例: 146"
              aria-label="追加する期番号"
              onChange={(event) => onChangeNewTermValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSubmitNewTerm();
              }}
            />
            <span className="sidebar-new-term-unit">期</span>
          </div>
          <div className="sidebar-new-term-actions">
            <button
              type="button"
              className="btn btn-danger sidebar-new-term-ok"
              onClick={onSubmitNewTerm}
            >
              追加
            </button>
            <button
              type="button"
              className="btn sidebar-new-term-cancel"
              onClick={onCancelNewTerm}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
