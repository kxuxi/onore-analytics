import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BattleRecord } from "@/lib/types";
import { HomeTab } from "./HomeTab";

const callbacks = {
  onSelectWarlord: vi.fn(),
  onSelectUnit: vi.fn(),
  onSelectFaction: vi.fn(),
  onSelectRanking: vi.fn(),
  onSelectHistory: vi.fn(),
};

function renderHome(log: BattleRecord[] = []) {
  return renderToStaticMarkup(
    <HomeTab log={log} db={{}} colors={{}} {...callbacks} />
  );
}

function battleRecord(
  year: number,
  savedAt: number,
  opponent: string,
  result: string
): BattleRecord {
  const time = `04/${String(savedAt).padStart(2, "0")} 10:00`;
  return {
    line: `【1戦目】 ${year}年4月 ${time} 京都 織田 信長 織田家 武特 鉄砲隊 騎兵 槍 鎧 V.S. 武田 ${opponent} 某家 統特 騎馬隊 騎兵 馬 旗 ${result} 12`,
    time: `${year}年4月 ${time}`,
    term: 1,
    savedAt,
  };
}

describe("HomeTab", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("未選択時は価値説明、検索、2つの補助導線を表示する", () => {
    const html = renderHome();

    expect(html).toContain("自分の武将を選ぶ");
    expect(html).toContain("自分の武将を検索");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("武将ランキングを見る");
    expect(html).toContain("戦闘履歴を見る");
    expect(html).not.toContain("キャンセル");
  });

  it("Cookieに武将があれば従来の選択済みダッシュボードを表示する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderHome();

    expect(html).toContain("信長");
    expect(html).toContain("武将を変更");
    expect(html).toContain("この期の戦闘履歴");
    expect(html).not.toContain("自分の武将を選ぶ");
    expect(html).not.toContain('role="combobox"');
  });

  it("出兵勝率・守備勝率・使用兵種の割合を表示し、旧セクションは表示しない", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });
    // 信長は出兵側（左）で 1勝1敗。
    const html = renderHome([
      battleRecord(1600, 1, "勝頼", "信長の勝利"),
      battleRecord(1601, 2, "謙信", "謙信の勝利"),
    ]);

    expect(html).toContain("あなたの成績");
    expect(html).toContain("出兵勝率");
    expect(html).toContain("守備勝率");
    expect(html).toContain("50.0%");
    expect(html).toContain("この期の戦闘はありません。");
    expect(html).toContain("使用兵種の割合");
    expect(html).toContain("鉄砲隊");
    // 使用兵種は出兵・守備の 2 列。信長は出兵のみなので守備列は空表示。
    expect(html).toContain('<h4 class="home-usage-title">⚔️ 出兵</h4>');
    expect(html).toContain('<h4 class="home-usage-title">🏯 守備</h4>');
    expect(html).toContain("計 2戦");
    expect(html).toContain("計 0戦");
    // 棒の長さは勝率（100%基準）。鉄砲隊は 1勝1敗なので 50%。
    expect(html).toContain('class="home-usage-fill" style="width:50%"');

    expect(html).not.toContain("勝敗数の推移");
    expect(html).not.toContain("最近の戦闘結果");
    expect(html).not.toContain("ウォッチリスト");
  });

  it("管理者かつonUpdateStats指定時、自分のステータス編集フォームを既存値付きで表示する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
            power: 91,
            intelligence: 84,
            leadership: 88,
            politics: 72,
            strategy: 102.5,
            maxTroops: 50000,
          },
        }}
        colors={{}}
        isAdmin
        onUpdateStats={vi.fn()}
        {...callbacks}
      />
    );

    expect(html).toContain("自分のステータス");
    expect(html).toContain("最大徴兵兵数");
    expect(html).toContain('value="91"');
    expect(html).toContain('value="102.5"');
    expect(html).toContain('value="50000"');

    // 知力84・計略102.5 → 判定値158.5。次は判定値160（あと計略P +2 または 知力 +3）。
    expect(html).toContain("計略解放まで");
    expect(html).toContain("解放済み（55件）を表示");
    expect(html).toContain("判定値 160");
    expect(html).toContain("両者武将アタック封印");
    expect(html).toContain("あと計略P +2");
    expect(html).toContain("あと計略P +2 または 知力 +3");

    // 政治72・最大徴兵兵数50000（初期値） → 50000/(72*2)+1=348.22...
    expect(html).toContain("徴兵時の治安減少値");
    expect(html).toContain('value="50000"');
    expect(html).toContain("東雲ドーナツ");
    expect(html).toContain("-348.22");
  });

  it("管理者でない、またはonUpdateStats未指定なら編集フォームを表示しない", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderHome();

    expect(html).not.toContain("自分のステータス");
  });

  it("知力・計略のどちらかが未設定なら「計略解放まで」は表示しない", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
            intelligence: 84,
          },
        }}
        colors={{}}
        {...callbacks}
      />
    );

    expect(html).not.toContain("計略解放まで");
  });

  it("能力値が十分なら「計略解放まで」で全項目が解放済みになる", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
            intelligence: 300,
            strategy: 300,
          },
        }}
        colors={{}}
        {...callbacks}
      />
    );

    expect(html).toContain("計略解放まで");
    expect(html).toContain("すべて解放済みです");
    expect(html).toContain("解放済み（80件）を表示");
    expect(html).not.toContain("あと計略P");
  });

  it("「計略解放まで」は次の閾値2段ぶんだけを表示する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
            intelligence: 0,
            strategy: 0,
          },
        }}
        colors={{}}
        {...callbacks}
      />
    );

    // 知力0・計略0 → 判定値0。次は 20（攻撃力+20% など）と 30。
    expect(html).toContain("判定値 20");
    expect(html).toContain("攻撃力+20%");
    expect(html).toContain("判定値 30");
    expect(html).toContain("防御力+20%");
    // 3段目（40）以降は表示しない。
    expect(html).not.toContain("判定値 40");
    // 出現判定0の項目（攻撃力+10% など）は最初から解放済み。
    expect(html).toContain("解放済み（4件）を表示");
  });

  it("政治力が未設定なら「徴兵時の治安減少値」は表示しない", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
          },
        }}
        colors={{}}
        {...callbacks}
      />
    );

    expect(html).not.toContain("徴兵時の治安減少値");
  });

  it("徴兵数の初期値が空でも「徴兵時の治安減少値」カード自体は表示する", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });

    const html = renderToStaticMarkup(
      <HomeTab
        log={[]}
        db={{
          信長: {
            name: "信長",
            type: "武特",
            branch: "騎兵",
            updatedAt: 0,
            politics: 50,
          },
        }}
        colors={{}}
        {...callbacks}
      />
    );

    expect(html).toContain("徴兵時の治安減少値");
    // 持ち物選択肢がすべて表示される。
    expect(html).toContain("なし");
    expect(html).toContain("三河物語");
    expect(html).toContain("諸葛亮の白羽扇");
    // 徴兵数未入力のため治安減少量は「—」。
    expect(html).toContain(">—<");
  });

  it("使用兵種が7種以上なら上位6種だけ表示し、残りはトグルで開く", () => {
    vi.stubGlobal("document", {
      cookie: "onore_my_warlord=%E4%BF%A1%E9%95%B7",
    });
    const units = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"];
    const log = units.map((u, i) => ({
      ...battleRecord(1600, i + 1, `敵${i}`, "信長の勝利"),
      line: battleRecord(1600, i + 1, `敵${i}`, "信長の勝利").line.replace(
        "鉄砲隊",
        u
      ),
    }));
    const html = renderHome(log);

    expect(html).toContain("残り2種を表示");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("その他");
    expect((html.match(/class="home-usage-row"/g) ?? []).length).toBe(6);
  });
});
