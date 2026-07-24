import TurndownService from "turndown";

export { copyText } from "./copyText";

let service: TurndownService | null = null;

/**
 * Turndown インスタンスを遅延生成する（クライアント専用）。
 * ゲーム履歴は Markdown 文書ではなくプレーンな戦闘ログなので、
 * `*`（特殊兵種の接頭辞）や `()`・`[]` 等が Markdown のエスケープで
 * 壊れないよう、エスケープ処理を無効化しておく。
 */
function getService(): TurndownService {
  if (!service) {
    service = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      linkStyle: "inlined",
    });
    // エスケープ無効化: 後段のパーサーが生テキストをそのまま扱えるようにする。
    service.escape = (s: string) => s;
  }
  return service;
}

/**
 * クリップボードの HTML を Markdown に変換する。
 * `<a href>` が `[テキスト](URL)` になるため、戦闘ログの URL を保持できる。
 */
export function htmlToMarkdown(html: string): string {
  return getService().turndown(html).trim();
}
