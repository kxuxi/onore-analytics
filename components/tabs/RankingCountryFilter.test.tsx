import {
  isValidElement,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleRecord } from "@/lib/types";
import { MetricsTab } from "./MetricsTab";
import { RankingTab } from "./RankingTab";

function record(line: string, savedAt: number): BattleRecord {
  return {
    line,
    time: line.match(/\d+年\d+月\s+\d+\/\d+\s+\d+:\d+/)?.[0],
    term: 145,
    savedAt,
  };
}

const LOG: BattleRecord[] = [
  record(
    "【1戦目】 1600年4月 06/01 10:00 京都 織田 信長 織田家 武特 騎馬隊 騎兵 金の腕輪 鬼丸 V.S. 武田 勝頼 武田家 統特 足軽隊 歩兵 金の兜 カルバリン砲 信長の勝利 12",
    1
  ),
  record(
    "【1戦目】 1700年4月 06/01 11:00 京都 なし 浪人 浪人家 武特 流浪兵 騎兵 旅笠 木刀 V.S. 上杉 謙信 上杉家 統特 弓兵隊 弓兵 軍配 弓 謙信の勝利 12",
    2
  ),
];

const callbacks = {
  onSelectUnit: vi.fn(),
  onSelectEquip: vi.fn(),
  onSelectWarlord: vi.fn(),
};

const rankingPages: { name: string; element: ReactElement }[] = [
  {
    name: "武将ランキング",
    element: (
      <MetricsTab
        log={LOG}
        onSelectWarlord={callbacks.onSelectWarlord}
      />
    ),
  },
  {
    name: "兵種ランキング",
    element: <RankingTab log={LOG} variant="unit" {...callbacks} />,
  },
  {
    name: "武器ランキング",
    element: <RankingTab log={LOG} variant="weapon" {...callbacks} />,
  },
  {
    name: "品物ランキング",
    element: <RankingTab log={LOG} variant="item" {...callbacks} />,
  },
];

describe.each(rankingPages)("$name の国フィルタ", ({ element }) => {
  it("左右陣営の国を選べ、未所属は候補にしない", () => {
    const markup = renderToStaticMarkup(element);
    const countrySelect = markup.match(
      /<span>国<\/span>\s*<select[^>]*>([\s\S]*?)<\/select>/
    )?.[1];

    expect(countrySelect).toBeDefined();
    expect(countrySelect).toContain(">すべて</option>");
    expect(countrySelect).toContain('<option value="上杉">上杉</option>');
    expect(countrySelect).toContain('<option value="織田">織田</option>');
    expect(countrySelect).toContain('<option value="武田">武田</option>');
    expect(countrySelect).not.toContain('value="なし"');
    expect(countrySelect!.indexOf("上杉")).toBeLessThan(
      countrySelect!.indexOf("織田")
    );
    expect(countrySelect!.indexOf("織田")).toBeLessThan(
      countrySelect!.indexOf("武田")
    );
  });
});

interface InspectedElementProps {
  children?: unknown;
  onChange?: (event: { target: { value: string } }) => void;
  onClick?: () => void;
  row?: { name?: string };
}

function visitElements(
  node: unknown,
  visit: (element: ReactElement<InspectedElementProps>) => void
): void {
  if (Array.isArray(node)) {
    for (const child of node) visitElements(child, visit);
    return;
  }
  if (!isValidElement<InspectedElementProps>(node)) return;
  visit(node);
  visitElements(node.props.children, visit);
}

function findSelect(
  root: ReactElement,
  label: string
): ReactElement<InspectedElementProps> {
  let result: ReactElement<InspectedElementProps> | undefined;
  visitElements(root, (element) => {
    if (result || element.type !== "label") return;
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    const hasLabel = children.some(
      (child) =>
        isValidElement<InspectedElementProps>(child) &&
        child.type === "span" &&
        child.props.children === label
    );
    if (!hasLabel) return;
    result = children.find(
      (child): child is ReactElement<InspectedElementProps> =>
        isValidElement<InspectedElementProps>(child) &&
        child.type === "select"
    );
  });
  if (!result) throw new Error(`${label} select was not found`);
  return result;
}

function findButton(
  root: ReactElement,
  label: string
): ReactElement<InspectedElementProps> {
  let result: ReactElement<InspectedElementProps> | undefined;
  visitElements(root, (element) => {
    if (
      !result &&
      element.type === "button" &&
      element.props.children === label
    ) {
      result = element;
    }
  });
  if (!result) throw new Error(`${label} button was not found`);
  return result;
}

function rankingRowNames(root: ReactElement): Set<string> {
  const names = new Set<string>();
  visitElements(root, (element) => {
    const name = element.props.row?.name;
    if (name) names.add(name);
  });
  return names;
}

function createStateHarness() {
  const values: unknown[] = [];
  let cursor = 0;
  return {
    beginRender() {
      cursor = 0;
    },
    useState<S>(
      initialState: S | (() => S)
    ): [S, Dispatch<SetStateAction<S>>] {
      const index = cursor++;
      if (!(index in values)) {
        values[index] =
          typeof initialState === "function"
            ? (initialState as () => S)()
            : initialState;
      }
      const setState: Dispatch<SetStateAction<S>> = (next) => {
        const current = values[index] as S;
        values[index] =
          typeof next === "function"
            ? (next as (previous: S) => S)(current)
            : next;
      };
      return [values[index] as S, setState];
    },
  };
}

function boundaryLog(): BattleRecord[] {
  const make = (
    year: number,
    day: string,
    hour: number,
    faction: string,
    suffix: string,
    savedAt: number
  ) =>
    record(
      `【1戦目】 ${year}年4月 06/${day} ${hour}:00 京都 ${faction} 境界将${suffix} 境界家 武特 騎馬隊 騎兵 金の腕輪 境界剣 V.S. 敵国 敵${suffix} 敵家 統特 足軽隊 歩兵 金の兜 敵剣 境界将${suffix}の勝利 12`,
      savedAt
    );

  return [
    ...Array.from({ length: 9 }, (_, index) =>
      make(1700, "10", 10 + index, "赤国", `R${index}`, index)
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      make(1700, "11", 10 + index, "青国", `B${index}`, 20 + index)
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      make(1600, "12", 10 + index, "赤国", `O${index}`, 30 + index)
    ),
  ];
}

describe("ランキングUIの期間・国・最低回数", () => {
  it("期間と国で9回になった行を最低10回では除外し、最低1回へ変更すると表示する", async () => {
    vi.resetModules();
    const actualReact = await vi.importActual<typeof import("react")>(
      "react"
    );
    const state = createStateHarness();
    vi.doMock("react", () => ({
      ...actualReact,
      useState: state.useState,
      useMemo: (factory: () => unknown) => factory(),
      useCallback: (callback: unknown) => callback,
    }));

    try {
      const { RankingTab: StatefulRankingTab } = await import(
        "./RankingTab"
      );
      const props = {
        log: boundaryLog(),
        variant: "weapon" as const,
        ...callbacks,
      };
      const render = () => {
        state.beginRender();
        return StatefulRankingTab(props);
      };

      let tree = render();
      expect(rankingRowNames(tree)).toContain("境界剣");

      findButton(tree, "過去10年間").props.onClick?.();
      tree = render();
      expect(rankingRowNames(tree)).toContain("境界剣");

      findSelect(tree, "国").props.onChange?.({
        target: { value: "赤国" },
      });
      tree = render();
      expect(rankingRowNames(tree)).not.toContain("境界剣");

      findSelect(tree, "最低使用回数").props.onChange?.({
        target: { value: "1" },
      });
      tree = render();
      expect(rankingRowNames(tree)).toContain("境界剣");
    } finally {
      vi.doUnmock("react");
      vi.resetModules();
    }
  });
});
