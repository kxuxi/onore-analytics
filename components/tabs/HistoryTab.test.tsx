import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistoryTab } from "./HistoryTab";

const callbacks = {
  onRegister: vi.fn().mockResolvedValue({
    added: 0,
    updated: 0,
    parsed: 0,
    skipped: 0,
    rejected: 0,
  }),
  onSelectWarlord: vi.fn(),
  onSelectUnit: vi.fn(),
  onSelectEquip: vi.fn(),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onBulkDelete: vi.fn().mockResolvedValue(undefined),
};

function renderHistory(canRegister = false): string {
  return renderToStaticMarkup(
    <HistoryTab
      canRegister={canRegister}
      log={[]}
      factionColors={{}}
      {...callbacks}
    />
  );
}

describe("HistoryTab", () => {
  it("検索対象と2種類の期間を区別できるラベルを表示する", () => {
    const html = renderHistory();

    expect(html).toContain(
      'placeholder="武将・国・兵種・装備を検索"'
    );
    expect(html).toContain("<span>ゲーム内年月（開始）</span>");
    expect(html).toContain("<span>ゲーム内年月（終了）</span>");
    expect(html).toContain("<span>実日付（開始）</span>");
    expect(html).toContain("<span>実日付（終了）</span>");
    expect(html).toContain("勝敗と出兵側・守備側を見比べながら");
  });

  it("登録説明でも出兵側・守備側の用語を統一する", () => {
    const html = renderHistory(true);

    expect(html).toContain("出兵側・守備側どちらの武将も自動で抽出");
    expect(html).not.toContain("出兵側・防衛側");
  });
});
