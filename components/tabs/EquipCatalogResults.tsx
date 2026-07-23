import type { EquipStat } from "@/lib/stats";
import { formatWinRate } from "@/lib/stats";

interface Props {
  entries: EquipStat[];
  noun: string;
  slotLabel: string;
  onSelectWarlord: (name: string) => void;
  onSelectEquip: (name: string) => void;
}

function EquipWinRate({ entry }: { entry: EquipStat }) {
  if (entry.decided === 0) return <span className="muted">-</span>;

  return (
    <>
      {formatWinRate(entry.winRate, entry.decided)}
      <span className="muted equip-decided">
        （{entry.wins.toLocaleString("ja-JP")}/
        {entry.decided.toLocaleString("ja-JP")}）
      </span>
    </>
  );
}

function EquipButton({
  entry,
  onSelectEquip,
}: {
  entry: EquipStat;
  onSelectEquip: (name: string) => void;
}) {
  return (
    <button
      type="button"
      className="tag unit tag-btn catalog-equip-button"
      onClick={() => onSelectEquip(entry.name)}
      title={`${entry.name} の詳細を見る`}
    >
      {entry.name}
    </button>
  );
}

function EquipUsers({
  entry,
  onSelectWarlord,
}: {
  entry: EquipStat;
  onSelectWarlord: (name: string) => void;
}) {
  return (
    <span className="equip-users">
      {entry.topUsers.map((user) => (
        <button
          key={user.name}
          type="button"
          className="link-like"
          onClick={() => onSelectWarlord(user.name)}
          title={`${user.name} の戦績を見る`}
        >
          {user.name}
          <span className="muted">
            ×{user.count.toLocaleString("ja-JP")}
          </span>
        </button>
      ))}
    </span>
  );
}

export function EquipCatalogResults({
  entries,
  noun,
  slotLabel,
  onSelectWarlord,
  onSelectEquip,
}: Props) {
  return (
    <div className="catalog-results">
      <div className="table-wrap catalog-full-table">
        <table className="equip-catalog-table">
          <caption className="sr-only">{noun}図鑑</caption>
          <thead>
            <tr>
              <th>{slotLabel}</th>
              <th>使用回数</th>
              <th>勝率</th>
              <th>攻 / 守</th>
              <th>主な使用武将</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.name}>
                <td>
                  <EquipButton
                    entry={entry}
                    onSelectEquip={onSelectEquip}
                  />
                </td>
                <td>{entry.battles.toLocaleString("ja-JP")}</td>
                <td>
                  <EquipWinRate entry={entry} />
                </td>
                <td className="equip-split">
                  {entry.attackUses.toLocaleString("ja-JP")} /{" "}
                  {entry.defenseUses.toLocaleString("ja-JP")}
                </td>
                <td>
                  <EquipUsers
                    entry={entry}
                    onSelectWarlord={onSelectWarlord}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="catalog-card-list" aria-label={`${noun}一覧`}>
        {entries.map((entry) => (
          <li key={entry.name} className="catalog-card">
            <article>
              <header className="catalog-card-header">
                <EquipButton
                  entry={entry}
                  onSelectEquip={onSelectEquip}
                />
              </header>

              <dl className="catalog-primary-stats equip-catalog-primary">
                <div>
                  <dt>使用回数</dt>
                  <dd>{entry.battles.toLocaleString("ja-JP")}</dd>
                </div>
                <div>
                  <dt>勝率</dt>
                  <dd>
                    <EquipWinRate entry={entry} />
                  </dd>
                </div>
              </dl>

              <details className="catalog-card-details">
                <summary>
                  <span className="catalog-details-closed">
                    一覧の詳細を表示
                  </span>
                  <span className="catalog-details-open">
                    一覧の詳細を閉じる
                  </span>
                  <span className="sr-only">：{entry.name}</span>
                </summary>
                <dl className="catalog-detail-list">
                  <div>
                    <dt>攻 / 守</dt>
                    <dd className="equip-split">
                      {entry.attackUses.toLocaleString("ja-JP")} /{" "}
                      {entry.defenseUses.toLocaleString("ja-JP")}
                    </dd>
                  </div>
                  <div>
                    <dt>主な使用武将</dt>
                    <dd>
                      <EquipUsers
                        entry={entry}
                        onSelectWarlord={onSelectWarlord}
                      />
                    </dd>
                  </div>
                </dl>
              </details>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
