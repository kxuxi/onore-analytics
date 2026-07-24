import Link from "next/link";

/**
 * カスタム 404 ページ。未定義のパスでもブランド体験を保ち、
 * トップ（戦闘履歴）への導線を示す。
 */
export default function NotFound() {
  return (
    <div className="app">
      <main className="main" style={{ padding: 24 }}>
        <div className="panel">
          <h1 className="page-state-title">ページが見つかりません</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            お探しのページは存在しないか、移動した可能性があります。
          </p>
          <div className="row">
            <Link className="btn btn-primary" href="/">
              戦闘履歴へ戻る
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
