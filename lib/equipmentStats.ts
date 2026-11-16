/**
 * 戦闘中の能力比較に使う、確認済みの品物補正。
 *
 * 公式説明書を 2026-11-13 に確認。計略の能力比較には品物補正が関係する:
 * https://onore.servegame.com/game/sangoku/manual/manual_tactics.html#TAC_CHECK
 * 武器の威力・攻撃力・士気・発動率は、武力等の能力値とは別なので含めない。
 * 国宝一覧は「説明(※個人装備時の効果等)」欄のみを参照し、国宝効果は含めない。
 * 未確認の落城品・呪い・期間限定品は、補正なしと見なさず null を返す。
 */
export type EquipmentStatKey =
  | "power"
  | "intelligence"
  | "leadership"
  | "politics";

export interface EquipmentStatEffect {
  bonuses: Partial<Record<EquipmentStatKey, number>>;
  /** 公式一覧の個人装備時の説明。国宝としての効果ではない。 */
  description: string;
  sourceUrl: string;
}

export const EQUIPMENT_STATS_VERIFIED_AT = "2026-11-13";

const SHOP_SOURCE =
  "https://onore.servegame.com/game/sangoku/manual_data_table.cgi?mode=item_kind";
const TREASURE_SOURCE =
  "https://onore.servegame.com/game/sangoku/manual_data_table.cgi?mode=treasure";

const STAT_NAMES: Record<string, EquipmentStatKey> = {
  武力: "power",
  知力: "intelligence",
  統率: "leadership",
  統率力: "leadership",
  政治: "politics",
  政治力: "politics",
};

/**
 * 確認済み説明文の「常時」「戦闘時」の固定加算値だけを抽出する。
 * 呪いの負補正もそのまま返す。最終能力値の下限を推測して補正値を丸めない。
 * 説明に能力補正がないことと、品物自体が未確認であることは別問題なので、
 * 未確認の品物をこの関数で「補正なし」と認定してはならない。
 */
export function parseEquipmentBattleBonuses(
  description: string
): Partial<Record<EquipmentStatKey, number>> {
  const bonuses: Partial<Record<EquipmentStatKey, number>> = {};
  const text = description.normalize("NFKC").replace(/−/g, "-").replace(/\s/g, "");
  if (!/常時|戦闘時/.test(text)) return bonuses;

  // 士気等を同じグループとして読むことで「武力・統率力・士気+30」にも対応。
  const groups = /((?:(?:武力|知力|統率力?|政治力?|士気|訓練度|攻撃力?|防御力?|兵数)[・、/]?)+)([+-]\d+)(?![\d.%])/g;
  for (const match of text.matchAll(groups)) {
    const value = Number(match[2]);
    for (const name of match[1].match(/武力|知力|統率力?|政治力?/g) ?? []) {
      const key = STAT_NAMES[name];
      bonuses[key] = (bonuses[key] ?? 0) + value;
    }
  }
  return bonuses;
}

/** 店売り一覧の全65品。内政・徴兵限定の補正は戦闘では加算しない。 */
const SHOP_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["内政の指南書", "内政時 政治+50"],
  ["築城の指南書", "城壁兵、強化時 政治+50"],
  ["訓練の指南書", "訓練時 統率+50"],
  ["民忠の指南書", "治安維持時 政治+50"],
  ["米売買の書", "米売買時 政治+25"],
  ["農政全書", "内政、城壁、治安維持時 政治+50"],
  ["銀の腕輪", "戦闘時 武力+20"],
  ["金の腕輪", "戦闘時 武力+30"],
  ["銀の宝珠", "戦闘時 知力+20"],
  ["金の宝珠", "戦闘時 知力+30"],
  ["銀の護符", "戦闘時 統率+20"],
  ["金の護符", "戦闘時 統率+30"],
  ["銀の首飾り", "戦闘時 武力知力統率+10"],
  ["銀の兜", "戦闘時 攻撃+20"],
  ["金の兜", "戦闘時 攻撃+30"],
  ["十翼戦旗", "最大兵数+10％"],
  ["百翼戦旗", "最大兵数+20％"],
  ["軍配団扇", "戦闘時 士気+30"],
  ["パエリア", "プレゼントアイテム"],
  ["信長公記", "米売買時 政治+50"],
  ["甲陽軍鑑", "常時 知力武力+20"],
  ["越後流軍学書", "徴兵時 能力ALL+20"],
  ["日新公いろは歌", "戦闘時 武力統率+25"],
  ["三河物語", "常時 政治統率+20"],
  ["伊達秘鑑", "戦闘時 武力知力統率+20"],
  ["大友興廃記", "常時 武力統率+20"],
  ["地黄八幡旗指物", "戦闘時 攻撃+30、士気+50"],
  ["闘戦経", "戦闘時 武力+30、士気+30"],
  ["浄土三部経", "常時 政治統率+20"],
  ["土佐物語", "徴兵、戦闘時 政治統率+20"],
  ["今川仮名目録", "戦闘時 武力統率+25"],
  ["孟徳新書", "常時 知力+20、統率+20"],
  ["ヘヴンズ・キー", "戦闘時 知力統率+20"],
  ["フェアリーブーツ", "戦闘時 知力統率+20"],
  ["赤本", "米売買時 政治+50"],
  ["こんにゃく", "人肌ではありません。"],
  ["ウシ", "畜産用。食ったり、牛乳をとったり、火をつけたり。"],
  ["黒はんぺん", "合成素材。これだけでは意味ないです。"],
  ["お祓いセット", "お祓い道具一式。"],
  ["台車", "資源移送時 移送量+50％"],
  ["烏帽子形白綾頭巾", "国宝専用（個人効果はありません）"],
  ["唐の頭", "国宝専用（個人効果はありません）"],
  ["黒漆五枚胴具足", "国宝専用（個人効果はありません）"],
  ["ロザリオ", "国宝専用（個人効果はありません）"],
  ["緋羅紗地三鱗紋陣羽織", "国宝専用（個人効果はありません）"],
  ["毛利元就教訓状", "国宝専用（個人効果はありません）"],
  ["百足蝶蜂漆絵椀", "国宝専用（個人効果はありません）"],
  ["元親百箇条", "国宝専用（個人効果はありません）"],
  ["塗輿", "国宝専用（個人効果はありません）"],
  ["合武三島流船戦要法", "国宝専用（個人効果はありません）"],
  ["大坪流桐坪巻", "国宝専用（個人効果はありません）"],
  ["馬術歌之書", "国宝専用（個人効果はありません）"],
  ["礼記射義", "国宝専用（個人効果はありません）"],
  ["稲富流砲術秘伝書", "戦闘時 統率+30"],
  ["早合", "国宝専用（個人効果はありません）"],
  ["香取神道流書", "戦闘時 武力+30"],
  ["義盛百首歌", "戦闘時 知力+30"],
  ["忍術秘書応義", "戦闘時 知力+30"],
  ["万川集海", "戦闘時 知力+30"],
  ["忍秘伝", "戦闘時 知力+30"],
  ["武家町設計図", ""],
  ["牧場設計図", ""],
  ["忍の里設計図", ""],
  ["座の免許札", ""],
  ["聖母マリア像", "国宝専用（個人効果はありません）"],
];

/** 個人装備時の効果が明記された品物のみ。由来だけ書かれた国宝は未確認。 */
const TREASURE_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["神龍の腕輪", "戦闘時 武力+50"],
  ["神龍の宝珠", "戦闘時 知力+50"],
  ["神龍の護符", "戦闘時 統率力+50"],
  ["神龍の首飾り", "戦闘時 武力・知力・統率力+30"],
  ["神龍の兜", "戦闘時 攻撃力+50"],
  ["戦乙女の兜", "戦闘時 攻撃力+77"],
  ["銀塊", "高く売れる"],
  ["金塊", "高く売れる"],
  ["財宝", "くそ高く売れる"],
  ["賢者の聖典", "邪悪な力を浄化したり、味方につけたり出来る。"],
  ["賢者の石", "兵種AT追加"],
  ["西楚の覇王", "戦闘時 兵数-20%、訓練度+20、武力・統率力・士気+30、五連戦まで可能"],
  ["漢王の人徳", "戦闘時 兵数+20%、統率力+30"],
  ["諸葛亮の白羽扇", "常時 政治力・知力+50"],
  ["アイスティー（？）", "特殊計略"],
];

function normalizeEquipmentName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

const effects = new Map<string, EquipmentStatEffect>();
for (const [items, sourceUrl] of [
  [SHOP_ITEMS, SHOP_SOURCE],
  [TREASURE_ITEMS, TREASURE_SOURCE],
] as const) {
  for (const [name, description] of items) {
    effects.set(normalizeEquipmentName(name), {
      bonuses: parseEquipmentBattleBonuses(description),
      description,
      sourceUrl,
    });
  }
}

/** 既知の補正なしは bonuses: {}、未確認の品物は null。空文字も未確認扱い。 */
export function getEquipmentStatEffect(name: string): EquipmentStatEffect | null {
  const effect = effects.get(normalizeEquipmentName(name));
  // 呼び出し側が足し算等で変更してもマスタを壊さない。
  return effect ? { ...effect, bonuses: { ...effect.bonuses } } : null;
}
