# UI 09: CSSの責務分割

## 状態

計画済み・未実装

## 依存関係

- UI 08

## 目的

5,000行を超える `app/globals.css` を、読み込み順と詳細度を維持しながら責務別に整理し、デザインの意図しない波及を防ぐ。

## 変更対象

- tokens、foundation、layout、components、pagesへの分割
- 重複セレクターと未使用ルールの確認
- breakpointと状態セレクターの整理
- CSS読込順の文書化

## 対象外

- CSS Modules、CSS-in-JS、Tailwind CSSへの移行
- 視覚デザインやブレークポイント挙動の変更
- 自動生成CSS

## 互換条件

- cascade、specificity、読み込み順を維持する
- Before / Afterで意図しないVisual diffを出さない
- クラス名変更は完全に参照追跡できるものに限定する

## 受入条件

- CSSが責務単位のファイルに分かれる
- 重複・未使用の削除には根拠を残す
- Light / Dark、全viewportで見た目が一致する
- 本番CSSサイズを悪化させない

## 確認方法

- 全自動検証
- 全主要画面の画像差分
- Chrome Coverageとビルド成果物サイズ比較

## ロールバック

分割ファイルを元の読み込み順で `globals.css` に再統合する。
