-- CreateIndex: 期ごとの取得と期一覧の走査を避ける
CREATE INDEX "BattleRecord_term_idx" ON "BattleRecord"("term");
