# UI 09 分割・整理後の実画面記録

CSS責務分割と参照0の旧CSS削除後に、分割前と同じ146期・テーマ・viewport・操作条件で代表画面を再記録した。画面表示と兵種編集Dialogの展開だけを行い、保存・削除・外部送信は実行していない。

## 記録条件

- CSS source: 15ファイル、6,153行、123,571 bytes
- source SHA-256: `5418de6f6d81a1a2909f03969412afbd80ef45f959993bc0ea452b2c6211a652`
- production CSS: 1 asset、92,077 bytes、gzip 16,798 bytes
- production CSS SHA-256: `2bade98ebf268cca8245c46746ba49a33e622ecc4f5c2fb005c2bee23023fd85`
- Browser: Chrome Headless、motion / transition停止、取得時刻を固定
- Responsive: 390 × 844、1,440 × 1,000
- Theme: Light / Darkを明示
- 横方向overflow: 17画面中0件
- write request: 0件

## Before / After比較

- 17画面中11画面はPNGのSHA-256まで完全一致
- 残る6画面の差は各5〜7画素、channel差は最大9/255
- 差分はヘッダーの文字・SVG境界を中心としたアンチエイリアスだけで、レイアウト、色、文言、表示状態に差はない
- 同条件の再撮影では差が出る画面が入れ替わり、初回差分の`home-desktop-1440-light.png`、`unit-edit-desktop-1440-light.png`、`settings-desktop-1440-light.png`が分割前と完全一致した。CSS差ではなくChromeの非決定的なラスタライズ揺らぎと確認した

| 初回撮影でhash差があった画面 | 差分画素 | 最大channel差 |
| --- | ---: | ---: |
| Home Desktop Light | 6 | 9 / 255 |
| Home Desktop Dark | 5 | 8 / 255 |
| 武将詳細 Desktop Dark | 5 | 8 / 255 |
| 兵種編集Dialog Desktop Light | 6 | 4 / 255 |
| DB確認 Desktop Light | 7 | 9 / 255 |
| 環境設定 Desktop Light | 6 | 9 / 255 |

各PNGのroute、theme、viewport、SHA-256とChrome Rule Usageの補助値は`visual-manifest.json`へ記録した。Coverageは訪問した画面・状態だけの観測値であり、未使用CSS削除の単独根拠にはしていない。
