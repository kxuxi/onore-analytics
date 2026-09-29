-- Warlord を (name, term) の複合主キーに変更する。
-- 期ごとに別レコードとして所属国などを保持できるようにする（過去の期の情報が
-- 現在の期の登録で上書きされる問題の修正）。既存データはそのまま保持される。
ALTER TABLE "Warlord" DROP CONSTRAINT "Warlord_pkey";
ALTER TABLE "Warlord" ADD CONSTRAINT "Warlord_pkey" PRIMARY KEY ("name", "term");
