-- AlterTable: ランキング取り込みで武将アイコンのURLを保存する（任意・後方互換）
ALTER TABLE "Warlord" ADD COLUMN     "iconUrl" TEXT;
