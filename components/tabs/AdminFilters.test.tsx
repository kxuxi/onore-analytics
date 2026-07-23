import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WarlordMap } from "@/lib/types";
import { DamageTab } from "./DamageTab";
import { DbTab } from "./DbTab";

const DB: WarlordMap = {
  旧名: {
    name: "旧名",
    household: "同一家",
    faction: "東軍",
    type: "武特",
    branch: "騎兵",
    unit: "旧兵種",
    updatedAt: 100,
  },
  新名: {
    name: "新名",
    household: "同一家",
    faction: "東軍",
    type: "統特",
    branch: "歩兵",
    unit: "新兵種",
    updatedAt: 300,
  },
  単独武将: {
    name: "単独武将",
    faction: "西軍",
    type: "知特",
    branch: "弓兵",
    unit: "弓兵",
    updatedAt: 200,
  },
};

describe("DbTab", () => {
  it("既存の代表名集約・更新日時順と初期フィルターを維持する", () => {
    const markup = renderToStaticMarkup(
      <DbTab
        db={DB}
        colors={{}}
        onSelectWarlord={vi.fn()}
        onSelectFaction={vi.fn()}
        onImportStats={vi.fn()}
      />
    );

    expect(markup).toContain(">2</div>");
    expect(markup).toContain("新名");
    expect(markup).toContain("単独武将");
    expect(markup).not.toContain(">旧名</button>");
    expect(markup.indexOf("新名")).toBeLessThan(markup.indexOf("単独武将"));
    expect(markup).toContain('aria-sort="descending"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="db-filters-fields"');
    expect(markup).toContain("国</span><select");
    expect(markup).toContain("タイプ</span><select");
    expect(markup).toContain("兵種タイプ</span><select");
    expect(markup).toContain("兵種名</span><select");
    expect(markup).toContain(">全2件</p>");
    expect(markup.match(/role="status"/g)).toHaveLength(1);
  });

  it("取込領域は既定で閉じ、保存操作を先に表示しない", () => {
    const markup = renderToStaticMarkup(
      <DbTab
        db={{}}
        colors={{}}
        onSelectWarlord={vi.fn()}
        onSelectFaction={vi.fn()}
        onImportStats={vi.fn()}
      />
    );

    expect(markup).toContain("ステータス取り込み");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("ランキング表の貼り付け内容");
    expect(markup).not.toContain(">取り込む</button>");
    expect(markup).toContain("まだ登録された武将はありません。");
  });
});

describe("DamageTab", () => {
  it("共通フィルターでも既定openと3条件を維持する", () => {
    const markup = renderToStaticMarkup(
      <DamageTab db={DB} colors={{}} onSelectWarlord={vi.fn()} />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="damage-filters-fields"');
    expect(markup).toContain("ステータス</span><select");
    expect(markup).toContain("国</span><select");
    expect(markup).toContain("役割</span><select");
    expect(markup).toContain(">表示 0件</p>");
    expect(markup).toContain("表示できる行動データがありません");
  });
});
