import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CityMapResetDialog } from "./CityMapResetDialog";

function renderDialog(props: { busy?: boolean; error?: string; accountMismatch?: boolean } = {}) {
  return renderToStaticMarkup(<CityMapResetDialog busy={false} error="" onClose={() => {}} onConfirm={() => {}} {...props} />);
}

describe("CityMapResetDialog", () => {
  it("削除対象と取り消せないことを確認し、キャンセルを先頭の操作にする", () => {
    const html = renderDialog();

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="city-map-reset-title"');
    expect(html).toContain('aria-describedby="city-map-reset-description city-map-reset-warning"');
    expect(html).toContain("地図、都市の偵察情報、行商人の年月設定を削除します");
    expect(html).toContain("未保存の入力も破棄されます");
    expect(html).toContain("戦闘履歴や他のアカウントのデータは削除されません。元に戻せません。");
    expect(html.match(/<button[^>]*>(.*?)<\/button>/g)?.[0]).toContain("キャンセル");
    expect(html).toContain('class="btn btn-danger"');
    expect(html).not.toContain("disabled");
  });

  it("処理中はキャンセルと再送信を無効にし、通信失敗では再試行できる", () => {
    const busyHtml = renderDialog({ busy: true });
    const errorHtml = renderDialog({ error: "リセットに失敗しました" });

    expect(busyHtml).toContain('aria-busy="true"');
    expect(busyHtml.match(/disabled=""/g)).toHaveLength(2);
    expect(busyHtml).toContain("リセット中…");
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("リセットに失敗しました");
    expect(errorHtml).toContain("リセットする");
    expect(errorHtml).not.toContain("disabled");
  });

  it("アカウントが変わった場合はリセットの再送信を許さず再読み込みを案内する", () => {
    const html = renderDialog({ error: "アカウントを確認してください", accountMismatch: true });

    expect(html).toContain("ページを再読み込み");
    expect(html).toContain("アカウントが変更されています");
    expect(html).not.toContain("リセットする");
    expect(html).not.toContain("btn-danger");
    expect(html).toContain("キャンセル");
  });
});
