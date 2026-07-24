# UI 10変更前アクセシビリティ基準

## 取得条件

- Source head: `6d19872`
- Browser: Chrome Headless
- axe-core: 4.12.1
- Viewport: Desktop 1440×1000、Mobile 390×844
- Theme: Light / Dark
- 対象: 公開17ケース
- データ: 共有DBの146期を読み込み後に監査

## 結果

| rule | 検出node数 |
| --- | ---: |
| `aria-allowed-role` | 25 |
| `landmark-one-main` | 15 |
| `region` | 104 |
| `aria-hidden-focus` | 5 |
| `color-contrast` | 358 |

- `aria-hidden="true"`配下の可視フォーカス可能要素: 延べ75件
- ページ全体の横overflow: 0 / 17ケース
- axe violation nodeの合計: 507件

同じ共通シェルやデータ行が複数ケースに含まれるため、上記は固有障害数ではなく、回帰比較用の延べnode数である。

## 補足

- `color-contrast`の`incomplete`には、selectの矢印用gradient、SVG、動的背景など自動判定できない要素が含まれる。これは合格扱いせず、計算と目視で補う。
- 17ケースは公開状態の監査である。UnitEditModalなど認証後の状態は、別途キーボード操作と既存の管理画面画像で確認する。
- 自動監査はVoiceOver / NVDA、読み上げ順、フォーカス復帰、200%拡大の代替にはならない。

詳細な画面別rule、node数、代表selector、24px未満ターゲットは
`accessibility-audit.json`に記録した。

## 変更前画像

- Home: Desktop Light / Dark、Mobile Light
- 戦闘履歴: Desktop Light
- 武将ランキング: Desktop Light / Dark
- 兵種図鑑: Mobile Light
- 相性マトリックス: Desktop Light
- 国: Desktop Light
- Login: Desktop Light

取得直前にanimation / transitionを停止し、動的な最終取得時刻を
`00:00`へ固定した。変更後も同じroute、viewport、theme、データ条件で取得する。
