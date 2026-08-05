import { describe, it, expect } from "vitest";
import {
  splitBattleSegments,
  extractBattleUrl,
  parseBattleCard,
  parseBattleLine,
  parseBattleEntriesChecked,
  normalizeDisplayToken,
  normalizeWidth,
  isSpecialToken,
  battleKey,
  isSkewedSide,
  parseWallAttackEvents,
} from "./parser";

// スペース区切りでも parser は [\s\u3000]+ で分割するためタブ無しで再現できる。
const LINE_PLAIN =
  "【1戦目】 1583年4月 04/10 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利 12";

const WALL_LOSS_LINE =
  "【壁戦】 1606年4月 07/25 21:03 久留米 ななせ国 風真いろは 風真いろは家 統特 剣兵 歩兵 銀の護符 ピコピコハンマー V.S. 己鯖冷笑プレイヤー族 久留米の守備隊 精鋭城壁兵 壁 なし なし 久留米の守備隊の勝利 6";

const WALL_LOSS_MARKDOWN = `【壁戦】

1606年4月

07/25 21:03

久留米

[ななせ国 風真いろは 風真いろは家 統特 剣兵 歩兵 銀の護符 ピコピコハンマー V.S. 己鯖冷笑プレイヤー族 久留米の守備隊 精鋭城壁兵 壁 なし なし](https://example.com/battle/wall)

久留米の守備隊の勝利

6ターンで終了`;

describe("splitBattleSegments", () => {
  it("【N戦目】マーカーで複数戦に分割する", () => {
    const segs = splitBattleSegments("【1戦目】あ 【2戦目】い【3戦目】う");
    expect(segs).toHaveLength(3);
    expect(segs[0].startsWith("【1戦目】")).toBe(true);
    expect(segs[2].startsWith("【3戦目】")).toBe(true);
  });

  it("空文字は空配列を返す", () => {
    expect(splitBattleSegments("   ")).toEqual([]);
  });

  it("【壁戦】マーカーの直前でも分割する", () => {
    const segs = splitBattleSegments("【1戦目】あ 【壁戦】い 【2戦目】う");
    expect(segs).toHaveLength(3);
    expect(segs[1].startsWith("【壁戦】")).toBe(true);
  });
});

describe("extractBattleUrl", () => {
  it("マークダウンリンクから URL を取り出す", () => {
    const { line, url } = extractBattleUrl(
      "【1戦目】[織田 V.S. 武田](https://example.com/b/1)勝利"
    );
    expect(url).toBe("https://example.com/b/1");
    expect(line).not.toContain("](");
    expect(line).toContain("織田");
  });

  it("リンクが無くてもきれいな半角スペース区切りはそのまま", () => {
    const { line, url } = extractBattleUrl(LINE_PLAIN);
    expect(url).toBeUndefined();
    expect(line).toBe(LINE_PLAIN);
  });

  it("リンクが無く詰まった入力（スマホ）でもメタ部・勝敗の境界を補う", () => {
    const glued =
      "【1戦目】1583年4月04/10 10:23京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利12";
    const { line } = extractBattleUrl(glued);
    expect(line).toContain("【1戦目】 1583年4月 04/10 10:23 京都");
    expect(line).toContain("勝利 12");
  });

  it("武将名に含まれる 】（例: 【大空】ユニ）は分割しない", () => {
    const { line } = extractBattleUrl(
      "【3戦目】 1687年6月 06/15 09:59 植物公園 サルの修行寺R 【大空】ユニ ミルフィオーレファミリー 武政 万能隊 万能 装A 装B V.S. 敵国 敵将 敵家 武特 騎隊 騎兵 馬 旗 【大空】ユニの勝利 7"
    );
    // 戦目】 の後ろだけ空白が入り、【大空】ユニ は 1 トークンのまま保たれる。
    expect(line).toContain("【3戦目】 1687年6月");
    expect(line).toContain("サルの修行寺R 【大空】ユニ ミルフィオーレファミリー");
    expect(line).not.toContain("【大空】 ユニ");
  });

  it("名前に 】 を含む武将を faction とずれずに解析する", () => {
    const card = parseBattleCard(
      "【3戦目】 1687年6月 06/15 09:59 植物公園 サルの修行寺R 【大空】ユニ ミルフィオーレファミリー 武政 万能隊 万能 装A 装B V.S. 敵国 敵将 敵家 武特 騎隊 騎兵 馬 旗 【大空】ユニの勝利 7"
    );
    expect(card).not.toBeNull();
    expect(card!.left.faction).toBe("サルの修行寺R");
    expect(card!.left.name).toBe("【大空】ユニ");
    expect(card!.left.family).toBe("ミルフィオーレファミリー");
    expect(card!.winner).toBe("left");
  });
});

describe("parseWallAttackEvents", () => {
  it("壁に負けた出兵側の武将名と時刻を取り出す", () => {
    expect(parseWallAttackEvents(WALL_LOSS_LINE)).toEqual([
      {
        name: "風真いろは",
        household: "風真いろは家",
        faction: "ななせ国",
        type: "統特",
        branch: "歩兵",
        unit: "剣兵",
        battleAt: "1606年4月 07/25 21:03",
        actionAt: "07/25 21:03",
      },
    ]);
  });

  it("実データ同様のMarkdown形式から壁への出兵を取り出す", () => {
    expect(parseWallAttackEvents(WALL_LOSS_MARKDOWN)[0]).toMatchObject({
      name: "風真いろは",
      battleAt: "1606年4月 07/25 21:03",
      actionAt: "07/25 21:03",
    });
  });

  it("通常戦に複数の壁戦が連結されていても全件を取り出す", () => {
    const secondWall = WALL_LOSS_LINE.replace(
      "07/25 21:03",
      "07/25 21:06"
    ).replaceAll("風真いろは", "秀吉");

    expect(
      parseWallAttackEvents(
        `${LINE_PLAIN}\n${WALL_LOSS_LINE}\n${secondWall}\n${LINE_PLAIN}`
      )
    ).toHaveLength(2);
  });

  it("壁側の情報や勝敗が欠けていても出兵側を保持する", () => {
    const partialWall =
      "【壁戦】 1606年4月 07/25 21:03 久留米 ななせ国 風真いろは 風真いろは家 統特 剣兵 歩兵 銀の護符 ピコピコハンマー V.S. 中立 久留米の守備隊 なし なし";

    expect(parseWallAttackEvents(partialWall)[0]).toMatchObject({
      name: "風真いろは",
      actionAt: "07/25 21:03",
    });
  });

  it("特殊な城壁名で兵種欄が壁でなくても壁戦として扱う", () => {
    const specialWall = WALL_LOSS_LINE.replace(
      "精鋭城壁兵 壁",
      "トゥールハンマー 雷神"
    );

    expect(parseWallAttackEvents(specialWall)[0]?.name).toBe("風真いろは");
  });

  it("スマホで壁戦マーカー・年月・都市が詰まっても時刻を保持する", () => {
    const mobileGlued =
      "【壁戦】1606年4月07/25 21:03久留米ななせ国 風真いろは 風真いろは家 統特 剣兵 歩兵 銀の護符 ピコピコハンマー V.S. 己鯖冷笑プレイヤー族 久留米の守備隊 精鋭城壁兵 壁 なし なし久留米の守備隊の勝利6ターンで終了";

    expect(parseWallAttackEvents(mobileGlued)[0]).toMatchObject({
      name: "風真いろは",
      battleAt: "1606年4月 07/25 21:03",
      actionAt: "07/25 21:03",
    });
  });
});


describe("parseBattleCard", () => {
  it("基本フィールドと勝者（出兵側）を解析する", () => {
    const card = parseBattleCard(LINE_PLAIN);
    expect(card).not.toBeNull();
    expect(card!.battleNo).toBe("1戦目");
    expect(card!.place).toBe("京都");
    expect(card!.battleAt).toBe("1583年4月 04/10 10:23");
    expect(card!.turns).toBe("12");
    expect(card!.left.faction).toBe("織田");
    expect(card!.left.name).toBe("信長");
    expect(card!.right.faction).toBe("武田");
    expect(card!.right.name).toBe("勝頼");
    expect(card!.winner).toBe("left");
  });

  it("「〇〇への遠征 海戦」のように都市欄が2トークンでも全体を都市として扱う", () => {
    const line = LINE_PLAIN.replace("京都", "平戸への遠征 海戦");
    const card = parseBattleCard(line);
    expect(card).not.toBeNull();
    expect(card!.place).toBe("平戸への遠征 海戦");
    expect(card!.battleAt).toBe("1583年4月 04/10 10:23");
  });

  it("【壁戦】単独行も守備側（壁）を6項目として解析する", () => {
    const line =
      "【壁戦】\t1666年12月\t08/04 23:59\t平戸への遠征 海戦\tエロゲソング同好会 SINCLAIR キャラメルBOX 統特 モニター艦 特殊船 龍の護符 攻城櫓 V.S. ななせ国 平戸の守備隊 下級城壁兵 壁 なし なし\tSINCLAIRの勝利\t3ターンで終了";
    const card = parseBattleCard(line);
    expect(card).not.toBeNull();
    expect(card!.battleNo).toBe("壁戦");
    expect(card!.place).toBe("平戸への遠征 海戦");
    expect(card!.turns).toBe("3");
    expect(card!.left.name).toBe("SINCLAIR");
    expect(card!.right).toMatchObject({
      faction: "ななせ国",
      name: "平戸の守備隊",
      type: "下級城壁兵",
      branch: "壁",
      family: undefined,
      unit: undefined,
    });
    expect(card!.winner).toBe("left");
    expect(isSkewedSide(card!.left)).toBe(false);
    expect(isSkewedSide(card!.right)).toBe(false);
  });

  it("守備側の勝利を判定する", () => {
    const line = LINE_PLAIN.replace("信長の勝利", "勝頼の勝利");
    expect(parseBattleCard(line)!.winner).toBe("right");
  });

  it("撤退・引分を判定する", () => {
    expect(parseBattleCard(LINE_PLAIN.replace("信長の勝利", "撤退"))!.winner).toBe(
      "retreat"
    );
    expect(parseBattleCard(LINE_PLAIN.replace("信長の勝利", "引分"))!.winner).toBe(
      "draw"
    );
  });

  it("【N戦目】で始まらない行は null", () => {
    expect(parseBattleCard("ただのテキスト")).toBeNull();
  });
});

describe("全角の数字・日時（normalizeWidth）", () => {
  it("normalizeWidth は全角数字・スラッシュ・コロンだけを半角化する", () => {
    expect(normalizeWidth("０４／１２ １２：００")).toBe("04/12 12:00");
    expect(normalizeWidth("１７００年４月")).toBe("1700年4月");
    // 日本語や他の文字は変えない。
    expect(normalizeWidth("信長 騎馬隊")).toBe("信長 騎馬隊");
  });

  it("パーサ自体は全角表記を保持する（読み取り側で正規化する方針）", () => {
    const zen =
      "【１戦目】 １７００年４月 ０４／１０ １０：２３ 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利 １２";
    const card = parseBattleCard(zen);
    expect(card).not.toBeNull();
    // battleAt は貼られたまま（全角）を保持し、武将名や勝敗判定は従来どおり動く。
    // 年・時刻の半角化は gameYear / parseActionDate など読み取り側で行う。
    expect(card!.battleAt).toContain("１７００年４月");
    expect(card!.left.name).toBe("信長");
    expect(card!.right.name).toBe("勝頼");
    expect(card!.winner).toBe("left");
  });
});

describe("parseBattleLine の兵種正規化", () => {
  const withUnit = (unit: string) =>
    LINE_PLAIN.replace("武特 騎馬隊 騎兵", `武特 ${unit} 騎兵`);

  it("オリジナル兵(...) は括弧内を採用する", () => {
    const w = parseBattleLine(withUnit("オリジナル兵(ドラグーン)"));
    expect(w[0].unit).toBe("ドラグーン");
  });

  it("全角括弧のオリジナル兵にも対応する", () => {
    const w = parseBattleLine(withUnit("オリジナル兵（重騎兵）"));
    expect(w[0].unit).toBe("重騎兵");
  });

  it("* 始まりで括弧があれば括弧内を採用する", () => {
    const w = parseBattleLine(withUnit("*ノクスミーティア(カノン砲)"));
    expect(w[0].unit).toBe("カノン砲");
  });

  it("* 始まりで括弧が無ければ保存値は * マーカーを保持する", () => {
    // 保存用 normalizeUnit は特殊兵種マーカー(*)を残す（isSpecialToken 判定・
    // 表示時の normalizeDisplayToken で * を除去する役割分担のため）。
    const w = parseBattleLine(withUnit("*ノクスミーティア"));
    expect(w[0].unit).toBe("*ノクスミーティア");
  });

  it("命名に半角空白を含むオリジナル兵も 1 トークンとして解析する", () => {
    // 「*中指 末弟・末妹(ライフル銃兵)」は命名に空白があるが、分割前に
    // 1 トークンへまとめるため以降の項目（兵種・装備）がずれない。
    const w = parseBattleLine(withUnit("*中指 末弟・末妹(ライフル銃兵)"));
    expect(w[0].unit).toBe("ライフル銃兵");
    expect(w[0].type).toBe("武特");
    expect(w[0].branch).toBe("騎兵");
  });

  it("V.S. の前後に空白入りオリジナル兵があっても両側を取り違えない", () => {
    // 出兵側・守備側の両方が命名に空白を含むオリジナル兵でも、
    // V.S. を跨いで巻き込まず、それぞれ 1 トークンにまとまる。
    const line =
      "【1戦目】 1583年4月 04/10 10:23 京都 織田 信長 織田家 武特 " +
      "*天翔 龍騎兵(カノン砲) 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 " +
      "*疾風 白虎隊(ドラグーン) 騎兵 馬 旗 信長の勝利 12";
    const w = parseBattleLine(line);
    expect(w).toHaveLength(2);
    expect(w[0].name).toBe("信長");
    expect(w[0].unit).toBe("カノン砲");
    expect(w[0].branch).toBe("騎兵");
    expect(w[1].name).toBe("勝頼");
    expect(w[1].unit).toBe("ドラグーン");
    expect(w[1].branch).toBe("騎兵");
  });
});

describe("スマホ貼り付け（リンク喪失で詰まった形式）", () => {
  // PC ではリンク [本文](URL) が「都市↔勢力名」「武将の持つ武器↔勝敗」の境界を作るが、
  // スマホではリンクが失われ、プレーンテキストとして詰まって貼られる。
  const mobileGlued =
    "【1戦目】1688年3月06/15 12:51植物公園サルの修行寺R 半端な鍛錬武特 純粋家 武特 鬼武者っぽい🙉 歩兵 示現流兵法巻 六字名号旗 V.S. けつなあな確定 佐山聡 佐山家 武特 剣豪 歩兵 龍の腕輪 五郎入道正宗半端な鍛錬武特の勝利12";

  it("出兵側・守備側の武将を抽出できる", () => {
    const w = parseBattleLine(mobileGlued);
    expect(w).toHaveLength(2);
    expect(w[0].name).toBe("半端な鍛錬武特");
    expect(w[0].type).toBe("武特");
    expect(w[0].branch).toBe("歩兵");
    expect(w[1].name).toBe("佐山聡");
    expect(w[1].branch).toBe("歩兵");
  });

  it("時刻を都市と取り違えず、行動時刻を保持する", () => {
    const w = parseBattleLine(mobileGlued);
    expect(w[0].battleAt).toContain("06/15 12:51");
    expect(w[0].lastActionAt).toBe("06/15 12:51");
  });

  it("守備側は lastActionAt を設定するが actions は付けない（バッジ対象外）", () => {
    const w = parseBattleLine(mobileGlued);
    expect(w[1].lastActionAt).toBe("06/15 12:51");
    expect(w[1].actions).toBeUndefined();
  });

  it("武将の持つ武器に連結した勝敗を切り離し、勝者・ターン数・装備を復元する", () => {
    const card = parseBattleCard(mobileGlued);
    expect(card).not.toBeNull();
    expect(card!.winner).toBe("left");
    expect(card!.turns).toBe("12");
    expect(card!.right.equips).toEqual(["龍の腕輪", "五郎入道正宗"]);
    // 武将の持つ品物列 / 武将の持つ武器列として枠の位置を保持する。
    expect(card!.right.equip1).toBe("龍の腕輪");
    expect(card!.right.equip2).toBe("五郎入道正宗");
    expect(card!.left.equip1).toBe("示現流兵法巻");
    expect(card!.left.equip2).toBe("六字名号旗");
  });

  it("半角スペース区切りとタブ区切りは同じ武将を抽出する", () => {
    const space =
      "【1戦目】 1583年4月 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利 12";
    const tab = space.replace(/ /g, "\t");
    const ws = parseBattleLine(space);
    const wt = parseBattleLine(tab);
    expect(wt.map((x) => x.name)).toEqual(ws.map((x) => x.name));
    expect(ws.map((x) => x.name)).toEqual(["信長", "勝頼"]);
  });
});

describe("装備枠（武将の持つ品物 / 武将の持つ武器 の位置保持）", () => {
  it("片方の枠が「なし」でも、武将の持つ品物・武将の持つ武器の対応を取り違えない", () => {
    const line =
      "【1戦目】 1583年4月 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 なし 鐦 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 なし 信長の勝利 12";
    const card = parseBattleCard(line);
    expect(card).not.toBeNull();
    // 出兵側: 武将の持つ品物=なし、武将の持つ武器=鐦。
    expect(card!.left.equip1).toBeUndefined();
    expect(card!.left.equip2).toBe("鐦");
    expect(card!.left.equips).toEqual(["鐦"]);
    // 守備側: 武将の持つ品物=馬、武将の持つ武器=なし。
    expect(card!.right.equip1).toBe("馬");
    expect(card!.right.equip2).toBeUndefined();
    expect(card!.right.equips).toEqual(["馬"]);
  });
});

describe("国名プレースホルダーの正規化（DB登録）", () => {
  it("国列が「なし」の武将は faction を持たない（偽の国名を残さない）", () => {
    const line =
      "【1戦目】 1583年4月 04/10 10:23 京都 なし 浪人太郎 浪人家 武特 騎馬隊 騎兵 槍 鎧 V.S. ー 流浪次郎 流浪家 統特 騎馬隊 騎兵 馬 旗 浪人太郎の勝利 12";
    const ws = parseBattleLine(line);
    expect(ws[0].name).toBe("浪人太郎");
    expect(ws[0].faction).toBeUndefined();
    expect(ws[1].name).toBe("流浪次郎");
    expect(ws[1].faction).toBeUndefined();
  });

  it("通常の国名はそのまま faction として保持する", () => {
    const ws = parseBattleLine(LINE_PLAIN);
    expect(ws[0].faction).toBe("織田");
    expect(ws[1].faction).toBe("武田");
  });
});

describe("normalizeDisplayToken", () => {
  it("* 始まり + 括弧は括弧内を採用", () => {
    expect(normalizeDisplayToken("*ノクスミーティア(カノン砲)")).toBe("カノン砲");
  });
  it("オリジナル兵（全角）は括弧内を採用", () => {
    expect(normalizeDisplayToken("オリジナル兵（ドラグーン）")).toBe("ドラグーン");
  });
  it("* 始まりで括弧無しは * を除去", () => {
    expect(normalizeDisplayToken("*ノクスミーティア")).toBe("ノクスミーティア");
  });
  it("通常トークンはそのまま", () => {
    expect(normalizeDisplayToken("騎馬隊")).toBe("騎馬隊");
  });
});

describe("isSpecialToken", () => {
  it("* 始まりは true", () => {
    expect(isSpecialToken("*特殊")).toBe(true);
  });
  it("通常は false", () => {
    expect(isSpecialToken("騎馬隊")).toBe(false);
  });
});

describe("battleKey の重複排除", () => {
  it("ターン数の違いは同じキーになる", () => {
    const a = battleKey(LINE_PLAIN); // 12 ターン
    const b = battleKey(LINE_PLAIN.replace(" 12", " 8")); // 8 ターン
    expect(a).toBe(b);
  });

  it("URL・ターン表記が違うマークダウン形式でも同一戦闘なら同じキー", () => {
    const markdown =
      "【1戦目】1583年4月04/10 10:23京都[織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗](https://example.com/b/1)信長の勝利8ターンで終了";
    expect(battleKey(markdown)).toBe(battleKey(LINE_PLAIN));
  });

  it("勝敗が違えば別キーになる", () => {
    const a = battleKey(LINE_PLAIN);
    const d = battleKey(LINE_PLAIN.replace("信長の勝利", "勝頼の勝利"));
    expect(a).not.toBe(d);
  });
});

describe("parseBattleEntriesChecked（項目の過不足の検出）", () => {
  it("正常な行は entries に入り rejected は空", () => {
    const { entries, rejected } = parseBattleEntriesChecked(LINE_PLAIN);
    expect(entries).toHaveLength(1);
    expect(rejected).toHaveLength(0);
    expect(entries[0].warlords.map((w) => w.name)).toEqual(["信長", "勝頼"]);
  });

  it("V.S. が無い戦闘エントリは拒否し理由を付ける", () => {
    const line =
      "【2戦目】 1583年4月 04/10 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 武田 勝頼";
    const { entries, rejected } = parseBattleEntriesChecked(line);
    expect(entries).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].battleNo).toBe("2戦目");
    expect(rejected[0].reason).toContain("V.S.");
  });

  it("出兵側の項目が不足している戦闘は拒否する", () => {
    const line =
      "【3戦目】 1583年4月 04/10 10:23 京都 織田 信長 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利 12";
    const { rejected } = parseBattleEntriesChecked(line);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("出兵側");
  });

  it("守備側の項目が不足している戦闘は拒否する", () => {
    const line =
      "【4戦目】 1583年4月 04/10 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家";
    const { rejected } = parseBattleEntriesChecked(line);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("守備側");
  });

  it("正常な行と過不足の行が混在しても、正常分だけ取り込み過不足は拒否する", () => {
    const broken =
      "【2戦目】 1583年4月 04/10 10:23 京都 織田 信長 V.S. 武田 勝頼";
    const { entries, rejected } = parseBattleEntriesChecked(
      `${LINE_PLAIN} ${broken}`
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].warlords[0].name).toBe("信長");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].battleNo).toBe("2戦目");
  });

  it("戦闘エントリの体裁でない断片（メモ等）は対象外で拒否しない", () => {
    const { entries, rejected } = parseBattleEntriesChecked(
      "あとで貼り付けるメモ書き"
    );
    expect(entries).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("直前に【N戦目】が無い単独の【壁戦】も出兵側だけで取り込む（都市に空白を含む遠征先の海戦でも同様）", () => {
    const line =
      "【壁戦】\t1666年12月\t08/04 23:59\t平戸への遠征 海戦\tエロゲソング同好会 SINCLAIR キャラメルBOX 統特 モニター艦 特殊船 龍の護符 攻城櫓 V.S. ななせ国 平戸の守備隊 下級城壁兵 壁 なし なし\tSINCLAIRの勝利\t3ターンで終了";
    const { entries, rejected } = parseBattleEntriesChecked(line);
    expect(rejected).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].warlords).toHaveLength(1);
    expect(entries[0].warlords[0].name).toBe("SINCLAIR");
    expect(entries[0].warlords[0].battleAt).toBe("1666年12月 08/04 23:59");
    expect(entries[0].line).toContain("平戸への遠征 海戦");
  });

  it("通常戦に続けて連結された【壁戦】も、通常戦とは別のエントリとして取り込む", () => {
    const text = `${LINE_PLAIN}\n${WALL_LOSS_LINE}`;
    const { entries, rejected } = parseBattleEntriesChecked(text);
    expect(rejected).toHaveLength(0);
    expect(entries).toHaveLength(2);
    expect(entries[0].warlords.map((w) => w.name)).toEqual(["信長", "勝頼"]);
    expect(entries[1].warlords.map((w) => w.name)).toEqual(["風真いろは"]);
  });
});

describe("isSkewedSide（項目ずれの判定）", () => {
  it("正常な type/branch はずれと判定しない", () => {
    const card = parseBattleCard(LINE_PLAIN);
    expect(card).not.toBeNull();
    expect(isSkewedSide(card!.left)).toBe(false);
    expect(isSkewedSide(card!.right)).toBe(false);
  });

  it("オリジナル兵名にスペースがあっても項目はずれない（分割前に 1 トークン化）", () => {
    // 兵種名「*中指 末弟・末妹(ライフル銃兵)」は命名に空白を含むが、
    // 分割前に 1 トークンへまとめるため type/branch が正しい位置に収まる。
    const line =
      "【1戦目】 1666年4月 05/20 21:18 戸坂 己鯖 ヒースクリフ 中指 統特 *中指 末弟・末妹(ライフル銃兵) 弓兵 孟徳新書 カルバリン砲 V.S. 敵国 広島ファン 広島ファン家 統特 ミニエー銃兵 弓兵 金の護符 金タライ 広島ファンの勝利 5";
    const card = parseBattleCard(line);
    expect(card).not.toBeNull();
    // ずれが解消され、type=統特 / branch=弓兵 / unit=ライフル銃兵 に収まる。
    expect(isSkewedSide(card!.left)).toBe(false);
    expect(card!.left.type).toBe("統特");
    expect(card!.left.branch).toBe("弓兵");
    expect(normalizeDisplayToken(card!.left.unit ?? "")).toBe("ライフル銃兵");
  });

  it("branch に装備名が入り込んだ側はずれと判定する", () => {
    // type が既知でも branch が装備名ならずれ。
    const card = parseBattleCard(LINE_PLAIN);
    const skewed = { ...card!.left, branch: "銀の腕輪" };
    expect(isSkewedSide(skewed)).toBe(true);
  });
});
