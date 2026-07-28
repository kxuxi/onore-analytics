import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getActionInfo } from "@/lib/action";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { buildDamageCandidates, DamageTab } from "./DamageTab";
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
      <DamageTab db={DB} log={[]} colors={{}} onSelectWarlord={vi.fn()} />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="damage-filters-fields"');
    expect(markup).toContain("ステータス</span><select");
    expect(markup).toContain("国</span><select");
    expect(markup).toContain("役割</span><select");
    expect(markup).toContain('<option value="depleted">兵力減</option>');
    expect(markup).toContain(">表示 0件</p>");
    expect(markup).toContain("表示できる行動データがありません");
  });

  it("表示期の壁戦だけで観測された前期プロフィールの武将も行動済みにする", () => {
    const scopedDb: WarlordMap = {
      現期武将: {
        name: "現期武将",
        faction: "東軍",
        type: "武特",
        branch: "騎兵",
        term: 147,
        updatedAt: 200,
      },
    };
    const allDb: WarlordMap = {
      ...scopedDb,
      壁出兵者: {
        name: "壁出兵者",
        faction: "旧所属国",
        type: "知特",
        branch: "弓兵",
        unit: "旧弓兵",
        term: 146,
        lastActionAt: "07/14 14:38",
        actions: ["07/14 14:38"],
        updatedAt: 100,
      },
    };
    const log: BattleRecord[] = [
      {
        id: 1,
        term: 147,
        savedAt: 1,
        line:
          "【1戦目】 1583年4月 07/25 20:00 京都 " +
          "東軍 現期武将 現期家 武特 騎馬隊 騎兵 槍 鎧 V.S. " +
          "中立 守備武将 守備家 知特 弓兵隊 弓兵 弓 旗 現期武将の勝利 5\n" +
          "【壁戦】 1583年4月 07/25 20:28 京都 " +
          "西軍 壁出兵者 壁家 統特 歩兵隊 歩兵 刀 盾 V.S. " +
          "中立 京都の守備隊 精鋭城壁兵 壁 なし なし 京都の守備隊の勝利 6",
      },
    ];

    const candidate = buildDamageCandidates(scopedDb, allDb, log).find(
      ({ warlord }) => warlord.name === "壁出兵者"
    );

    expect(candidate).toBeDefined();
    expect(candidate?.actionWarlord.lastActionAt).toBeUndefined();
    expect(candidate?.availability?.latestAttackAt).toBe("07/25 20:28");
    expect(candidate?.hasAttack).toBe(true);
    expect(candidate?.canOpenDetail).toBe(false);
    expect(candidate?.warlord).toMatchObject({
      faction: "西軍",
      type: "統特",
      branch: "歩兵",
      unit: "歩兵隊",
      term: 147,
    });
    expect(
      getActionInfo(
        candidate!.actionWarlord,
        new Date(2026, 6, 25, 20, 40),
        candidate?.availability
      ).status
    ).toBe("done");

    const allPeriodCandidate = buildDamageCandidates(allDb, allDb, log).find(
      ({ warlord }) => warlord.name === "壁出兵者"
    );
    expect(allPeriodCandidate).toMatchObject({
      canOpenDetail: true,
      warlord: {
        faction: "西軍",
        type: "統特",
        branch: "歩兵",
        unit: "歩兵隊",
        term: 147,
      },
    });
  });

  it("DB未登録でも壁戦プロフィールから行を補い、詳細リンクは無効にする", () => {
    const scopedDb: WarlordMap = {
      現期武将: {
        name: "現期武将",
        faction: "東軍",
        type: "武特",
        branch: "騎兵",
        term: 147,
        updatedAt: 200,
      },
    };
    const log: BattleRecord[] = [
      {
        id: 1,
        term: 147,
        savedAt: 1,
        line:
          "【1戦目】 1583年4月 07/25 20:00 京都 " +
          "東軍 現期武将 現期家 武特 騎馬隊 騎兵 槍 鎧 V.S. " +
          "中立 守備武将 守備家 知特 弓兵隊 弓兵 弓 旗 現期武将の勝利 5\n" +
          "【壁戦】 1583年4月 07/25 20:28 京都 " +
          "西軍 未登録武将 未登録家 統特 歩兵隊 歩兵 刀 盾 V.S. " +
          "中立 京都の守備隊 精鋭城壁兵 壁 なし なし 京都の守備隊の勝利 6",
      },
    ];

    const candidate = buildDamageCandidates(scopedDb, scopedDb, log).find(
      ({ warlord }) => warlord.name === "未登録武将"
    );

    expect(candidate).toMatchObject({
      hasAttack: true,
      canOpenDetail: false,
      warlord: {
        faction: "西軍",
        type: "統特",
        branch: "歩兵",
        unit: "歩兵隊",
        term: 147,
      },
      availability: {
        latestAttackAt: "07/25 20:28",
      },
    });

    const dbWithOldAlias: WarlordMap = {
      ...scopedDb,
      旧名: {
        name: "旧名",
        household: "未登録家",
        faction: "旧所属国",
        type: "知特",
        branch: "弓兵",
        term: 146,
        updatedAt: 100,
      },
    };
    const aliases = buildDamageCandidates(
      dbWithOldAlias,
      dbWithOldAlias,
      log
    ).filter(
      ({ warlord }) =>
        warlord.name === "旧名" || warlord.name === "未登録武将"
    );
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({
      canOpenDetail: false,
      warlord: {
        name: "未登録武将",
        household: "未登録家",
        faction: "西軍",
        term: 147,
      },
    });
  });
});
