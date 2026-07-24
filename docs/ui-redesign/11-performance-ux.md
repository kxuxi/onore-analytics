# UI 11: Performance UX

## 状態

実装中（作業単位2 / 4完了）

## 依存関係

- UI 10（PR #149）

## 目的

表示データ、集計結果、並び順、URL、操作結果を変えずに、初期JavaScript、
遅延画面の待機フィードバック、初回レイアウトの安定性を改善する。

Core Web Vitalsの目標はLCP 2.5秒、INP 200ms、CLS 0.1以下とする。
ただしINPは実ユーザー操作を必要とするフィールド指標であり、Lighthouse単体では
測定できない。今回のPRではLCP / CLSに加え、TBT、Max Potential FID、
決定的な入力操作のEvent Timingを回帰指標として記録する。

## 調査範囲

- `app/page.tsx`の初期シェル、18個のdynamic view、データ読み込みSkeleton
- `useDataSync`、`useTermSelection`、`useSidebarLayout`、`AppHeader`
- Home、戦闘履歴、武将ランキング、図鑑、武将詳細
- clipboard / Turndown、戦績カード画像生成の依存境界
- production client chunk、CSS、API転送量、request waterfall
- 既存のmemo化、遅延検索、ページング、解析キャッシュ

## 現状の良い点

- 各タブと詳細画面は`next/dynamic`で分割され、非表示画面を初期評価しない
- 初回は期一覧と国色だけを並列取得し、戦闘履歴は選択期だけを取得する
- 全期間ログは武将詳細で必要になったときだけ取得し、同一セッションでキャッシュする
- 戦闘履歴は20件ずつ表示し、検索と貼り付けプレビューに`useDeferredValue`を使う
- 戦闘ログ解析、名前解決、兵種マスタ取得には参照キャッシュとinflight共有がある
- 外部画像とWebフォントがなく、SVGには寸法またはviewBoxがある
- テーマは初期描画前のhead scriptで確定し、色のちらつきを抑えている
- reduced motionとデータ読み込みSkeletonがすでにある
- CSSは1 asset / gzip約17.4 kBで、画面別分割の優先度は低い

## 変更前基準

実装HEAD `81e23db`を隔離production buildし、Chrome 150 /
Lighthouse 13.4.1で同じローカルDBの146期を測定した。
HomeはMobile / Desktopを各3回実行し、中央値を基準とする。

| 指標 | Mobile中央値 | Desktop中央値 |
| --- | ---: | ---: |
| Performance score | 64 | 75 |
| FCP（simulated） | 904 ms | 244 ms |
| LCP（simulated） | 48,037 ms | 7,853 ms |
| LCP（observed） | 1,420 ms | 1,578 ms |
| TBT | 444 ms | 72 ms |
| Max Potential FID | 494 ms | 122 ms |
| CLS | 0.0191 | 0.0299 |
| 総転送量 | 9,486,939 B | 9,486,939 B |

代表的なMobile直リンクは、武将ランキングがobserved LCP 2,255 ms /
CLS 0.0522、戦闘履歴が1,767 ms / 0.0522だった。

production buildは`/`が29.7 kB、First Load JS 121 kB。
page chunkは80,579 B / gzip 24,781 B、CSSは95,340 B /
gzip 17,426 Bだった。Home初期通信でTurndownを含むchunkが
5,351 B転送されている。

146期の`/api/state`は15,060レコードを含み、本文9,304,903 B。
ローカルproduction serverでは圧縮されず、低速回線シミュレーションの
LCP / TTIを支配する。詳細な計測値は
`docs/ui-redesign/ui-11-before/performance-baseline.json`へ記録した。

## 確認した問題

| 優先度 | 問題 | 根拠・影響 |
| --- | --- | --- |
| P0 | copyだけの初期経路へTurndownが混入 | `clipboard.ts`がTurndownを静的importし、Home・ランキングを含む全初期画面で専用chunk 5,351 Bを取得する |
| P1 | dynamic viewのloading UIがない | chunk待ちがデータSkeleton解除後に発生すると、本文が空白になる可能性がある |
| P1 | Skeletonが実画面の高さを予約しない | Mobile HomeのCLS 0.0191はフッター移動、ランキング／履歴は0.0522。データ置換時にmainとfooterが複数回移動する |
| P1 | Desktop sidebarの保存状態をpaint後に復元 | SSRは必ず閉、既定または保存openはmount後に-221pxから展開。CLSのうち0.00821を安定して占める |
| P2 | 最終取得時刻を取得後に挿入 | 641〜Desktopでheader actionsの幅が後から増え、Desktop監査で小さいshiftを検出した |
| P2 | 戦績カード生成を詳細表示時に読む | 2400×1260 canvas生成コードは「戦績カードを保存」を押すまで不要 |
| 制約 | API本文が初期通信を支配 | 9.3 MBの既存レスポンス。公開APIの形・鮮度・選択期の挙動を変えずに大幅削減するのは困難 |

Home用dynamic chunkは`/api/terms`完了直後にstate取得と並列で読み始め、
実測ではstate本文より約530 ms早く完了した。route-aware preloadを追加しても
現在のLCPクリティカルパスを短縮しないため、推測による先読みは行わない。

## 実施計画

### 1. 軽量なcopy境界

#### 変更対象

- `lib/copyText.ts`（新規）
- `lib/clipboard.ts`
- copyだけを使う7コンポーネント
- clipboardの契約テスト

#### 変更理由・期待する効果

`copyText`をTurndownから分離し、Home・ランキング・図鑑・詳細の初期経路から
HTML→Markdown変換コードを外す。Historyの貼り付け変換は同じTurndown実装を保つ。

#### 影響範囲・破壊的変更の可能性

- 内部importとbundle境界だけ。コピー文字列、fallback順、戻り値は変更しない
- `@/lib/clipboard`からの既存named exportはre-exportして維持する
- Turndownと型依存は削除しない
- hidden mockが旧module境界だけを差し替える場合は影響し得るが、現リポジトリに該当なし

#### 確認方法

- clipboard成功／拒否／`execCommand` fallbackとMarkdown変換の回帰テスト
- production初期requestからTurndown markerが消え、History chunkには残ること
- page / dynamic chunkのraw・gzip・実転送量比較

### 2. 操作時だけ必要な画像生成の遅延

#### 変更対象

- `components/detail/WarlordDetail.tsx`
- `lib/warlordCard.ts`の既存契約テスト、必要な詳細テスト

#### 変更理由・期待する効果

戦績カード生成・画像コピーを保存操作内のdynamic importへ移し、
武将詳細を読むだけの利用者へcanvas生成コードを配らない。

#### 影響範囲・破壊的変更の可能性

- ボタンを押した後の初回だけchunk待ちが加わる
- PNG寸法、ファイル名、Clipboard→download fallback、saving / done / errorは維持する
- chunk取得失敗も既存error状態へ収束させる

#### 確認方法

- 詳細初期chunkのraw・gzip差
- 生成Blobのtype・寸法、ファイル名、成功／fallback／失敗状態の比較
- 実ブラウザーで初回と2回目の保存操作を確認

### 3. 共通Loadingと寸法予約

#### 変更対象

- 共通`PageLoading`コンポーネント
- `app/page.tsx`のデータLoadingと全dynamic view
- `app/styles/14-system.css`
- マークアップ回帰テスト

#### 変更理由・期待する効果

データとchunkのどちらを待つ場合も同じSkeletonを表示し、空白状態をなくす。
Loading panelが初期viewportに必要な高さを予約し、実データへの置換で
footerがviewport内を移動するCLSを抑える。

#### 影響範囲・破壊的変更の可能性

- 変わるのはLoading中だけ。データ、URL、選択、フィルター状態は変更しない
- 一律の仮想化や一覧件数変更は行わない
- 読み上げ通知を重複させず、`aria-busy`と1つのLoading文言に統一する

#### 確認方法

- Slow 3G相当で初期／タブ／詳細の空白がないこと
- Mobile / Desktopのfooterとmainのlayout-shift source比較
- 390 / 768 / 1440px、Light / Dark、reduced motion

### 4. 初期sidebarとheader slotの安定化

#### 変更対象

- `app/layout.tsx`
- `lib/sidebarLayout.ts`相当のpure判定
- `lib/useSidebarLayout.ts`
- `app/page.tsx`
- `components/layout/AppHeader.tsx`
- shell CSSとテスト

#### 変更理由・期待する効果

初期描画前に現行と同じDesktop保存状態を判定してsidebar幅を予約し、
初回だけmargin transitionを止める。hydration前はsidebarを非表示にして、
見えているのに`aria-hidden` / `inert`という状態を避ける。
最終取得時刻も同寸の非表示slotを先に予約する。

#### 影響範囲・破壊的変更の可能性

- 768px境界、保存キー、未保存時open、不正値時closed、Mobile常時closedを維持する
- 通常の開閉transitionとDesktopだけの保存動作は維持する
- headとhookに同じ判定が必要なため、pure判定テストでドリフトを防ぐ
- hydration前の短時間だけ、open幅内のsidebar内容を非表示にする

#### 確認方法

- Desktopの未保存／`1`／`0`／不正値、Mobileの全保存値、767 / 768px
- resize往復、Mobile操作の非保存、Desktop操作の保存
- hydration warning、`aria-expanded`、`aria-hidden`、`inert`
- header actionsのfetch前後bounding box
- layout-shift sourceからsidebar 0.00821とheader挿入が消えること

### 5. 同条件の最終比較

#### 変更対象

- `docs/ui-redesign/ui-11-after/`
- このPR本文

#### 確認方法

- 同一Chrome、同一production server、同一146期でHomeを各3回
- Home、ランキング、履歴、武将詳細のrequest / chunk / CLS source
- 初期JavaScriptとCSSのraw・gzip・実転送量
- clipboard、戦績カード、sidebar、Loadingの実ブラウザー操作
- `npm test` → `npm run lint` → `npm run typecheck` → `npm run build`
- GitHub ActionsとVercel

## 実施順

1. 調査結果、計画、Before証跡だけをcommitし、Draft PR #150へ記録
2. copy境界を分離し、bundle差と文字列契約を確認
3. 戦績カード生成を操作時へ遅延し、画像契約を確認
4. 共通Loadingと寸法予約を追加し、空白・CLS・読み上げを確認
5. sidebar初期幅とheader slotを安定化し、保存状態・ARIAを確認
6. 同条件のAfter計測、全自動検証、GitHub checksを記録

## 作業単位1: 軽量なcopy境界

### 変更内容

- `lib/copyText.ts`: 既存のtext copy実装を挙動変更なく独立させた
- `lib/clipboard.ts`: Turndownと`htmlToMarkdown`を維持し、`copyText`を新moduleからnamed re-exportした
- copyだけを使う7箇所を`@/lib/copyText`へ変更し、HistoryのHTML貼り付け変換だけを従来のclipboard入口に残した
- native clipboard、拒否後のfallback、`execCommand`失敗、DOM利用不可、Markdownのlink / escape / trim、旧export互換をテストで固定した

### 変更理由

copyしか使わない初期画面が、HTML→Markdown変換とTurndownを同時に取得していた。
公開済みのmodule入口を残したまま内部依存だけを細くし、Home・ランキング等の
初期JavaScriptを削減するため。

### 互換性

- `copyText(text): Promise<boolean>`の名前、引数、戻り値、clipboard→textarea fallback順を変更していない
- `@/lib/clipboard`から`copyText`と`htmlToMarkdown`をnamed importする既存コードは引き続き動作する
- Turndown設定、リンク、特殊文字、前後空白の変換結果を変更していない
- package依存、API、URL、DB、環境変数、表示文言は変更していない

### 検証結果

- 対象テスト: 5ファイル、21テスト成功
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- 隔離production build: 成功
- `/`のroute size: 29.7 kB → 25.4 kB
- `/`のFirst Load JS: 121 kB → 116 kB
- Home初期requestの総転送量: 9,486,939 B → 9,482,207 B（同じ146期、1回比較）
- production初期page / Home chunkにTurndown markerがなく、Historyのdynamic chunkだけに残ることを確認
- CSS本文は95,340 Bのまま
- `git diff --check`: 成功

### 残っているリスク

- 旧`@/lib/clipboard`からcopyだけをimportする未知のconsumerは互換性を優先してTurndownもbundleし得る
- Historyを初めて開くときは、既存どおりTurndownを含むchunkを取得する
- 1回のLighthouse値はDB応答時間の分散が大きいため、LCP / TBTの効果判定は最終3回中央値で行う

## 作業単位2: 操作時だけ必要な画像生成の遅延

### 変更内容

- `components/detail/WarlordDetail.tsx`: 戦績カードmoduleの静的importを削除し、保存handlerの`try`内で動的importするようにした
- `lib/warlordCard.test.ts`: 非ブラウザー環境の安全なno-op、ClipboardItem非対応、静的import不在、生成→download→copy→状態復帰の順序を固定した

### 変更理由

2400×1260 canvas、PNG生成、画像clipboard処理は、管理者が「カード保存」を押すまで
不要である。武将詳細を読むだけの初期chunkから分離し、必要な操作時だけ取得するため。

### 互換性

- `saving`、`done`、`error`の表示とdisabled条件を変更していない
- blobが`null`のときの失敗、`${name}_戦績カード.png`の名前、download後にcopyする順序、2秒後の`idle`復帰を維持した
- module取得失敗も既存の`catch`で`error`へ収束する
- props、詳細データ、カード寸法、描画内容、API、URL、DB、環境変数を変更していない

### 検証結果

- 対象テスト: 2ファイル、10テスト成功
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- 隔離production build: 成功
- 武将詳細の初期dynamic files: raw 35,879 B → 33,267 B
- 同filesのgzip: 13,020 B → 11,998 B（1,022 B削減）
- canvas本体は初回保存時だけ取得する別chunk raw 2,922 B / gzip 1,360 Bへ分離
- 初期の武将詳細filesに`createLinearGradient` / `ClipboardItem`がなく、操作時chunkだけにあることを確認
- `/`の25.4 kB / First Load JS 116 kBとCSSを維持
- `git diff --check`: 成功

### 残っているリスク

- 初回のカード保存だけは1,360 B gzip相当のchunk取得が先に入る
- 認証済み実ブラウザーでのcanvas downloadとClipboard権限許可時のE2Eは最終手動確認に残る
- Safari / Firefoxの画像clipboard fallbackは既存実装のままで、今回の対象外

## 受入条件

- 公開API、URL、DB、環境変数、集計値、結果順、保存キーを変更しない
- Home / ランキング初期通信からTurndownを除外する
- clipboard文字列とHistoryのHTML→Markdown結果を維持する
- dynamic view待ちで空白を表示しない
- CLS 0.1以下を維持し、既知のsidebar / header shiftを除去する
- observed LCP 2.5秒以下の中央値を維持する
- TBTと初期JavaScript / CSSを悪化させない
- INPは実フィールド値を断定せず、決定的な入力操作と代理指標を記録する
- 全テスト、Lint、型チェック、production build、CIが成功する

## 今回実施しない改善

互換性または変更規模のリスクが高いため、次は実装しない。

- `/api/state`のキー・項目・鮮度・cache方針の変更
- bootstrap API追加やServer Componentへの全面移行
- DB index追加などschema / migration変更
- 図鑑のDesktop表＋MobileカードをJS viewport分岐へ置換
- 一覧件数、ページング、仮想化、表示順の変更
- global CSSのroute別分割
- statsのWeb Worker化、状態管理・フレームワークの置換
- 全タブの先読み

## 残るリスク

- 既存API本文が低速回線のLCP / TTIを支配する
- Vercel Previewは認証保護され、同一条件の外部Lighthouseを自動取得できない
- INPの正式評価には実ユーザーのfield dataが必要
- Safari / Firefox、低性能実機、Service Worker経由のcache状態は別途手動確認が必要

## ロールバック

copy境界、画像遅延、Loading、sidebar初期化の4単位でcommitを分ける。
問題がある単位だけを戻し、公開インターフェースや保存データを巻き戻す操作は不要とする。
