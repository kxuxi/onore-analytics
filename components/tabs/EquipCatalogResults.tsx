import type { EquipStat } from "@/lib/stats";
import { formatWinRate } from "@/lib/stats";
import { CatalogNum } from "./CatalogParts";

interface Props {
  entries: EquipStat[];
  /** 「武器」「品物」。見出しと読み上げに使う。 */
  noun: string;
  onSelectWarlord: (name: string) => void;
  onSelectEquip: (name: string) => void;
}

/** 武器・品物図鑑の一覧。兵種図鑑と同じ列構成（名前 / 数値 / 補足）で並べる。 */
export function EquipCatalogResults({
  entries,
  noun,
  onSelectWarlord,
  onSelectEquip,
}: Props) {
  const fmt = (n: number) => n.toLocaleString("ja-JP");
  return (
    <div className="catalog-results">
      <table className="catalog-table catalog-table-equip">
        <caption className="sr-only">{noun}図鑑</caption>
        <thead>
          <tr>
            <th scope="col">{noun}</th>
            <th scope="col" className="num">使用</th>
            <th scope="col" className="num">勝率</th>
            <th scope="col">主な使い手</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.name}>
              <td className="catalog-name">
                <button
                  type="button"
                  className="link-like catalog-name-button"
                  onClick={() => onSelectEquip(entry.name)}
                  title={`${entry.name} の詳細を見る`}
                >
                  {entry.name}
                </button>
              </td>
              <td className="num catalog-n1">
                <CatalogNum label="使用">{fmt(entry.battles)}回</CatalogNum>
              </td>
              <td className="num catalog-n2">
                {entry.decided === 0 ? (
                  <span className="catalog-dash">-</span>
                ) : (
                  <CatalogNum label="勝率">
                    {formatWinRate(entry.winRate, entry.decided)}
                    <span className="catalog-sub">
                      {fmt(entry.wins)}勝{fmt(entry.losses)}敗
                    </span>
                  </CatalogNum>
                )}
              </td>
              <td className="catalog-note">
                {entry.topUsers.length === 0 ? (
                  <span className="catalog-dash">-</span>
                ) : (
                  <span className="catalog-users">
                    {entry.topUsers.map((user) => (
                      <button
                        key={user.name}
                        type="button"
                        className="link-like"
                        onClick={() => onSelectWarlord(user.name)}
                        title={`${user.name} の戦績を見る`}
                      >
                        {user.name}
                        <span className="catalog-user-count">
                          ×{fmt(user.count)}
                        </span>
                      </button>
                    ))}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
