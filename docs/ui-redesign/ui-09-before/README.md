# UI 09 分割前の実画面記録

CSS責務分割前の代表画面を、146期・固定テーマ・固定viewportで記録した。画面表示と兵種編集Dialogの展開だけを行い、保存・削除・外部送信は実行していない。

## 記録条件

- CSS source: 6,724行、134,042 bytes
- source SHA-256: `b085a090a5f2e4f32c2c4c7186a1e3ef0f8da0c0eac88baccc5617786ff62915`
- production CSS: 1 asset、100,276 bytes、gzip 17,954 bytes
- Browser: Chrome Headless、motion / transition停止、取得時刻を固定
- Responsive: 390 × 844、1,440 × 1,000
- Theme: Light / Darkを明示
- 横方向overflow: 17画面中0件
- write request: 0件

## 対象

| 画面群 | 記録 |
| --- | --- |
| Home | Desktop Light / Dark、Mobile Light |
| 戦闘履歴 | Desktop / Mobile Light |
| 武将・兵種ランキング | Desktop Light / Dark、Mobile Light |
| 兵種図鑑 | Desktop / Mobile Light |
| 武将・兵種詳細 | Desktop Dark / Light |
| 兵種編集Dialog | Desktop Light |
| 相性マトリックス | Desktop Light |
| DB確認・環境設定 | Desktop Light |
| Login | Desktop Light |

各PNGのroute、theme、viewport、SHA-256とChrome Rule Usageの補助値は`visual-manifest.json`へ記録した。Coverageは訪問した画面・状態だけの観測値であり、未使用CSS削除の単独根拠にはしない。
