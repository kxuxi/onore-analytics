export type TabKey = "home" | "history" | "scout" | "db" | "damage" | "units" | "weapons" | "items" | "nations" | "factions" | "swi" | "unitrank" | "weaponrank" | "itemrank" | "synergy" | "matrix" | "metaenv";

export interface Warlord {
  /** 武将名（プライマリキー） */
  name: string;
  /** 家督名（同じ家督名を持つ異なる名前は同一武将と見なす） */
  household?: string;
  /** 所属している国（勢力名） */
  faction?: string;
  /** タイプ: 武特 / 統特 / 知特 / 武統 / 統知 / 知武 / 政治家 / 謎 など */
  type: string;
  /** 兵科: 騎兵 / 歩兵 / 弓兵 / 万能 / 妖怪 など */
  branch: string;
  /** 兵種名 (例: 重騎兵 など) — 参考情報 */
  unit?: string;
  /** 戦闘履歴上の年月 + 時刻（生文字列） */
  battleAt?: string;
  /** 攻撃側または守備側として登場した最新の行動時刻（例: 06/15 09:30） */
  lastActionAt?: string;
  /** 攻撃側として登場した行動時刻の履歴（昇順・重複なし）。守備時刻は含まない。 */
  actions?: string[];
  /** 最後に登録された期番号（登録時にセット。パース中間オブジェクトでは省略可） */
  term?: number;
  /** ローカル登録時刻（ミリ秒） */
  updatedAt: number;
  /** 武力（ランキング取り込み） */
  power?: number;
  /** 知力（ランキング取り込み） */
  intelligence?: number;
  /** 統率力（ランキング取り込み） */
  leadership?: number;
  /** 政治力（ランキング取り込み） */
  politics?: number;
  /** 計略（ランキング取り込み・小数あり 例: 102.5） */
  strategy?: number;
  /** 自己PR（ランキング取り込み） */
  selfPr?: string;
  /** 取り込み元の生テキスト（未使用項目の保全用） */
  statsRaw?: string;
}

export type WarlordMap = Record<string, Warlord>;

/** 登録した戦闘履歴の 1 行（生データ） */
export interface BattleRecord {
  /** DB レコード ID（登録後は必須、登録前は不要） */
  id?: number;
  /** 生の行テキスト（タブ等を含む、前後空白は除去済み） */
  line: string;
  /** 表示用の戦闘時刻（例: 1687年5月 06/15 09:30） */
  time?: string;
  /** 期番号（145期など）。登録時に選択中の期を付与する。 */
  term: number;
  /** ローカル保存時刻（ミリ秒） */
  savedAt: number;
}

/** 兵種マスタの 1 件 */
export interface UnitType {
  /** 兵種名（プライマリキー・上書き判定に使用） */
  name: string;
  /** 種類（万能/歩兵/弓兵/騎兵/小型船/特殊船/軍艦/妖怪 など） */
  category: string;
  /** 得意兵種 */
  goodAgainst: string;
  /** 攻撃 */
  attack: number;
  /** 防御 */
  defense: number;
  /** 雇用金（例: 金:120） */
  cost: string;
  /** 技術 */
  tech: string;
  /** 年数 */
  years: string;
  /** 必要能力値（例: 統率:60） */
  reqStats: string;
  /** 施設/国宝 */
  facility: string;
  /** 特殊攻撃 */
  special: string;
  /** ボーナス */
  bonus: string;
}

/** ログイン中の管理者ユーザー（クライアントが扱う最小限の情報）。 */
export interface AuthUser {
  /** ユーザー ID。 */
  id: number;
  /** ログイン ID。 */
  username: string;
}
