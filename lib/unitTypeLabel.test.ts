import { describe, expect, it, vi } from "vitest";
import {
  isStaticUnitTypeLabelTarget,
  STATIC_UNIT_TYPE_LABEL_SELECTOR,
} from "./unitTypeLabel";

describe("isStaticUnitTypeLabelTarget", () => {
  it("兵種タイプ自身とその子要素を親ナビゲーションから除外する", () => {
    const closest = vi.fn().mockReturnValue({});

    expect(
      isStaticUnitTypeLabelTarget({ closest } as unknown as EventTarget)
    ).toBe(true);
    expect(closest).toHaveBeenCalledWith(STATIC_UNIT_TYPE_LABEL_SELECTOR);
  });

  it("兵種タイプ外とDOM要素でない対象は除外しない", () => {
    expect(
      isStaticUnitTypeLabelTarget({
        closest: vi.fn().mockReturnValue(null),
      } as unknown as EventTarget)
    ).toBe(false);
    expect(isStaticUnitTypeLabelTarget(new EventTarget())).toBe(false);
    expect(isStaticUnitTypeLabelTarget(null)).toBe(false);
  });
});
