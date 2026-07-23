export interface ImportMessageValue {
  kind: "ok" | "error";
  text: string;
}

/**
 * 貼り付け内容を送信する前に、parserが受理する件数と除外行数を示す。
 * parserの結果だけを表示し、入力や送信条件は変更しない。
 */
export function ImportPreview({
  id,
  parsed,
  skipped,
}: {
  id: string;
  parsed: number;
  skipped: number;
}) {
  const parsedText = parsed.toLocaleString("ja-JP");
  const skippedText =
    skipped > 0 ? ` / 除外 ${skipped.toLocaleString("ja-JP")}行` : "";

  return (
    <p
      id={id}
      className={`import-preview${parsed === 0 ? " invalid" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {parsed > 0
        ? `取り込み可能 ${parsedText}件${skippedText}`
        : `取り込み可能な行がありません${skippedText}`}
    </p>
  );
}

/**
 * 取込結果の見た目と通知方法を揃える。親でも成功Toastを出す画面は
 * announceSuccess=falseとして二重読み上げを避ける。
 */
export function ImportMessage({
  id,
  message,
  announceSuccess = true,
}: {
  id: string;
  message: ImportMessageValue | null;
  announceSuccess?: boolean;
}) {
  if (!message) return null;
  const isError = message.kind === "error";

  return (
    <span
      id={id}
      className={`import-msg ${isError ? "error" : "ok"}`}
      role={isError ? "alert" : announceSuccess ? "status" : undefined}
      aria-live={isError ? "assertive" : announceSuccess ? "polite" : undefined}
      aria-atomic={isError || announceSuccess ? "true" : undefined}
    >
      {message.text}
    </span>
  );
}
