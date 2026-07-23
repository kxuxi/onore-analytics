# UI 08 変更後の実画面記録

管理フォーム改善後の代表画面を、146期・管理者表示・Lightテーマで記録した。画面表示と入力に加え、ブラウザ内で置換した`fetch`で保存payloadと削除失敗を確認した。

初回の保存確認では、既存の「剛弓僧兵」へ同じ12項目を1回upsertした。項目値、名前、件数に差分はないが、`updatedAt`は2026-07-23 20:17:12 JSTに更新された。その後の保存・削除確認は通信を置換し、追加のDB更新や削除、外部送信は行っていない。

| ファイル | ビューポート | 対象 |
| --- | ---: | --- |
| `db-import-desktop-1440-light.png` | 1440 × 1000 | DB確認のステータス取込とフィルター |
| `db-import-preview-desktop-1440-light.png` | 1440 × 1000 | 有効1件・除外1行の実行前プレビュー |
| `unit-import-desktop-1440-light.png` | 1440 × 1000 | 兵種図鑑の一括取込 |
| `unit-import-preview-desktop-1440-light.png` | 1440 × 1000 | 有効1件・除外1行の実行前プレビュー |
| `unit-edit-desktop-1440-light.png` | 1440 × 1000 | 兵種「剛弓僧兵」の編集Dialog |
| `unit-edit-mobile-390-light.png` | 390 × 844 | 同DialogのMobile表示 |
| `unit-name-error-desktop-1440-light.png` | 1440 × 1000 | 必須エラーと該当入力の関連付け |
| `unit-delete-error-desktop-1440-light.png` | 1440 × 1000 | 削除失敗を前面の確認Dialogに表示 |
| `scout-desktop-1440-light.png` | 1440 × 1000 | 偵察検索の入力、出力ラベル、文字数 |
| `damage-desktop-1440-light.png` | 1440 × 1000 | 被弾表の共通フィルター |
| `settings-desktop-1440-light.png` | 1440 × 1000 | 変更対象外とした環境設定 |

比較時は、URL、入力値、取込パーサーの有効/除外件数、APIのURL・method・payload、一覧の件数・並び順、偵察TSVと報告文、削除対象を固定した。認証Cookie、DBスキーマ、保存方式は変更していない。

最終確認ではDB確認、兵種図鑑、偵察検索、被弾表を320 / 390 / 768 / 1024 / 1440pxで計20通り表示し、横方向overflowがないことを確認した。削除失敗通信はブラウザ内で置換し、この再確認中のwrite requestは0件だった。
