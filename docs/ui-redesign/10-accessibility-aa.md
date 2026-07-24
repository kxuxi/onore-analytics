# UI 10: WCAG 2.2 AA対応の強化

## 状態

実装中（作業単位3 / 4完了）

## 依存関係

- UI 09（責務別CSS分割）

## 目的

既存のスキップリンク、ライブリージョン、フォーカス表示、モーダルのフォーカストラップ、グラフ要約を基盤に、公開画面と管理画面の重大なアクセシビリティ阻害を小さな単位で解消する。

適合の根拠は自動監査だけに置かない。WCAG 2.2のうち、今回の変更と直接関係する1.3.1、1.4.1、1.4.3、1.4.10、1.4.11、2.1.1、2.1.2、2.4.3、2.4.7、2.4.11、2.5.3、2.5.8、4.1.2、4.1.3を、自動監査と実ブラウザー操作の両方で確認する。

## 調査範囲

### 画面

- 共通シェル: ヘッダー、サイドバー、メイン領域、サブタブ、フッター、トースト
- 公開画面: Home、戦闘履歴、4ランキング、メタ分析、3図鑑、国、5詳細画面、ログイン、404、エラー
- 管理画面: 偵察、被弾表、DB確認、環境設定、兵種編集／削除Dialog

### コンポーネント

- `AppHeader`、`TermSelector`、`PageHeader`
- `SearchBox`、`HomeWarlordSearch`、`FilterPanel`、`ImportFeedback`
- `useAppNavigation`、`useSidebarLayout`、`useModalA11y`
- `DetailParts`、`BattleLogList`、`BattleHistoryCard`
- 集計期間セレクター、表、勝敗折れ線、円グラフ、ヒートマップ
- Light / Darkのトークンと全操作状態

### 調査方法

- axe-core 4.12.1をChromeの実DOMへ注入
- 390×844、1440×1000、Light / Darkで17ケースを横断
- DOM上の`aria-hidden`配下フォーカス要素、24px未満ターゲット、横方向overflowを追加計測
- ARIA参照、キーボードハンドラ、フォーカス復帰、動的色生成を静的追跡
- WCAG 2.2のW3C RecommendationとUnderstanding文書を基準に判定

## 現状の良い点

- `html lang="ja"`、ズームを制限しないviewport、本文スキップリンクがある
- 通常文字と補助文字の基本コントラストは両テーマで十分
- `FilterPanel`、`Section`、履歴カードは開閉状態と対象要素が関連付いている
- 兵種編集Dialogはラベル、fieldset、入力エラー、初期フォーカス、Tabトラップ、復帰フォーカスを備える
- 一部グラフには数値を含む支援技術向け要約がある
- 表示幅320pxを意識したカード化、container query、局所的な横スクロールがある
- `prefers-reduced-motion`でanimation、transition、smooth scrollを抑制する
- 主要フォームには40〜44pxの操作領域がすでに多く使われている

## 確認した問題

| 優先度 | 問題 | 根拠・影響 | 主な対象 |
| --- | --- | --- | --- |
| P0 | ネイティブランドマークへ不適切なroleを上書き | axeの`aria-allowed-role`、`landmark-one-main`、`region`を再現。`main`ランドマークが失われる | `app/page.tsx` |
| P0 | 閉じたモバイルサイドバー内に15個のTab対象が残る | axeの`aria-hidden-focus`を再現。見えない期間選択、ナビ、ログインへ移動する | `app/page.tsx`、sidebar制御 |
| P0 | DialogのEscapeと詳細ページのEscapeが二重実行される | 兵種編集をEscapeで閉じると一覧まで戻り、フォーカスが`body`へ落ちる | `useModalA11y`、`app/page.tsx` |
| P0 | 用途の異なる色を同じトークンで兼用 | Darkの白／accent 2.40:1、白／accent-strong 3.25:1、白／danger 2.78:1。Light通常toastは1.19:1 | tokens、button、nav、toast、status |
| P0 | Lightのランキング固定色が通常文字4.5:1未満 | 金1.47、銀1.47、銅2.44、緑2.99〜3.39:1。axeでランキング最大70件を検出 | rankings、nations |
| P0 | 任意の国色を文字へ混ぜるためAAを保証できない | 黒／Darkで2.46、白／Lightで1.94:1まで低下する | `factionColors.ts` |
| P1 | 入力・通常ボタンの境界が3:1未満 | `--border`は主要面に1.17〜1.41:1。操作部品の識別が弱い | controls、forms |
| P1 | Home comboboxが2つのフォーカスモデルを混用 | `aria-activedescendant`を使いながら`button role=option`へDOMフォーカスも移す | `HomeActivation.tsx` |
| P1 | 集計期間がtabpanelなしのtabを名乗る | role、状態、操作モデルが一致しない | Metrics、Ranking、Matrix、Meta |
| P1 | 汎用検索クリア後にフォーカスを失う | Home以外は消滅したクリアボタンから`body`へ落ちる | `SearchBox.tsx` |
| P1 | 一部の状態・フォーカスが淡い色差だけ | subtab、期間、候補選択の境界差が3:1未満。sticky headerの遮蔽対策も不足 | shell、analytics、home |
| P1 | 勝敗折れ線が色に依存し、要約が数値を含まない | Lightの勝利線は約2.01:1。コメント上の敗北破線も未実装 | `HomeTab.tsx` |
| P2 | 一部データ表にcaptionがない | 表の目的を支援技術から直接取得しにくい | Home、Damage、DB、Scout、Synergy |
| P2 | 24px未満の独立操作がある | 検索クリア22px、toast close 20px等。2.5.8の間隔例外へ依存する | controls、toast、detail |
| P2 | 404／エラーがh2から始まる | ページ固有の最上位見出しがない | `error.tsx`、`not-found.tsx` |

## 実施計画

### 1. 意味構造と重大なキーボード阻害

#### 変更対象

- `app/page.tsx`
- `components/layout/AppHeader.tsx`
- `lib/useModalA11y.ts`
- 必要な回帰テスト

#### 変更内容

- ネイティブ`main`をランドマークとして維持し、その内側に正しいtabpanelを置く
- sidebarはDesktopでcomplementary、Mobile展開時はDialogとして扱い、閉鎖時は`aria-hidden`と`inert`で操作・アクセシビリティツリーから外す
- ハンバーガーとsidebarを`aria-controls`で関連付ける
- Mobile展開時の初期フォーカス、Tabトラップ、Escape、起点復帰を既存フックで統一する
- グローバルEscapeは`defaultPrevented`済みイベントを処理しない

#### 理由・期待効果

- 見えない操作へのTab移動と、Dialogを閉じた後の意図しないページ遷移を解消する
- landmark、tab、tabpanel、dialogの名前・役割・状態を一致させる

#### 影響範囲・破壊的変更の可能性

- DOM要素とARIA属性、Mobile sidebarのフォーカス順のみ
- URL、タブ選択、マウス／タッチ操作、表示文言は変更しない
- Focus移動のタイミングには回帰リスクがあるため、実ブラウザーでURLとactiveElementを同時確認する

#### 確認方法

- axeの`aria-allowed-role`、`landmark-one-main`、`region`、`aria-hidden-focus`が0件
- sidebar開閉とUnitEditModalをTab / Shift+Tab / Escapeだけで操作
- Escape後も詳細URLと詳細画面が維持され、編集起点へ戻る

### 2. 用途別カラートークンと操作境界

#### 変更対象

- `app/styles/01-tokens-theme.css`
- `02-foundations.css`、`03-shell.css`、`04-controls.css`
- `07-admin-feedback.css`、`09-login.css`
- `11-rankings-insights.css`、`13-analytics.css`、`14-system.css`
- `lib/factionColors.ts`

#### 変更内容

- `on-accent`、`on-danger`、interactive text、success text、danger text、warning text、control borderを用途別トークンへ分離
- 既存のラベル／メダル／勝敗テキストトークンをランキング固定色へ適用
- Light toastの既定面色をテーマ追従させる
- 動的な国色は文字へ使わず、背景・枠・スウォッチへ残す
- controlの境界だけを3:1以上へ強め、カードや表罫線は現状密度を保つ
- 全インタラクティブ要素の`:focus-visible`を共通化し、選択状態へ形状差を加える

#### 理由・期待効果

- 背景色と文字色の役割を分け、両テーマの通常文字4.5:1とUI境界3:1を安定させる
- 任意の保存済み国色でも文字の可読性を保証する

#### 影響範囲・破壊的変更の可能性

- 色とフォーカス枠だけ。保存済み国色、DB値、API、設定値は変更しない
- 視覚差が広範囲へ及ぶため、Light / Darkの同条件画像を比較する
- `--border`の全置換は行わない

#### 確認方法

- 計算テストとaxeの`color-contrast`
- 主要面の文字4.5:1、操作境界・フォーカス3:1
- 全30色と極端色（白・黒）の国バッジを両テーマで確認

### 3. 操作モデルとフォーカス復帰

#### 変更対象

- `SearchBox.tsx`
- `HomeActivation.tsx`
- Metrics、Ranking、TraitMatrix、Metaの期間選択
- `PageHeader.tsx`と詳細遷移

#### 変更内容

- comboboxは入力にフォーカスを保つ`aria-activedescendant`方式へ統一
- 検索クリア後は常に同じ検索入力へ戻す
- 集計期間は`group` + `aria-pressed`へ変更し、既存の即時切替を保つ
- 詳細から一覧へ戻る場合は一覧見出し、詳細間を戻る場合は詳細見出しへ移す

#### 理由・期待効果

- ARIA roleと実際のキーボード操作を一致させ、フォーカス消失を防ぐ

#### 影響範囲・破壊的変更の可能性

- 入力値、絞り込み結果、期間、URLは変更しない
- 支援技術から認識されるroleは正しいものへ変わるが、可視UIとクリック挙動は維持する

#### 確認方法

- comboboxのArrow / Enter / Escape / Tab
- 検索クリア、期間切替、詳細の開始・戻る・Escape後のactiveElement
- SSRマークアップ回帰テスト

### 4. 色以外の識別、代替情報、表見出し

#### 変更対象

- `HomeTab.tsx`
- caption不足の表
- `error.tsx`、`not-found.tsx`
- 関連CSSとテスト

#### 変更内容

- 勝敗折れ線へテーマ用chart token、系列別の実線／破線、数値要約を追加
- caption不足の表へ視覚非表示captionを追加
- 独立した小型操作を最低24px、coarse pointerの主要操作を可能な範囲で44pxにする
- 404とエラーの最上位見出しをh1にする
- sticky header分の`scroll-padding` / `scroll-margin`を追加

#### 理由・期待効果

- 色を認識できなくても系列を区別でき、表とグラフの目的・値を取得できる
- 2.5.8と2.4.11の操作阻害を減らす

#### 影響範囲・破壊的変更の可能性

- 既存データ、集計、グラフ座標は変更しない
- 320pxヘッダーで全操作を一律44pxにすると混雑するため、主要操作へ限定して確認する

#### 確認方法

- グラフ要約の純粋関数テスト
- captionと見出し階層のSSRテスト
- 390 / 768 / 1440px、200%拡大、reduced motionで情報欠落と横overflowを確認

## 実施順

1. この計画と変更前のaxe・キーボード・画像基準をPRへ記録
2. P0のlandmark、sidebar、Escapeを修正して単体・ブラウザ検証
3. 色トークン、動的国色、control境界を修正して両テーマ監査
4. combobox、検索、期間、詳細フォーカスを修正して操作回帰
5. グラフ、caption、見出し、ターゲット、sticky遮蔽を修正
6. 公開17ケースと管理画面状態を再監査
7. `npm test` → `npm run lint` → `npm run typecheck` → `npm run build`
8. PR本文へ変更内容、互換性、検証結果、残存リスク、Before / Afterを確定

## 作業単位1: 意味構造と重大なキーボード阻害

### 変更内容

- `app/page.tsx`: ネイティブ`main`とtabpanelを分離し、sidebarをDesktopではcomplementary、Mobile展開時はmodal dialogとして扱うようにした
- `app/page.tsx`: 閉じたsidebarへ`aria-hidden`と`inert`を設定し、Mobile展開時は明示的な「メニューを閉じる」操作を追加した
- `components/layout/AppHeader.tsx`: ハンバーガーへ`aria-controls`を追加した
- `lib/useModalA11y.ts`: bodyのスクロールロックを呼び出し側で選択可能にし、必要なDialogでは外側の領域を`inert`化できるようにした
- `app/page.tsx`: モーダルが処理済みのEscapeを詳細画面のグローバル処理が再処理しないようにした
- `app/styles/03-shell.css`、`08-responsive-tables.css`: Mobile drawerの閉じる操作と背景レイヤーを追加した
- `components/layout/AppHeader.test.tsx`: ハンバーガーとsidebarの関連付けを固定した

### 変更理由

閉じたメニューへTab移動できる状態、失われた`main`ランドマーク、Dialogを閉じたEscapeが詳細画面まで戻す競合を解消するため。Mobile drawerはモーダル宣言だけでなく、外側のヘッダー・本文・フッターを実際に操作不能にし、宣言と挙動を一致させた。

### 互換性

- URL、ルーティング、選択中タブ、期間、データ、API、DB、環境変数は変更していない
- Desktop sidebarとMobileのタッチ／マウスによる項目選択は維持した
- Mobile drawerには既存の背景タップとEscapeに加えて、明示的な閉じる操作を追加した
- `useModalA11y`の既定値は従来どおりbodyのスクロールをロックし、既存Dialogの呼び出し方法を維持した

### 検証結果

- `npm test -- components/layout/AppHeader.test.tsx components/tabs/UnitEditModal.test.tsx`: 2ファイル、4テスト成功
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- `git diff --check`: 成功
- Chrome 149 / 1280×900、390×844でHome・ランキングを確認
- axeの`aria-allowed-role`、`aria-hidden-focus`、`landmark-one-main`、`region`: 対象ケース0件
- Mobile drawer閉鎖時の`inert`、展開時の初期フォーカス、外側領域の`inert`、閉じる操作後のハンバーガー復帰を実DOMで確認
- Mobile drawerからランキングを選択後、URLが`/ranking`となり、フォーカスが`#main-panel`へ移ることを確認

### 残っているリスク

- VoiceOver / NVDAによる読み上げ順は未確認
- Mobile drawerの完全な自動E2E回帰テストは未導入。今回のPRでは実ブラウザー検証記録で固定する
- UnitEditModalのEscape競合は既存コンポーネントテストとイベント処理の静的確認までで、認証済み管理画面の再操作は最終横断確認で行う

## 作業単位2: 用途別カラートークンと操作境界

### 変更内容

- `app/styles/01-tokens-theme.css`: 面の色とその上の文字色を分離し、`on-accent`、`on-danger`、`on-success`、interactive、success、danger、warning、control borderの用途別トークンを追加した
- `02-foundations.css`〜`15-home.css`: ボタン、ナビ、リンク、状態表示、ランキング、履歴、詳細、ログイン、テーマ切替へ用途別トークンを適用した
- `11-rankings-insights.css`: 固定の金・銀・銅・緑を既存メダル／勝敗トークンへ統合した
- `13-analytics.css`: 相性表の件数文字と保存完了表示を、背景に依存しない文字色へ変更した
- `lib/factionColors.ts`: 任意の国色は枠・背景・スウォッチに残し、文字はテーマの本文色で表示するようにした
- `lib/factionColors.test.ts`: 国色が文字へ流入せず、枠と背景には維持されることを固定した
- 入力、select、buttonなど識別に境界が必要な操作部品だけ`control border`を使用し、カードや表罫線の密度は維持した
- 個別指定のない操作要素にも共通の`:focus-visible`を追加した

### 変更理由

アクセント色、成功色、危険色を背景と文字で兼用していたため、テーマを切り替えると一方で基準を下回っていた。用途別に組合せを固定し、Light / Darkの通常文字4.5:1と操作境界3:1を安定して満たすため。

### 互換性

- データ、集計値、API、URL、DB、環境変数、保存済みの国色値は変更していない
- 色を使う情報分類と勝敗の意味は維持し、テーマごとの可読色だけを変更した
- 国色による識別はバッジ背景、枠、スウォッチ、遍歴のドットに残した
- カード、表、区切り線の`--border`は一律変更せず、操作部品だけを対象にした

### 検証結果

- `npm test -- lib/factionColors.test.ts`: 1ファイル、9テスト成功
- `npm test`: 44ファイル、409テスト成功
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- `git diff --check`: 成功
- 実データの読み込み完了後、Chrome 149で変更前と同じ17ケースをLight / Dark、1440×1000 / 390×844で再監査
- axe `color-contrast`: 17ケース合計0件
- 塗り上の通常文字は最小4.63:1、interactive / success / danger / warning文字は対象面で5.18:1以上を計算確認
- control borderは自身の操作面に対してLight 3.15:1、Dark 4.14:1を計算確認
- Lightのprimary buttonは通常5.82:1、hover 4.70:1であることを実DOMの計算済みスタイルでも確認
- ランキングLightと武将詳細Darkを同じビューポートで画像確認し、情報欠落とレイアウト変化がないことを確認

### 残っているリスク

- axeの`incomplete`は17ケース合計159ノード。selectの矢印gradient、ログイン背景gradient、任意色を含む`color-mix`など自動判定不能な箇所で、既知トークンは計算と目視で補完した
- 保存済み国色の値そのものは任意入力のため、色覚多様性シミュレーションと全組合せの目視は最終確認に残る
- Windows High Contrast / `forced-colors: active`は未確認

## 作業単位3: 操作モデルとフォーカス復帰

### 変更内容

- `components/SearchBox.tsx`: 内部入力refと外部refを併用し、クリア操作が消滅した後も同じ検索入力へフォーカスを戻すようにした
- `components/tabs/HomeActivation.tsx`: 候補を`li[role="option"]`へ変更し、入力へフォーカスを保つ`aria-activedescendant`方式へ統一した
- Homeの候補はArrow Up / Down、Home / End、Enter、Escapeを入力上で処理し、pointerのmousedownでも入力フォーカスを奪わないようにした
- `MetricsTab.tsx`、`RankingTab.tsx`、`TraitMatrixTab.tsx`、`MetaTab.tsx`: 即時反映する集計期間を`role="group"` + `aria-pressed`へ変更した
- `components/layout/PageHeader.tsx`: 一覧見出しをプログラム的にフォーカスできるようにした
- `app/page.tsx`: 詳細から一覧へ戻ったときは一覧見出し、詳細同士を戻るときは既存の詳細見出しへフォーカスするようにした
- `SearchBox.test.tsx`、`HomeActivation.test.tsx`、`PageHeader.test.tsx`、`PeriodSelectors.test.tsx`: ARIAとフォーカス対象の回帰テストを追加した

### 変更理由

消滅したクリアボタンや詳細見出しへフォーカスが残る状態と、comboboxがDOMフォーカスと`aria-activedescendant`を混在させる状態を解消するため。集計期間はtabpanelを切り替えず同じ画面を即時更新するため、toggle buttonのモデルへ実装とroleを一致させた。

### 互換性

- 検索値、候補順、候補上限、選択結果、集計期間、集計結果、URLは変更していない
- Mouse / touchによる候補選択と期間切替は維持した
- 旧候補のArrow、Home、End、Enter、Escape操作を新しいinput-focusモデルでも維持した
- `PageHeader`の見出しはTab順へ追加せず、戻り先として必要な場合だけフォーカスする

### 検証結果

- 対象テスト: 4ファイル、10テスト成功
- `npm test`: 46ファイル、415テスト成功
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- `git diff --check`: 成功
- Home comboboxでArrow Down後とEnd後も`activeElement`が入力であり、`aria-activedescendant`と選択候補が同期することを確認
- Enterで候補を選択後、既存どおりダッシュボードへ切り替わり、その見出しへフォーカスすることを確認
- Escapeで候補と入力値だけが閉じ、URL`/`と入力フォーカスを維持することを確認
- Tabで候補へDOMフォーカスを移さず次のクリア操作へ進み、pointerのmousedownでも入力フォーカスを維持することを確認
- ランキング検索のクリア後、クリア操作がDOMから消えても同じ入力へフォーカスが戻ることを確認
- 武将ランキングから武将詳細を開くと詳細見出し、戻ると`/ranking`の「武将ランキング」見出しへフォーカスすることを確認
- 4期間セレクターの実DOMで`role="group"`、単一の`aria-pressed="true"`、旧tab role不在を確認し、関連axeルールは0件

### 残っているリスク

- VoiceOver / NVDAでの候補読み上げと`aria-activedescendant`の通知タイミングは未確認
- フォーカスの実ブラウザー確認はChrome 149で実施。Safari / Firefoxの入力クリア直後の描画タイミングは未確認
- リポジトリにはブラウザーE2E基盤がないため、activeElementの横断確認はこのPRの実ブラウザー記録で補完した

## 受入条件

- axeの重大な自動検出が0件
- 公開画面で`aria-allowed-role`、`landmark-one-main`、`region`、`aria-hidden-focus`が0件
- Light / Darkの通常文字4.5:1、非テキストUIとフォーカス表示3:1
- キーボードだけでsidebar、タブ、検索、期間、詳細、Dialogを完了できる
- Escapeで1つのUI階層だけが閉じ、フォーカスが見える場所へ復帰する
- 200%拡大と390px幅で主要情報・操作を失わず、ページ全体の横overflowがない
- reduced motionで必須でないanimationとsmooth scrollが抑制される
- 公開API、URL、DB、環境変数、集計結果、フォーム値を変更しない

## 今回実施しない改善

次は利用感や情報設計を変える可能性があるため、UI 10では実装しない。

- sidebarとサブタブの全面的なリンク化
- 全インラインリンクの44px化
- 表の局所横スクロールや`min-width`の一律撤廃
- 円グラフ全区画への直接ラベル／パターン導入
- ヒートマップ全セルへの常時数値表示
- トーストの表示時間変更
- 保存済み国色、DB、API、レスポンス、公開キーの変更
- WCAG適合の宣言

## 手動確認に残るリスク

- VoiceOver / NVDAでの読み上げ順と実機キーボード操作
- iOS / Android相当のcoarse pointerとsafe-area
- 320px、200% / 400%拡大、テキスト間隔変更時の省略表示
- Windows High Contrast / `forced-colors: active`
- 任意のカスタム国色と色覚多様性シミュレーション
- データ表・グラフの二次元スクロール例外の利用しやすさ
- axeの`incomplete`（CSS gradientなど自動判定不能）は目視と計算で補う

## ロールバック

意味構造、トークン、操作モデル、グラフ補助の4単位でコミットを分ける。問題がある単位だけを戻し、公開インターフェースやデータを巻き戻す操作は不要とする。
