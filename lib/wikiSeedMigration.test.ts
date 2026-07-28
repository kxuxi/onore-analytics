import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260728074000_seed_city_formula_wiki_page",
  "migration.sql"
);

describe("都市計算式Wikiの初期データ", () => {
  it("指定された2つの計算式をMarkdownページとして登録する", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("'都市の計算式'");
    expect(migration).toContain(
      "**都市資金収入 = 商業 × 人口 ÷ 10万**"
    );
    expect(migration).toContain(
      "**人口 = 農業 × 200 + 商業 × 100 + 50000**"
    );
  });

  it("同名ページがある環境では重複登録しない", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(
      /WHERE NOT EXISTS\s*\([\s\S]*WHERE "title" = '都市の計算式'[\s\S]*\);/
    );
  });
});
