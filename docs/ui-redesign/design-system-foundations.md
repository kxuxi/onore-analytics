# Design System Foundations

UI 02 で導入する最小限の共通基盤です。既存の Light / Dark テーマと表示値を維持しながら、
新規画面と段階的な移行で同じ判断基準を使えるようにします。

## Color

既存テーマ変数を破壊せず、用途を表す Semantic Token を別名で公開します。

| 用途 | Token | 参照先 |
| --- | --- | --- |
| 画面背景 | `--surface-canvas` | `--bg` |
| 浮いた面 | `--surface-raised` | `--panel` |
| 補助面 | `--surface-subtle` | `--panel-2` |
| 主テキスト | `--color-text-primary` | `--text` |
| 補助テキスト | `--color-text-secondary` | `--muted` |
| 境界線 | `--color-border-default` | `--border` |
| フォーカスリング | `--color-focus-ring` | `--accent` |

色値そのものは変更しません。コントラスト改善は既存テーマ全体へ影響するため、
アクセシビリティ専用 PR で比較・検証します。

## Spacing

4px を基準とする `--space-1` から `--space-7` を使用します。
既存の 6px / 10px / 14px は表示差分を避けるため、この PR では無理に丸めません。

| Token | 値 |
| --- | --- |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |

## Typography

本文 16px、補助文 13px、フォーム 14px、ページタイトル 20px を基準にします。
グローバル本文は `--font-size-body` と `--line-height-body` を参照します。

## Radius and elevation

- Radius: 6px / 8px / 10px / 12px / pill
- Elevation: 選択状態向け `--shadow-sm`、浮遊面向け `--shadow-md`
- Panel: 通常 12px、480px 以下では 10px

## Layout

- 読み物・詳細表示: `--content-width-reading`（960px）
- 一覧・分析・管理画面: `--content-width-data`（1200px）
- 操作部品の最小高: `--control-min-height`（40px）
- 独立したタッチ操作: `--touch-target`（44px）

ブレークポイントは CSS Custom Property をメディア条件に利用できず、既存境界の統合は
表示挙動を変えるため、リテラル値を維持します。

## PageHeader

`PageHeader` は一覧・分析・管理画面のページタイトル、説明、メタ情報、操作を同じ構造で
配置します。アプリ名が `h1` のため、ページタイトルは `h2` に固定します。
ページ内セクションは `h3.section-title` を使用します。

640px 以下ではタイトル領域とアクションを縦積みにし、長い説明は 76ch
（日本語ではおよそ全角 38 文字相当）を上限にして読みやすさを保ちます。
