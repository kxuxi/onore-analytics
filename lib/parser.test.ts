import { describe, it, expect } from "vitest";
import {
  splitBattleSegments,
  extractBattleUrl,
  parseBattleCard,
  parseBattleLine,
  parseBattleEntriesChecked,
  normalizeDisplayToken,
  isSpecialToken,
  battleKey,
} from "./parser";

// スペース区切りでも parser は [\s\u3000]+ で分割するためタブ無しで再現できる。
const LINE_PLAIN =
  "【1戦目】 1583年4月 04/10 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利 12";

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


describe("parseBattleCard", () => {
  it("基本フィールドと勝者（攻撃側）を解析する", () => {
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

  it("防衛側の勝利を判定する", () => {
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
});

describe("スマホ貼り付け（リンク喪失で詰まった形式）", () => {
  // PC ではリンク [本文](URL) が「場所↔勢力名」「装備2↔勝敗」の境界を作るが、
  // スマホではリンクが失われ、プレーンテキストとして詰まって貼られる。
  const mobileGlued =
    "【1戦目】1688年3月06/15 12:51植物公園サルの修行寺R 半端な鍛錬武特 純粋家 武特 鬼武者っぽい🙉 歩兵 示現流兵法巻 六字名号旗 V.S. けつなあな確定 佐山聡 佐山家 武特 剣豪 歩兵 龍の腕輪 五郎入道正宗半端な鍛錬武特の勝利12";

  it("攻撃側・防衛側の武将を抽出できる", () => {
    const w = parseBattleLine(mobileGlued);
    expect(w).toHaveLength(2);
    expect(w[0].name).toBe("半端な鍛錬武特");
    expect(w[0].type).toBe("武特");
    expect(w[0].branch).toBe("歩兵");
    expect(w[1].name).toBe("佐山聡");
    expect(w[1].branch).toBe("歩兵");
  });

  it("時刻を場所と取り違えず、行動時刻を保持する", () => {
    const w = parseBattleLine(mobileGlued);
    expect(w[0].battleAt).toContain("06/15 12:51");
    expect(w[0].lastActionAt).toBe("06/15 12:51");
  });

  it("守備側は lastActionAt を設定するが actions は付けない（バッジ対象外）", () => {
    const w = parseBattleLine(mobileGlued);
    expect(w[1].lastActionAt).toBe("06/15 12:51");
    expect(w[1].actions).toBeUndefined();
  });

  it("装備2に連結した勝敗を切り離し、勝者・ターン数・装備を復元する", () => {
    const card = parseBattleCard(mobileGlued);
    expect(card).not.toBeNull();
    expect(card!.winner).toBe("left");
    expect(card!.turns).toBe("12");
    expect(card!.right.equips).toEqual(["龍の腕輪", "五郎入道正宗"]);
    // 装備1列 / 装備2列として枠の位置を保持する。
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

describe("装備枠（装備1 / 装備2 の位置保持）", () => {
  it("片方の枠が「なし」でも、装備1・装備2の対応を取り違えない", () => {
    const line =
      "【1戦目】 1583年4月 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 なし 鐦 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 なし 信長の勝利 12";
    const card = parseBattleCard(line);
    expect(card).not.toBeNull();
    // 攻撃側: 装備1=なし、装備2=鐦。
    expect(card!.left.equip1).toBeUndefined();
    expect(card!.left.equip2).toBe("鐦");
    expect(card!.left.equips).toEqual(["鐦"]);
    // 防衛側: 装備1=馬、装備2=なし。
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

  it("攻撃側の項目が不足している戦闘は拒否する", () => {
    const line =
      "【3戦目】 1583年4月 04/10 10:23 京都 織田 信長 V.S. 武田 勝頼 武田家 統特 騎馬隊 騎兵 馬 旗 信長の勝利 12";
    const { rejected } = parseBattleEntriesChecked(line);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("攻撃側");
  });

  it("防衛側の項目が不足している戦闘は拒否する", () => {
    const line =
      "【4戦目】 1583年4月 04/10 10:23 京都 織田 信長 織田家 武特 騎馬隊 騎兵 槍 鎧 V.S. 武田 勝頼 武田家";
    const { rejected } = parseBattleEntriesChecked(line);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("防衛側");
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
});
