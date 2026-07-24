import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportMessage, ImportPreview } from "./ImportFeedback";

describe("ImportPreview", () => {
  it("取り込み可能件数と除外行数をparserの結果どおり表示する", () => {
    const markup = renderToStaticMarkup(
      <ImportPreview id="preview" parsed={12} skipped={3} />
    );

    expect(markup).toContain('id="preview"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("取り込み可能 12件 / 除外 3行");
    expect(markup).not.toContain("invalid");
  });

  it("有効行がない理由をボタン操作前に示す", () => {
    const markup = renderToStaticMarkup(
      <ImportPreview id="preview" parsed={0} skipped={2} />
    );

    expect(markup).toContain("import-preview invalid");
    expect(markup).toContain("取り込み可能な行がありません / 除外 2行");
  });
});

describe("ImportMessage", () => {
  it("失敗はalert、単独の成功はstatusとして通知する", () => {
    const errorMarkup = renderToStaticMarkup(
      <ImportMessage
        id="result"
        message={{ kind: "error", text: "取り込みに失敗しました" }}
      />
    );
    const successMarkup = renderToStaticMarkup(
      <ImportMessage
        id="result"
        message={{ kind: "ok", text: "取り込み完了" }}
      />
    );

    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain('aria-live="assertive"');
    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain('aria-live="polite"');
  });

  it("親でも成功を通知する画面ではローカル成功を二重通知しない", () => {
    const markup = renderToStaticMarkup(
      <ImportMessage
        id="result"
        message={{ kind: "ok", text: "取り込み完了" }}
        announceSuccess={false}
      />
    );

    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain("aria-live");
    expect(markup).toContain("取り込み完了");
  });
});
