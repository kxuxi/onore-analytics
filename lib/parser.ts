import type { Warlord } from "./types";

/**
 * テキストを 1 戦闘ごとのセグメントに分割する。
 * 区切りは「【N戦目】」マーカー。改行の有無に依存せず、マーカーの直前で
 * 分割するため、マークダウン形式で複数戦が 1 行に連結されていても対応できる。
 */
export function splitBattleSegments(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?=【[^】]*戦目】)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 戦闘履歴 1 行を解析しやすい形へ正規化し、含まれていれば URL を取り出す。
 *
 * ゲーム履歴をリンク付き（PC でコピー）で貼ると
 *   【N戦目】年月MM/DD HH:mm場所[攻撃側 V.S. 防衛側](URL)勝敗Nターンで終了
 * のように日時・場所・勝敗が詰まった形になる。`[本文](URL)` を検出した場合は
 * URL を取り出し、リンク本文を前後にスペースを足して展開する（場所と勢力名、
 * 装備と勝敗の境界がここで切れる）。
 *
 * スマホ等でコピーするとリンク記法が失われ、プレーンテキストとして
 *   【N戦目】年月MM/DD HH:mm場所勢力名 … V.S. … 装備2勝敗Nターン
 * のように詰まって貼られる。この場合でも解析できるよう、リンクの有無に
 * 関わらずメタ部（【N戦目】/年月/月日 時刻）と勝敗・ターン数の境界を
 * 区切り直す。従来のタブ区切り形式は空白がもともと入っているため影響を受けない。
 */
export function extractBattleUrl(line: string): { line: string; url?: string } {
  const m = line.match(/\[([\s\S]*?)\]\((https?:\/\/[^)\s]+)\)/);
  let url: string | undefined;
  let work = line;
  if (m) {
    url = m[2];
    const start = m.index ?? 0;
    // リンク記法を本文に置換し、前後にスペースを補って 1 行に均す。
    work =
      line.slice(0, start) + " " + m[1] + " " + line.slice(start + m[0].length);
  }

  const normalized = work
    // 【N戦目】 と直後の年月の境界（マーカーの 】 のみ。武将名に含まれる
    // 【大空】 のような 】 まで区切ると名前が割れてしまうため、戦目】 に限定する。
    .replace(/(戦目】)/g, "$1 ")
    // 年月 と 月日 の境界
    .replace(/(\d+年\d+月)/g, "$1 ")
    // 時刻(HH:mm) と 場所 の境界
    .replace(/(\d{1,2}:\d{2})(?=\S)/g, "$1 ")
    // 勝敗(◯◯の勝利 / 撤退 / 敗北 / 引分) と ターン数の境界
    .replace(/(勝利|撤退|敗北|引分)(?=\d)/g, "$1 ")
    // 「Nターン」表記の境界
    .replace(/(\d+)\s*ターン/g, " $1 ターン")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
  return { line: normalized, url };
}

/**
 * 戦闘履歴 1 行を解析して攻撃側・防衛側の武将情報を取り出す。
 *
 * 実データはタブと半角スペースが混在しており、戦闘部分は 1 つのフィールド内で
 * スペース区切りになっている:
 *   【N戦目】<TAB>年月<TAB>月日 時刻<TAB>場所<TAB>
 *   勢力名 武将名 家名 タイプ 兵種名 兵科 装備1 装備2 V.S. 勢力名 武将名 家名 タイプ 兵種名 兵科 装備1 装備2<TAB>
 *   勝敗<TAB>ターン数
 *
 * そのため区切りの種類に依存せず、行全体を空白（タブ/半角/全角）でまとめて分割し、
 * V.S. の前後 8 トークンずつを攻撃側・防衛側として取り出す。
 */
export function parseBattleLine(line: string): Warlord[] {
  const { line: raw } = extractBattleUrl(line.replace(/\r/g, "").trim());
  if (!raw) return [];

  // タブ・半角スペース・全角スペースをまとめて区切りにする。
  const tokens = raw
    .split(/[\s\u3000]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // 【N戦目】 で始まる行のみ対象
  if (tokens.length === 0 || !/^【.*戦目】/.test(tokens[0])) {
    return [];
  }

  // V.S. の位置を見つける
  const vsIndex = tokens.findIndex((t) => /^v\.?s\.?$/i.test(t));
  if (vsIndex < 0) return [];

  // 攻撃側: V.S. の直前 8 トークン
  //   = 勢力名 武将名 家名 タイプ 兵種名 兵科 装備1 装備2
  if (vsIndex < 8) return [];
  const attacker = sliceWarlord(tokens.slice(vsIndex - 8, vsIndex));

  // 防衛側: V.S. の直後 8 トークン（以降に 勝敗 / ターン数 が続く）
  if (tokens.length < vsIndex + 9) return [];
  const defender = sliceWarlord(tokens.slice(vsIndex + 1, vsIndex + 9));

  // 戦闘日時: 先頭の【N戦目】と攻撃側ブロックの間にあるメタ情報のうち
  // 末尾（場所）を除いたもの（年月 月日 時刻）を最終戦闘時刻として扱う。
  const meta = tokens.slice(1, vsIndex - 8);
  const { battleAt } = splitMeta(meta);
  // 実時刻部分（例: 06/15 09:30）を行動時刻として抽出。
  const actionAt = extractActionTime(battleAt);

  const now = Date.now();
  const shared = { battleAt, lastActionAt: actionAt, updatedAt: now } as const;
  const result: Warlord[] = [];
  // 攻撃側のみ actions を付ける。固定バッジは攻撃の連続行動パターンにのみ適用する。
  // 守備側は lastActionAt のみ記録し、被弾表には表示されるがバッジは付かない。
  if (attacker)
    result.push({ ...attacker, ...shared, actions: actionAt ? [actionAt] : undefined });
  if (defender) result.push({ ...defender, ...shared });
  return result;
}

/** "1687年5月 06/15 09:30" などから "06/15 09:30" を抽出する。 */
function extractActionTime(s: string): string | undefined {
  const m = s.match(/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/);
  return m ? m[0].replace(/\s+/, " ") : undefined;
}

/** トークンが日時要素（年月 / 月日 / 時刻）に見えるか。 */
function looksLikeDateTime(token: string): boolean {
  return (
    /^\d{1,2}:\d{2}$/.test(token) ||
    /^\d{1,2}\/\d{1,2}$/.test(token) ||
    /^\d+年\d+月$/.test(token)
  );
}

/**
 * 【N戦目】と攻撃側ブロックの間のメタ情報を「場所」と「戦闘日時」に分ける。
 *
 * 通常は [年月, 月日, 時刻, 場所] の並びで末尾が場所だが、スマホ等で
 * リンクが失われると場所が勢力名に連結し、メタは [年月, 月日, 時刻] だけになる。
 * その場合に末尾の時刻を場所と誤認しないよう、末尾が日時要素なら場所なしとみなし
 * 全体を戦闘日時として扱う（行動時刻の抽出が効くようにする）。
 */
function splitMeta(meta: string[]): { place?: string; battleAt: string } {
  if (meta.length > 1 && !looksLikeDateTime(meta[meta.length - 1])) {
    return { place: meta[meta.length - 1], battleAt: meta.slice(0, -1).join(" ") };
  }
  return { battleAt: meta.join(" ") };
}

/**
 * 末尾 8 トークン: [勢力名, 武将名, 家名, タイプ, 兵種名, 兵科, 装備1, 装備2]
 */
function sliceWarlord(
  block: string[]
): Omit<Warlord, "updatedAt" | "battleAt"> | null {
  if (block.length !== 8) return null;
  const [faction, name, household, type, unit, branch] = block;
  if (!name || !type || !branch) return null;
  return {
    name: name.trim(),
    household: household?.trim() || undefined,
    // 国名のプレースホルダー（なし/-/ー）は除去する。
    // 戦闘カード表示（sideFromBlock）と正規化を揃え、DBに偽の国名が残らないようにする。
    faction: cleanToken(faction),
    type: type.trim(),
    branch: branch.trim(),
    unit: normalizeUnit(unit),
  };
}

/**
 * 兵種名を整形する。
 * 先頭に `*` が付く場合（例: `*ノクスミーティア(カノン砲)`）や
 * 「オリジナル兵」と書かれている場合（例: `オリジナル兵(ドラグーン)`）は、
 * 括弧（半角/全角）内のテキストを採用する（例: `カノン砲` / `ドラグーン`）。
 */
function normalizeUnit(unit: string | undefined): string | undefined {
  const u = unit?.trim();
  if (!u) return undefined;
  if (u.startsWith("*") || u.includes("オリジナル兵")) {
    const m = u.match(/[（(]([^（()）]+)[）)]/);
    if (m && m[1].trim()) return m[1].trim();
  }
  return u;
}

/**
 * 複数行をまとめてパース。
 * 返り値は「最新が後勝ち」になるよう順序通り並んだ Warlord 配列。
 */
export function parseBattleLog(text: string): Warlord[] {
  const out: Warlord[] = [];
  for (const seg of splitBattleSegments(text)) {
    out.push(...parseBattleLine(seg));
  }
  return out;
}

export interface BattleEntry {
  /** 生の行テキスト（前後空白除去済み） */
  line: string;
  /** 戦闘時刻（例: 1687年5月 06/15 09:30） */
  time?: string;
  /** この行から取り出した武将 */
  warlords: Warlord[];
}

/** 取り込めなかった（項目の過不足がある）戦闘セグメント。 */
export interface RejectedBattle {
  /** 該当セグメントの生テキスト。 */
  segment: string;
  /** 例: "1戦目"。判別できなければ undefined。 */
  battleNo?: string;
  /** 取り込めなかった理由（利用者向けメッセージ）。 */
  reason: string;
}

/** 解析結果（取り込めた行と、項目の過不足で弾いた行）。 */
export interface BattleParseResult {
  entries: BattleEntry[];
  /** 項目数が想定と合わず取り込めなかった戦闘。 */
  rejected: RejectedBattle[];
}

/** セグメントが戦闘エントリの体裁（【N戦目】で始まる）かどうか。 */
function looksLikeBattleSegment(seg: string): boolean {
  return /^【[^】]*戦目】/.test(seg.trim());
}

/** 【N戦目】 から戦目番号（例: "1戦目"）を取り出す。 */
function battleNoOf(seg: string): string | undefined {
  const m = seg.trim().match(/^【([^】]*戦目)】/);
  return m ? m[1] : undefined;
}

/**
 * 戦闘エントリの体裁だが取り込めなかった理由を、項目（トークン）数から判定する。
 * 攻撃側・防衛側はそれぞれ 8 項目（勢力名 武将名 家名 タイプ 兵種名 兵科 装備1 装備2）
 * が必要で、これに過不足があると登録できない。
 */
function battleRejectReason(seg: string): string {
  const { line: raw } = extractBattleUrl(seg.replace(/\r/g, "").trim());
  const tokens = raw
    .split(/[\s\u3000]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const vsIndex = tokens.findIndex((t) => /^v\.?s\.?$/i.test(t));
  if (vsIndex < 0) return "「V.S.」の区切りが見つかりません";
  if (vsIndex < 8) return "攻撃側の項目数が不足しています";
  if (tokens.length < vsIndex + 9) return "防衛側の項目数が不足しています";
  return "必須項目（武将名・タイプ・兵科）が空です";
}

/**
 * 複数行をパースし、取り込めた行と「項目の過不足で取り込めなかった行」を
 * 分けて返す。戦闘エントリの体裁（【N戦目】で始まる）でない断片は対象外。
 */
export function parseBattleEntriesChecked(text: string): BattleParseResult {
  const entries: BattleEntry[] = [];
  const rejected: RejectedBattle[] = [];
  for (const seg of splitBattleSegments(text)) {
    // 前置きのメモ等、戦闘エントリの体裁でない断片は検証対象にしない。
    if (!looksLikeBattleSegment(seg)) continue;
    const warlords = parseBattleLine(seg);
    if (warlords.length === 0) {
      // 戦闘の体裁だが攻撃側／防衛側の項目数が想定と合わない（過不足）。
      rejected.push({
        segment: seg,
        battleNo: battleNoOf(seg),
        reason: battleRejectReason(seg),
      });
      continue;
    }
    // seg はマークダウンのリンク（URL）を含む原文のまま保持し、
    // 保存・表示時に URL を取り出せるようにする。
    entries.push({
      line: seg,
      time: warlords[0]?.battleAt,
      warlords,
    });
  }
  return { entries, rejected };
}

/**
 * 複数行をパースし、解析できた行ごとに
 * 生テキスト・戦闘時刻・武将情報をまとめて返す。
 */
export function parseBattleEntries(text: string): BattleEntry[] {
  return parseBattleEntriesChecked(text).entries;
}

/** 勝者側 */
export type BattleWinner = "left" | "right" | "draw" | "retreat" | "unknown";

/** カード表示用の片側（攻撃側 / 防衛側）情報 */
export interface BattleSide {
  faction?: string;
  name: string;
  family?: string;
  type: string;
  /** 兵種名（`*` 付きの特殊兵種を含む生テキスト） */
  unit?: string;
  branch: string;
  /** 装備（空・プレースホルダーは除去済み。[装備1, 装備2] の順） */
  equips: string[];
  /** 装備1（ゲームの装備1列）。空・プレースホルダーは undefined。 */
  equip1?: string;
  /** 装備2（ゲームの装備2列）。空・プレースホルダーは undefined。 */
  equip2?: string;
}

/** 1 戦闘行をカード表示用に構造化したもの */
export interface BattleCard {
  /** 例: "1戦目" */
  battleNo?: string;
  /** 場所 */
  place?: string;
  /** 戦闘時刻（例: 1583年4月 10:23） */
  battleAt?: string;
  /** ターン数 */
  turns?: string;
  left: BattleSide;
  right: BattleSide;
  /** どちらが勝ったか */
  winner: BattleWinner;
  /** 勝敗の生テキスト（例: 勝利 / 敗北 / 引分） */
  resultRaw: string;
  /** 戦闘ログ詳細ページの URL（マークダウン形式で貼られた場合のみ） */
  url?: string;
}

/** トークンが特殊アイテム（`*` 始まり）かどうか */
export function isSpecialToken(token: string): boolean {
  return token.trim().startsWith("*");
}

/**
 * 表示用にトークンを整形する。
 * `*` 始まり、または「オリジナル兵」を含む場合は括弧内テキストを採用する。
 * `*` 始まりで括弧が無ければ `*` を取り除く。
 */
export function normalizeDisplayToken(token: string): string {
  const t = token.trim();
  if (t.startsWith("*") || t.includes("オリジナル兵")) {
    const m = t.match(/[（(]([^（()）]+)[）)]/);
    if (m && m[1].trim()) return m[1].trim();
    if (t.startsWith("*")) return t.slice(1).trim();
  }
  return t;
}

function cleanToken(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t && t !== "なし" && t !== "-" && t !== "ー" ? t : undefined;
}

function sideFromBlock(block: string[]): BattleSide {
  const [faction, name, family, type, unit, branch, e1, e2] = block;
  // 装備1 / 装備2 は枠の位置を保持したいので個別に取り出す。
  // （どちらが武器/品物かは集計・表示側で振り分ける。）
  const equip1 = cleanToken(e1);
  const equip2 = cleanToken(e2);
  return {
    faction: cleanToken(faction),
    name: name?.trim() ?? "",
    family: cleanToken(family),
    type: type?.trim() ?? "",
    unit: unit?.trim() || undefined,
    branch: branch?.trim() ?? "",
    // 既存利用箇所のため、空枠を除いた配列表現も維持する（[装備1, 装備2] の順）。
    equips: [equip1, equip2].filter((e): e is string => !!e),
    equip1,
    equip2,
  };
}

/**
 * 防衛側ブロックの装備2と勝敗が連結している場合（スマホ等でリンクが失われ
 * 「…装備2◯◯の勝利」のように詰まったケース）に、既知の武将名を手掛かりに
 * 切り離す。連結が無ければ素直に従来通り（resultRaw=次トークン）を返す。
 */
function splitGluedResult(
  tokens: string[],
  vsIndex: number,
  leftName: string,
  rightName: string
): { rightBlock: string[]; resultRaw: string; turns?: string } {
  const rightBlock = tokens.slice(vsIndex + 1, vsIndex + 9);
  let resultRaw = tokens[vsIndex + 9] ?? "";
  let turnsRaw = tokens[vsIndex + 10];

  const equip2 = rightBlock[rightBlock.length - 1] ?? "";
  const suffixes = [
    leftName && `${leftName}の勝利`,
    rightName && `${rightName}の勝利`,
    "撤退",
    "敗北",
    "引分",
  ].filter((s): s is string => !!s);
  for (const suf of suffixes) {
    if (equip2.length > suf.length && equip2.endsWith(suf)) {
      rightBlock[rightBlock.length - 1] = equip2.slice(0, -suf.length);
      // 連結を解いた勝敗を結果に採用。元の結果トークン（数字なら）はターン数へ。
      if (turnsRaw === undefined && /^\d+$/.test(resultRaw)) turnsRaw = resultRaw;
      resultRaw = suf;
      break;
    }
  }

  const turns = turnsRaw && /^\d+$/.test(turnsRaw) ? turnsRaw : undefined;
  return { rightBlock, resultRaw, turns };
}

/**
 * パース結果のメモ化キャッシュ。`parseBattleCard` は行テキストに対して純粋なため、
 * 同じ行の再解析（統計関数の繰り返し呼び出し・再描画）を避けてコストを下げる。
 * 返すカードは読み取り専用前提で共有する（呼び出し側で変更しないこと）。
 */
const battleCardCache = new Map<string, BattleCard | null>();
const BATTLE_CARD_CACHE_MAX = 5000;

/**
 * 1 戦闘行をカード表示用に解析する。解析できない行は null。
 * トークン構造は parseBattleLine と同じ規則に従う。結果はメモ化される。
 */
export function parseBattleCard(line: string): BattleCard | null {
  const cached = battleCardCache.get(line);
  if (cached !== undefined) return cached;
  const result = computeBattleCard(line);
  // 上限を超えたら丸ごと破棄して無制限な肥大化を防ぐ（単純な世代式）。
  if (battleCardCache.size >= BATTLE_CARD_CACHE_MAX) battleCardCache.clear();
  battleCardCache.set(line, result);
  return result;
}

function computeBattleCard(line: string): BattleCard | null {
  const { line: raw, url } = extractBattleUrl(line.replace(/\r/g, "").trim());
  if (!raw) return null;

  const tokens = raw
    .split(/[\s\u3000]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0 || !/^【.*戦目】/.test(tokens[0])) return null;

  const vsIndex = tokens.findIndex((t) => /^v\.?s\.?$/i.test(t));
  if (vsIndex < 8) return null;
  if (tokens.length < vsIndex + 9) return null;

  const leftBlock = tokens.slice(vsIndex - 8, vsIndex);
  const rightBlockRaw = tokens.slice(vsIndex + 1, vsIndex + 9);
  const leftName = leftBlock[1]?.trim() ?? "";
  const rightName = rightBlockRaw[1]?.trim() ?? "";
  // 防衛側の装備2に勝敗が連結している場合は切り離す（スマホ貼り付け対策）。
  const { rightBlock, resultRaw, turns } = splitGluedResult(
    tokens,
    vsIndex,
    leftName,
    rightName
  );

  const left = sideFromBlock(leftBlock);
  const right = sideFromBlock(rightBlock);
  if (!left.name || !right.name) return null;

  // 先頭【N戦目】〜攻撃側ブロックの間が [年月, 月日, 時刻, 場所]。
  const meta = tokens.slice(1, vsIndex - 8);
  const { place, battleAt } = splitMeta(meta);

  // 勝敗カラムは「{勝者名}の勝利」または「撤退」の形式。
  // 勝者名は左右いずれかの武将名と一致するため、名前で勝者側を判定する。
  let winner: BattleWinner = "unknown";
  const winMatch = resultRaw.match(/^(.+?)の勝利$/);
  if (winMatch) {
    const w = winMatch[1].trim();
    if (w === left.name) winner = "left";
    else if (w === right.name) winner = "right";
    else winner = "unknown";
  } else if (/撤退/.test(resultRaw)) {
    winner = "retreat";
  } else if (/分/.test(resultRaw)) {
    winner = "draw";
  }

  const battleNo = tokens[0].replace(/[【】[\]]/g, "").trim() || undefined;

  return {
    battleNo,
    place: cleanToken(place),
    battleAt: battleAt || undefined,
    turns,
    left,
    right,
    winner,
    resultRaw: resultRaw || "不明",
    url,
  };
}

/**
 * 戦闘の重複判定に使う正規化キー。
 *
 * 同じ戦闘でも「ターン数」や「URL リンク」の有無など表記が異なると
 * 行テキストが変わってしまうため、行全体ではなく戦闘の同一性を表す
 * 情報（戦闘時刻・場所・両者の武将名と勢力・勝敗）からキーを組み立てる。
 * これによりターン数や URL の差異だけが違う同一戦闘は 1 件にまとまる。
 *
 * カードとして解析できない行は、従来どおり空白を圧縮した行全体をキーにする。
 */
export function battleKey(line: string): string {
  const card = parseBattleCard(line);
  if (!card) {
    return line
      .replace(/\r/g, "")
      .replace(/[\s\u3000]+/g, " ")
      .trim();
  }
  return [
    card.battleAt ?? "",
    card.place ?? "",
    card.left.faction ?? "",
    card.left.name,
    card.right.faction ?? "",
    card.right.name,
    card.winner,
  ].join("|");
}

