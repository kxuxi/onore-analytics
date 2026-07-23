export type SelectedTerm = number | "all" | null;

export const FALLBACK_TERM = 145;
export const TERM_OPTIONS_STORAGE_KEY = "onore-tool:term-options:v1";
export const TERM_SELECTED_STORAGE_KEY = "onore-tool:selected-term:v1";

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function parseStoredTermOptions(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((value) => Number(value))
          .filter(isPositiveInteger)
      )
    ).sort((a, b) => b - a);
  } catch {
    return [];
  }
}

export function parseStoredSelectedTerm(raw: string | null): SelectedTerm {
  if (raw === "all") return "all";
  if (raw === null) return null;
  const term = Number(raw);
  return isPositiveInteger(term) ? term : null;
}

export function mergeTermOptions(
  serverTerms: number[],
  manuallyAddedTerms: number[]
): number[] {
  return Array.from(new Set([...manuallyAddedTerms, ...serverTerms])).sort(
    (a, b) => b - a
  );
}

export function includeSelectedTerm(
  termOptions: number[],
  selectedTerm: SelectedTerm
): number[] {
  if (
    selectedTerm === "all" ||
    selectedTerm === null ||
    termOptions.includes(selectedTerm)
  ) {
    return termOptions;
  }
  return [selectedTerm, ...termOptions].sort((a, b) => b - a);
}

export function decadeOf(term: number): number {
  return Math.floor(term / 10) * 10;
}

export function collectTermDecades(termOptions: number[]): number[] {
  return Array.from(new Set(termOptions.map(decadeOf))).sort((a, b) => b - a);
}

export function termsInDecade(
  termOptions: number[],
  decade: number | null
): number[] {
  if (decade === null) return [];
  return termOptions.filter((term) => decadeOf(term) === decade);
}
