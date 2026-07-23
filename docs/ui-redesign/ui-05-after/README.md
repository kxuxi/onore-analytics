# UI 05 After

兵種・武器・品物図鑑のレスポンシブ最適化後の実画面です。すべてLightテーマ、ChromiumのDevice Metrics Overrideで指定幅を固定し、実データを読み込んで撮影しています。

- `unit-mobile-320-light.png`: 兵種図鑑 / 320×1000 / 1列カード
- `unit-mobile-390-light.png`: 兵種図鑑 / 390×1000 / 1列カード
- `unit-mobile-expanded-390-light.png`: 兵種図鑑 / 390×1000 / 補足値を展開
- `unit-tablet-768-light.png`: 兵種図鑑 / 768×1000 / 1列要約カード
- `unit-laptop-1024-light.png`: 兵種図鑑 / 1024×1000 / 2列要約カード
- `unit-desktop-1440-light.png`: 兵種図鑑 / 1440×1000 / 既存8列の比較表
- `weapon-mobile-390-light.png`: 武器図鑑 / 390×1000
- `item-mobile-390-light.png`: 品物図鑑 / 390×1000

## 実測

- 320 / 390 / 767px: viewport全体の横スクロールなし
- 768px: コンテンツ幅に応じた1列カード
- 1024px: 2列カード
- 1440px: Desktop表
- 名前リンク、展開、兵種の狭幅用並び替え: 44px以上
- Desktop表とカード: 兵種122件、武器55件、品物127件の名前と順序が一致
