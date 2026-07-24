# UI 10変更後アクセシビリティ証跡

## 取得条件

- Final source head: `7fce8f9`
- Browser: Chrome Headless 150
- axe-core: 4.12.1
- Viewport: Desktop 1440×1000、Mobile 390×844
- Theme: Light / Dark
- 対象: 変更前と同じ公開17ケース
- データ: 共有DBの146期を読み込み後に監査

17ケースの全量監査は`df12db1`で実施した。その結果から検出した相性表の
コントラストとアンチ矢印のARIAを修正し、相性表・国・戦闘履歴・兵種詳細を
最終HEADで再監査した。`7fce8f9`の差分はアンチ矢印の`role`とテストだけであり、
17ケース内で同じ矢印が実DOMに存在した戦闘履歴と兵種詳細を再取得して
最終結果へ置き換えている。

## Before / After

| 指標 | Before | After |
| --- | ---: | ---: |
| axe violation node | 507 | 0 |
| `aria-allowed-role` | 25 | 0 |
| `landmark-one-main` | 15 | 0 |
| `region` | 104 | 0 |
| `aria-hidden-focus` | 5 | 0 |
| `color-contrast` | 358 | 0 |
| `aria-hidden`配下の非`inert`フォーカス要素 | 75 | 0 |
| 24px未満の独立操作 | 25 | 0 |
| ページ全体の横overflow | 0 / 17 | 0 / 17 |

変更後に24px未満として残る15件は、すべて文章中の
`.app-footer-link`である。独立操作ではなくWCAG 2.5.8のインライン例外に
該当するため、本文の行高と情報密度を維持した。

axeの`incomplete`は`color-contrast` 779ノード。主に
`color-mix()`、gradient、SVG、ブラウザー標準selectなど、自動計算できない
組合せである。既知トークンは計算、Light / Dark画像、該当画面の再監査で
補完したが、合格扱いにはしていない。

## 操作確認

- Mobile drawerの開閉、Tabトラップ、Escape、起点復帰
- Home comboboxのArrow / Home / End / Enter / Escape / Tab
- 検索クリア後の入力フォーカス復帰
- 詳細開始・詳細から一覧へ戻った後の見出しフォーカス
- 期間toggleの単一`aria-pressed`
- 勝敗線の実線／破線・丸／四角と、表示系列に同期する数値要約
- coarse pointerで検索クリア・toast closeが44×44px
- sticky header下へ見出しが隠れないこと

## 変更後画像

- Home: Desktop Light / Dark、Mobile Light
- 戦闘履歴: Desktop Light
- 武将ランキング: Desktop Light / Dark
- 兵種図鑑: Mobile Light
- 相性マトリックス: Desktop Light
- 国: Desktop Light
- Login: Desktop Light

取得直前にanimation / transitionを停止し、動的な最終取得時刻を
`00:00`へ固定した。画像サイズとSHA-256は`visual-manifest.json`、
画面別のaxe結果・未確定項目・操作領域は`accessibility-audit.json`に記録した。

## 適合宣言について

この証跡は自動監査と実ブラウザー確認の記録であり、WCAG適合宣言ではない。
VoiceOver / NVDA、Safari / Firefox、iOS / Android実機、
Windows High Contrastは手動確認に残る。
