"use client";

import { useEffect } from "react";

/**
 * App Router のグローバルエラーバウンダリ。
 * クライアント描画中に例外が起きても画面が真っ白にならないよう、
 * 分かりやすいメッセージと再試行（reset）/ホームへの導線を表示する。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 開発時の調査用にコンソールへ出力（本番でも害は無い）。
    console.error(error);
  }, [error]);

  return (
    <div className="app">
      <main className="main" style={{ padding: 24 }}>
        <div className="panel" role="alert">
          <h1 className="page-state-title">問題が発生しました</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            画面の表示中に予期しないエラーが発生しました。お手数ですが、もう一度お試しください。
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={reset}>
              再試行
            </button>
            <a className="btn" href="/">
              ホームへ戻る
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
