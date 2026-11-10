import type { UnitType } from "@/lib/types";
import { splitGoodAgainst } from "@/lib/unitTypeForm";
import { CatalogNum } from "./CatalogParts";

interface Props {
  units: UnitType[];
  onSelectUnit: (name: string) => void;
}

/** 兵種図鑑の一覧。武器・品物図鑑と同じ列構成（名前 / 数値 / 補足）で並べる。 */
export function UnitCatalogResults({ units, onSelectUnit }: Props) {
  return (
    <div className="catalog-results">
      <table className="catalog-table catalog-table-unit">
        <caption className="sr-only">兵種図鑑</caption>
        <thead>
          <tr>
            <th scope="col">兵種</th>
            <th scope="col" className="num">攻撃</th>
            <th scope="col" className="num">防御</th>
            <th scope="col">得意</th>
            <th scope="col">雇用・必要能力・ボーナス</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => {
            const good = splitGoodAgainst(unit.goodAgainst);
            const req = [unit.cost, unit.reqStats].filter(Boolean).join("・");
            return (
              <tr key={unit.name}>
                <td className="catalog-name">
                  <button
                    type="button"
                    className="link-like catalog-name-button"
                    onClick={() => onSelectUnit(unit.name)}
                    title={`${unit.name} の詳細を見る`}
                  >
                    {unit.name}
                  </button>
                  {unit.category && (
                    <span className="catalog-sub">{unit.category}</span>
                  )}
                </td>
                <td className="num catalog-n1">
                  <CatalogNum label="攻撃">{unit.attack}</CatalogNum>
                </td>
                <td className="num catalog-n2">
                  <CatalogNum label="防御">{unit.defense}</CatalogNum>
                </td>
                <td className="catalog-good">
                  {good.length > 0 ? (
                    <>
                      <span className="catalog-num-label">得意</span>
                      {good.join("・")}
                    </>
                  ) : (
                    <span className="catalog-dash">-</span>
                  )}
                </td>
                <td className="catalog-note">
                  {req && <span className="catalog-note-line">{req}</span>}
                  {unit.bonus && (
                    <span className="catalog-note-line">{unit.bonus}</span>
                  )}
                  {!req && !unit.bonus && (
                    <span className="catalog-dash">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
