/**
 * 武将の戦績を 1 枚の画像カード（PNG）に描画するクライアント専用ヘルパー。
 * SNS やゲーム内チャットで共有できるよう、canvas 2D で手続き的に描く。
 * SSR や canvas 非対応環境では null を返す（呼び出し側でフォールバック）。
 */

/** カード描画に必要な戦績データ。 */
export interface WarlordCardData {
  name: string;
  faction?: string;
  type?: string;
  branch?: string;
  battles: number;
  wins: number;
  losses: number;
  /** 勝率 0..1。 */
  winRate: number;
  /** 勝敗が確定した数（0 のとき勝率は「—」表示）。 */
  decided: number;
}

/** カードの論理サイズ（描画は 2 倍解像度）。 */
const CARD_W = 1200;
const CARD_H = 630;

/** 日本語を含むフォントスタック（canvas 用）。 */
const FONT = '"Hiragino Sans", "Noto Sans JP", system-ui, sans-serif';

/** 角丸矩形のパスを引く（塗り／線は呼び出し側で行う）。 */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 指定幅に収まるよう末尾を省略記号で切り詰める。 */
function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * 戦績カードを描画して PNG の Blob を返す。失敗時は null。
 * デザインは OpenGraph 画像（ダーク＋青のグラデ）に合わせた横長カード。
 */
export async function renderWarlordCardBlob(
  data: WarlordCardData
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  // 背景グラデーション。
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#0f1115");
  bg.addColorStop(0.5, "#151c29");
  bg.addColorStop(1, "#0d2236");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 右上の装飾リング（アクセント）。
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#6aa9ff";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(CARD_W - 150, 150, 120, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 内枠（角丸）。
  roundRectPath(ctx, 40, 40, CARD_W - 80, CARD_H - 80, 28);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ブランド（右上）。
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("ONORE ANALYTICS", CARD_W - 72, 100);

  // 見出しラベル。
  ctx.textAlign = "left";
  ctx.fillStyle = "#6aa9ff";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText("戦績カード", 80, 132);

  // 武将名（大）。
  ctx.fillStyle = "#f5f7ff";
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(truncate(ctx, data.name, CARD_W - 300), 78, 218);

  // タグ（所属国／タイプ／兵種）。
  const tags = [data.faction, data.type, data.branch].filter(
    (t): t is string => !!t
  );
  let tx = 80;
  ctx.font = `600 26px ${FONT}`;
  for (const t of tags) {
    const label = truncate(ctx, t, 320);
    const w = ctx.measureText(label).width + 32;
    roundRectPath(ctx, tx, 252, w, 46, 12);
    ctx.fillStyle = "rgba(106,169,255,0.14)";
    ctx.fill();
    ctx.fillStyle = "#bcd4ff";
    ctx.fillText(label, tx + 16, 283);
    tx += w + 12;
  }

  // 左下：大きな勝率。
  const rateText =
    data.decided > 0 ? `${Math.round(data.winRate * 100)}%` : "—";
  ctx.fillStyle = "#f5f7ff";
  ctx.font = `700 150px ${FONT}`;
  ctx.fillText(rateText, 74, 470);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText("勝率", 80, 520);

  // 右下：勝敗と総戦闘数。
  ctx.textAlign = "right";
  ctx.fillStyle = "#22c55e";
  ctx.font = `700 72px ${FONT}`;
  ctx.fillText(
    `${data.wins.toLocaleString("ja-JP")} - ${data.losses.toLocaleString(
      "ja-JP"
    )}`,
    CARD_W - 80,
    432
  );
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText("勝敗", CARD_W - 80, 472);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(
    `${data.battles.toLocaleString("ja-JP")} 戦`,
    CARD_W - 80,
    528
  );

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
}

/** Blob をファイルとしてダウンロードする。 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 画像 Blob をクリップボードにコピーする。成否を boolean で返す。
 * ClipboardItem 非対応（Firefox 等）や権限拒否では false。
 */
export async function copyImageBlob(blob: Blob): Promise<boolean> {
  try {
    if (
      typeof ClipboardItem === "undefined" ||
      !navigator.clipboard?.write
    ) {
      return false;
    }
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}
