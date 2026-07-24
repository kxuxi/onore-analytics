export const STATIC_UNIT_TYPE_LABEL_VALUE = "static" as const;

export const STATIC_UNIT_TYPE_LABEL_SELECTOR =
  `[data-unit-type-label="${STATIC_UNIT_TYPE_LABEL_VALUE}"]`;

type ClosestTarget = EventTarget & Pick<Element, "closest">;

function supportsClosest(target: EventTarget | null): target is ClosestTarget {
  return (
    target !== null &&
    typeof (target as { closest?: unknown }).closest === "function"
  );
}

/** 親が持つ行・カード遷移から、詳細ページのない兵種タイプを除外する。 */
export function isStaticUnitTypeLabelTarget(
  target: EventTarget | null
): boolean {
  return (
    supportsClosest(target) &&
    target.closest(STATIC_UNIT_TYPE_LABEL_SELECTOR) !== null
  );
}
