/**
 * 自前認証のコアロジック（パスワードのハッシュ化とセッショントークンの署名）。
 *
 * 依存を増やさず Node 標準の `crypto` だけで完結させる。next/headers などの
 * フレームワーク API には依存しない純粋モジュールに保ち、テスト可能にする。
 * Cookie の読み書き自体は各 Route Handler 側で `cookies()` を使って行う。
 */
import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHmac,
} from "node:crypto";

/** セッションを格納する Cookie 名。 */
export const SESSION_COOKIE = "onore_session";

/** セッションの有効期間（秒）。Cookie の maxAge とトークンの exp に使う。 */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 日

/** scrypt の鍵長（バイト）。 */
const SCRYPT_KEYLEN = 64;

/** セッショントークンのペイロード（HMAC で署名し改ざんを検出する）。 */
export interface SessionPayload {
  /** ユーザー ID。 */
  uid: number;
  /** ログイン ID（表示用）。 */
  username: string;
  /** 失効時刻（ミリ秒・UNIX 時間）。 */
  exp: number;
}

/**
 * 平文パスワードを scrypt でハッシュ化する。salt を同梱した
 * `scrypt:<saltHex>:<hashHex>` 形式の文字列を返す（平文は保存しない）。
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * 平文パスワードが保存済みハッシュと一致するか検証する。
 * タイミング出兵を避けるため固定時間比較（timingSafeEqual）を用いる。
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * トークン署名用の秘密鍵を取得する。本番で未設定なら例外を投げて
 * 「弱い固定鍵で動いてしまう」事故を防ぐ（＝認証が失敗し安全側に倒れる）。
 */
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("環境変数 AUTH_SECRET が設定されていません（本番では必須）");
  }
  // 開発用の固定値。本番では必ず AUTH_SECRET を設定すること。
  return "onore-tool-dev-insecure-secret";
}

/** HMAC-SHA256 で署名済みのセッショントークン（`<body>.<sig>`）を生成する。 */
export function createSessionToken(
  user: { id: number; username: string },
  now: number = Date.now()
): string {
  const payload: SessionPayload = {
    uid: user.id,
    username: user.username,
    exp: now + SESSION_TTL_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

/**
 * セッショントークンを検証する。署名が正しく失効していなければ
 * ペイロードを、そうでなければ null を返す。
 */
export function verifySessionToken(
  token: string,
  now: number = Date.now()
): SessionPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as SessionPayload).uid !== "number" ||
    typeof (payload as SessionPayload).username !== "string" ||
    typeof (payload as SessionPayload).exp !== "number" ||
    (payload as SessionPayload).exp < now
  ) {
    return null;
  }
  return payload as SessionPayload;
}

/**
 * セッション Cookie のオプション。`secure` は本番のみ有効化し、
 * CSRF 緩和のため `sameSite=lax`、JS から読めないよう `httpOnly` にする。
 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
