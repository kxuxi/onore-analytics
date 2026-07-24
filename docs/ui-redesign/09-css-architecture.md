# UI 09: CSSの責務分割

## 状態

実装・検証完了

## 依存関係

- UI 08

## 実施結果

### 変更内容

- `app/globals.css`を単一entrypointのまま残し、既存6,724行をcascade順どおり15個の責務別CSSへ分割した
- `postcss-import`で分割ファイルを先に結合し、Next.js既定相当のPostCSS変換を同じ順番・同じbrowser targetで適用した
- import順、ファイル存在、named containerの所有範囲、PostCSS plugin順を`lib/cssArchitecture.test.ts`の4テストで固定した
- 参照0を静的検索、動的class生成、HTML注入、実装履歴、既存テストから確認した旧CSSを571行削除した
- 分割前後の17画面をLight / Dark、Desktop / Mobile、Dialog展開を含めて保存した

実装はロールバック単位を分けた。

- `a0a355e`: 挙動を変えない機械的分割
- `a334e9e`: 参照されない旧CSSだけを削除

### 変更理由

単一ファイルでは、1画面の変更でも6,000行を超えるcascadeを横断して所有箇所を探す必要があった。責務と読込順を明示して探索範囲を狭め、既にUIから置換された旧実装だけを除くことで、保守性と配信量を同時に改善するため。

### 互換性

- 機械的分割直後に15ファイルを連結したsourceは、変更前と134,042 bytes・SHA-256 `b085a090a5f2e4f32c2c4c7186a1e3ef0f8da0c0eac88baccc5617786ff62915`でbyte単位に一致した
- 機械的分割直後のproduction CSSも、変更前と1 asset・100,276 bytes・gzip 17,954 bytes・SHA-256 `f80d2585583615652511cc21ec89558c30c3098947ca4684077a212238cfcb01`でbyte単位に一致した
- root layoutのimport、現役class、token値、breakpoint、named container、Dark / Lightテーマ、URL、component、API、DB、環境変数、保存方式は変更していない
- `@media` 22件と`@container` 5件は削除後も不変。4件あったkeyframesは、参照0の`slide-in`だけを除き3件を維持した
- `.rank-side-active`、`.rank-users`、`rank-${rank}`、`dl-result--${result}`、`bh-result--${winner}`、`bh-tag--${kind}`等の現役・動的classは削除していない

### 検証結果

- `npm test`: 43ファイル / 408件成功
- `npm run lint`: warning・errorなし
- `npm run typecheck`: 成功
- `npm run build`: 成功
- `git diff --check`: 成功
- 15 CSSファイルのPostCSS構文解析: 成功
- production HTMLが参照するCSS: Home / Loginとも一意に1 asset
- 17画面の横方向overflow: 0件
- screenshot実行中のwrite request: 0件
- Chrome Rule Usage: production stylesheet 1件、観測30 range中30 range使用。訪問matrix内だけの補助値として扱った

### Before / After

| 指標 | Before | After | 差分 |
| --- | ---: | ---: | ---: |
| source行数 | 6,724 | 6,153 | -571（-8.49%） |
| source bytes | 134,042 | 123,571 | -10,471（-7.81%） |
| rule | 1,025 | 932 | -93（-9.07%） |
| declaration | 3,762 | 3,428 | -334（-8.88%） |
| production CSS asset | 1 | 1 | 変更なし |
| production CSS bytes | 100,276 | 92,077 | -8,199（-8.18%） |
| production CSS gzip | 17,954 | 16,798 | -1,156（-6.44%） |
| `@media` / `@container` | 22 / 5 | 22 / 5 | 変更なし |

17画面のPNGは11件がSHA-256まで完全一致した。残る6件は各5〜7画素、channel差最大9/255のアンチエイリアス差だけで、レイアウト・色・文字・状態の差はなかった。再撮影では差が出る画面が入れ替わり、初回差分の3画面がBeforeと完全一致したため、Chromeの非決定的なラスタライズ揺らぎと判定した。

### 残っているリスク

- `postcss.config.js`はNext.js内蔵PostCSS pluginとbrowser targetを参照する。Next.js更新時はplugin path、対象browser、production CSS asset数を再検証する
- static searchで参照0でも、リポジトリ外の未管理ブラウザ拡張等が内部classを流用している可能性までは保証できない。ただしpackageはprivateで、公開class契約や外部HTML注入経路はない
- Chrome screenshotは数画素のアンチエイリアス揺らぎがあるため、今後もhashだけでなく差分画素数・位置・目視を併用する

## 目的

単一の`app/globals.css`へ積み重なったデザイントークン、共通部品、各画面、レスポンシブ規則を、現在のcascade、specificity、読み込み順を変えずに責務別ファイルへ分割する。変更箇所の特定と回帰確認を容易にし、参照を完全に追跡できる死蔵CSSだけを独立工程で削除する。

## 変更前の構成

- 読込経路は`app/layout.tsx`の`import "./globals.css"`だけ
- `app/globals.css`: 6,724行、134,042 bytes
- rule 1,025件、declaration 3,762件、comment 151件
- `@media` 22件、`@container` 5件、`@keyframes` 4件
- source SHA-256: `b085a090a5f2e4f32c2c4c7186a1e3ef0f8da0c0eac88baccc5617786ff62915`
- Next.js production CSS: 1ファイル、100,276 bytes、gzip 17,954 bytes

現行CSSにはコメントによる責務区切りがあり、token、Header、Sidebar、FilterPanel、Battle History、管理フォーム、詳細、ランキング、図鑑、分析、設定、Homeの順に並ぶ。分割後もこの順番をそのまま維持する。

## 現状の良い点

- 色、余白、文字、radius、shadow、motionのtokenが`:root`へ集約されている
- Lightテーマ固有の上書きが`data-theme`で明示されている
- Battle HistoryとCatalogはnamed containerとqueryが同じ責務範囲にまとまっている
- page固有のmedia queryは多くが各セクション末尾に置かれている
- Reduced Motion、focus、skip link、screen reader utilityが既に用意されている
- CSS Modules、CSS-in-JS、runtime style依存がなく、連続sliceによる機械的分割が可能

## 主な問題

| 重大度 | 問題 | 原因・影響 |
| --- | --- | --- |
| ★★★★★ | 1ファイルが6,724行 | 1画面の修正でも全体のcascadeを読み解く必要があり、レビューと回帰確認の範囲が広い |
| ★★★★★ | 同名selectorの段階上書きが散在 | `.th-sort`、`.table-wrap`、`.bh-card`等を単純な重複と判断すると最終computed valueを壊す |
| ★★★★☆ | 共通responsiveが後段ページにも影響 | 3,005〜3,268行の規則を末尾へ再配置すると、現状のsource orderが変わる |
| ★★★☆☆ | 旧実装の専用CSSが残る | Drawer、旧戦闘ログ、旧ランキング、旧Home card等が探索時のノイズと配信量を増やす |
| ★★★☆☆ | CSSの所有範囲が文書化されていない | 新規規則を置く位置が判断しづらく、単一ファイル末尾へ追加されやすい |

## 維持する外部・表示契約

- `app/globals.css`をroot layoutから読む単一entrypoint
- 現在使用中のclass名、attribute selector、theme token名
- Dark / Light / System / Autoのcomputed color
- 360 / 480 / 520 / 560 / 600 / 640 / 680 / 720 / 767 / 960px等の既存breakpoint
- `battle-history`と`catalog-results`のcontainer nameとquery
- `spin`、`fade-in`、`skeleton-shimmer`の現役animation。旧Drawer専用で参照0の`slide-in`だけはcleanup候補とする
- focus、hover、active、disabled、loading、empty、error、reduced motionの状態
- CSSの配信を1 assetにまとめること
- URL、React component、API、DB、環境変数、保存値、ユーザー操作

## cascade監査

移動・統合しない重要箇所:

- 167〜196行のLight固有規則は、後方のbase ruleより先にあるが高いspecificityで勝つ。分かりやすさのため後方へ移さない
- `.th-sort`は1,355行と1,416行の2段階で最終値を構成する。分割工程では統合しない
- Battle Historyの同名selectorはcontainer queryで意図的に上書きされるため、定義からqueryまで同じファイルに置く
- 3,005〜3,268行の共通responsiveは前方のshell/control/tableを上書きする一方、後方のページ規則より先にある。この位置を維持する
- `prefers-reduced-motion`は`!important`を含むため、systemセクションの現在位置から移動しない
- 広域selectorの`html`、`body`、`button`、`input`、`table`、`.panel`、`.row`、`.filter`、`.tag`は全画面へ常時読み込む

## 分割設計

`app/globals.css`は次の15ファイルを列挙するentrypointにする。各ファイルは現行範囲をコメント・空白込みで連続sliceし、表の順番を変えない。

| 読込順 | 現行行 | 行数 | bytes | 責務 |
| --- | ---: | ---: | ---: | --- |
| `01-tokens-theme.css` | 1–198 | 198 | 6,099 | Dark / Light tokenとtheme固有上書き |
| `02-foundations.css` | 199–315 | 117 | 2,633 | reset、base form、focus、utility |
| `03-shell.css` | 316–907 | 592 | 11,288 | Header、Drawer、Sidebar、Main、sub navigation |
| `04-controls.css` | 908–1,277 | 370 | 7,592 | PageHeader、button、input、filter、Scout、Unit form |
| `05-data-display.css` | 1,278–1,735 | 458 | 8,477 | stat、table、sort、pager、search、FilterPanel |
| `06-battle-history.css` | 1,736–2,382 | 647 | 12,773 | Battle History cardとcontainer query |
| `07-admin-feedback.css` | 2,383–3,004 | 622 | 13,092 | 国色、tag、import、status、toast、modal |
| `08-responsive-tables.css` | 3,005–3,268 | 264 | 6,676 | 共通responsiveとmobile table card |
| `09-login.css` | 3,269–3,452 | 184 | 3,477 | Loginと内部responsive |
| `10-details.css` | 3,453–4,011 | 559 | 10,061 | 詳細共通、Section、Battle Log、Unit spec |
| `11-rankings-insights.css` | 4,012–4,758 | 747 | 13,220 | Insight、勝率、SWI、ランキング、指標 |
| `12-catalog.css` | 4,759–5,090 | 332 | 6,491 | 図鑑、catalog query、装備synergy |
| `13-analytics.css` | 5,091–5,771 | 681 | 13,048 | matrix、meta、heatmap、遍歴、推移 |
| `14-system.css` | 5,772–5,906 | 135 | 2,447 | preview、skeleton、reduced motion、theme設定 |
| `15-home.css` | 5,907–6,724 | 818 | 16,668 | Home dashboardと内部responsive |

数字prefixと`globals.css`の明示的な`@import`順を一致させる。ページごとの遅延読込やcascade layerは導入せず、現在と同じ全体global CSSとして1 assetへbundleする。

## 重複・未使用監査

### 維持する重複

- `.th-sort`、`.table-wrap`、`thead th`: baseと後段の最終値を合成
- `.bh-*`: container queryによるresponsive上書き
- `.ranking-metric-grid`、`.catalog-*`、`.home-*`: media/container queryの上書き
- `vh`の直後にある`dvh`: 古いbrowser向けfallback
- safe-area変数を加算した`bottom` / `right`: fallbackとnotch対応

### 分割後に削除した死蔵CSS

次は`app`、`components`、`lib`の静的参照、動的class生成、`classList`、HTML注入、関連実装の削除履歴を調査し、専用classの参照が0件だったもの。分割とは別commitで削除し、削除前後を独立検証した。

- 旧Drawerと専用`slide-in`
- `.btn-block`
- 旧table column filter
- 旧`.log-*`戦闘ログ
- `.mono`
- 旧`.swi-formula` / `.swi-weight-table`
- `.pill-anti-group`
- 旧所属補助class
- 旧`.rank-*`ランキング
- `.rank-sep`
- 旧`.trend-*`棒グラフ
- 旧Home rate / trend / action / meta / rival群
- 完全同一の`.th-sort:hover`重複1件

`rank-${rank}`、`dl-result--${result}`、`bh-result--${winner}`、`bh-tag--${kind}`のような動的classは静的な完全一致検索で見つからなくても削除しない。Chrome Coverageは訪問したrouteと状態しか観測しないため、単独では削除根拠に使わない。

## 実装計画

| 順番 | 変更対象 | 変更理由 | 期待する効果 | 影響範囲 | 破壊的変更の可能性 | 確認方法 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | current CSS、主要画面 | 分割前の基準が必要 | 視覚、source、bundle sizeを固定 | 記録のみ | なし | source hash、production asset、Light/Dark画像 |
| 2 | `app/styles/*.css`、`globals.css` | 単一ファイルの責務が大きい | 所有範囲と探索性を改善 | CSSの物理配置 | 低。連続sliceと同順importのみ | 分割ファイル結合hash、PostCSS AST、production CSS hash |
| 3 | CSS architecture test、README | import順の入れ替えを自動検出できない | 将来のcascade事故を防ぐ | テスト・文書のみ | なし | import順、全ファイル存在、1 assetを確認 |
| 4 | 参照0の死蔵CSS | 旧実装が保守と配信のノイズ | 行数・配信量を安全に削減 | 未使用styleのみ | 低〜中。独立commit | exact class検索、全test、主要state、Visual diff |
| 5 | Before / Afterと全検証 | split後の微細なcascade差を検出 | 見た目不変を証明 | 全画面 | なし | pixel比較、Coverage補助、raw/gzip byte、全自動検証 |

## 確認方法

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- 分割直後に15ファイルを順番どおり結合し、変更前の134,042 bytesとSHA-256が一致すること
- production CSSのrule/declaration順、asset数、raw / gzip byteを比較すること
- Light / DarkのHome、History、Ranking、Catalog、Detail、Admin、Login、Settings
- 320 / 390 / 480 / 680 / 768 / 960 / 1024 / 1440px
- hover、focus、filter open、table card、modal、toast、skeleton、reduced motion
- Chrome Rule Usageは訪問matrixの補助証跡として保存し、未使用削除の唯一の根拠にはしない

## 受入条件

- root layoutと`globals.css` entrypointを維持する
- 分割直後の連結sourceが変更前とbyte単位で一致する
- Next.js production CSSが1 assetのままで、機械分割時のminified hashが一致する
- cleanup後のproduction CSS raw / gzip byteが基準以下になる
- 現役selector、computed value、breakpoint、animation、container queryを変更しない
- 主要画面のBefore / Afterに意図しないpixel差がない
- 重複・未使用削除の参照根拠と、削除しなかった動的classを記録する

## このPRで変更しないもの

- CSS Modules、CSS-in-JS、Tailwind CSS、cascade layerへの移行
- class名のrename
- token値、色、余白、文字、radius、shadow
- breakpoint、container name、animation timing
- 視覚デザインやレイアウト
- component、API、route、DB、環境変数、保存方式
- Coverageだけを根拠にした削除

## リスク

- CSS `@import`のbundle処理がsource orderやasset数を変える可能性がある。production buildで一致しなければ、root layoutの明示importを含む代替を検証し、悪化する方式は採用しない
- global selectorは画面をまたいで作用するため、1画面の確認だけでは不足する
- static searchで未使用でも外部スクリプトが私有classを注入する可能性は完全には証明できない。公開classと判断できない旧専用styleだけに限定する
- screenshotは時刻、データ取得、animationで差が出る。比較時はテーマ、viewport、期、動的表示、motionを固定する

## ロールバック

分割commitと死蔵CSS cleanup commitを分ける。分割に問題があれば15ファイルを現行順で`globals.css`へ再結合し、cleanupだけに問題があれば削除commitだけを戻す。component、API、DBには触れない。
