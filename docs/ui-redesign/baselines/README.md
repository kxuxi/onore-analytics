# UI回帰基準

## 基準

- 基準実装: PR #139
- 比較開始PR: #140
- テーマ: Light / Dark
- Viewport: 1440×1000、1024×1000、768×1000、500×1000
- データ状態: ローカル開発DBの同一スナップショット
- ブラウザ: ローカルにインストールされたChromium系ブラウザ

390pxの確認は実端末または通常のDevToolsで追加する。macOSのheadless Chromeはウィンドウ最小幅の影響を受けるため、自動撮影では500pxをモバイル基準とする。

## 必須画面

| 画面 | URL | 固定する契約 |
|---|---|---|
| ホーム | `/` | 未選択時の検索と選択済みダッシュボード |
| 戦闘履歴 | `/history` | 件数、順序、フィルター、勝敗、参加者 |
| 武将ランキング | `/ranking` | 全期間、最低10回、フィルター表示 |
| 兵種ランキング | `/ranking/units` | 全期間、最低10回、兵種タイプ |
| 図鑑 | `/encyclopedia/units` | 列、並び順、管理者境界 |
| メタ | `/meta` | マトリクスの数値、凡例、行列 |
| 国 | `/nations` | 順位、戦闘数、詳細導線 |
| ログイン | `/login` | フォーム、エラー、送信状態 |

## 保存済み基準画像

### Desktop

- [ホーム・Light](./images/home-desktop-light.png)
- [戦闘履歴・Light](./images/history-desktop-light.png)
- [武将ランキング・Light](./images/ranking-desktop-light.png)
- [武将ランキング・Dark](./images/ranking-desktop-dark.png)
- [兵種図鑑・Light](./images/encyclopedia-desktop-light.png)
- [メタ分析・Light](./images/meta-desktop-light.png)
- [国・Light](./images/nations-desktop-light.png)
- [ログイン・Light](./images/login-desktop-light.png)

### Mobile

- [戦闘履歴・Light](./images/history-mobile-light.png)
- [武将ランキング・Light](./images/ranking-mobile-light.png)
- [兵種図鑑・Light](./images/encyclopedia-mobile-light.png)

Darkの自動テーマは時刻依存のため、基準撮影ではブラウザプロセスのタイムゾーンを夜間になる地域へ固定している。

## 比較手順

1. 同じコミット・DB・ブラウザで開発サーバーを起動する。
2. APIの読み込み完了後に撮影する。
3. PRのBefore / Afterは同一URL、viewport、テーマ、スクロール位置で揃える。
4. 意図した差分にはPR本文で理由を付ける。
5. 数値、件数、順序、公開リンクの差分は画像だけでなくテストでも確認する。

## 自動検証

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

型チェックと本番ビルドは、どちらも `.next/types` を扱うため並列実行しない。
