# UI 11変更後Performance UX証跡

## 取得条件

- Source head: `3ceee7e`
- Browser: Google Chrome 150.0.7871.184
- Lighthouse: 13.4.1
- Node.js: 22.22.3
- Next.js: 14.2.35 production build
- データ: 共有DBの146期
- Home: Mobile / Desktopをfresh profileで各3回
- 代表直リンク: 武将ランキング / 戦闘履歴をMobileで各1回

ユーザーの開発サーバー、`.next`、`node_modules`を共有しない一時worktreeで
build・計測・全自動検証を行い、専用serverとworktreeを終了・削除した。

## 結果

| 指標 | Before | After | 判定 |
| --- | ---: | ---: | --- |
| Mobile CLS中央値 | 0.0191 | 0 | 100%削減 |
| Desktop CLS中央値 | 0.0299 | 0.00821 | 72.5%削減 |
| Mobile observed LCP中央値 | 1,420 ms | 1,771 ms | 2.5秒以内、ただし351 ms増加 |
| Desktop observed LCP中央値 | 1,578 ms | 1,267 ms | 19.7%改善 |
| Mobile TBT中央値 | 444 ms | 478 ms | 34 ms増加 |
| Desktop TBT中央値 | 72 ms | 72 ms | 同等 |
| Home転送量 | 9,486,939 B | 9,483,503 B | 3,436 B削減 |
| `/` First Load JS | 121 kB | 117 kB | 4 kB削減 |
| CSS gzip | 17,426 B | 17,547 B | 121 B増加 |

Mobileのobserved LCP、Speed Index、TBTはBeforeより悪化した一方、simulated LCPは
約48秒のまま実質不変だった。約9.3 MBの期データと実行時分散が支配的であり、
今回の変更だけによる速度改善とは断定しない。observed LCPは受入値2.5秒以内を
維持したが、TBTの非悪化条件はMobileでは満たしていない。
CSSもLoadingと初期shell安定化の規則によりgzip 121 B増加した。

武将ランキングはobserved LCPが2,255 msから1,335 ms、戦闘履歴は
1,767 msから1,673 msへ短縮し、両画面のCLSは0.0522から0になった。

## 依存境界

- Home初期経路からTurndownを除外し、HistoryのHTML変換経路には維持した
- 武将詳細の初期chunkからcanvas生成を除外した
- 戦績カード操作時chunkはraw 2,922 B / gzip 1,360 B
- 全client JS + CSSはraw 1,195,559 B / gzip 368,208 B
- CSSは1 asset、raw 95,738 B / gzip 17,547 B

## 残存リスク

- 武将詳細は全期間`/api/state`を追加取得し、本文は63,187,611 Bだった
- Desktop CLS 0.00821は、期一覧が非同期で0件から7件へ展開するときの
  `nav.nav`の縦移動である。sidebar幅とheader slot由来のshiftは0
- ローカルproduction serverは大きなJSONを圧縮せず、Lighthouseの
  simulated LCPを支配する
- `npm ci`は既存lockfileにhigh 7件を報告した。自動fixは破壊的更新の
  可能性があるため実施していない

詳細値、3回分の値、bundle寸法、代表ルート、受入結果は
`performance-results.json`へ記録した。生のLighthouse reportはサイズと
環境依存情報を含むためcommitせず、再現に必要な要約だけを保存する。
