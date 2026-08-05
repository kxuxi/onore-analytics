-- 管理Wikiの初期ページ。同名ページが既にある環境では重複作成しない。
INSERT INTO "WikiPage" ("title", "content", "createdAt", "updatedAt")
SELECT
    '都市の計算式',
    E'# 都市の計算式\n\n## 都市資金収入\n\n**都市資金収入 = 商業 × 人口 ÷ 10万**\n\n## 人口\n\n**人口 = 農業 × 200 + 商業 × 100 + 50000**\n',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "WikiPage"
    WHERE "title" = '都市の計算式'
);
