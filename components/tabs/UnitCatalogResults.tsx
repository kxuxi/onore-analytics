import type { UnitType } from "@/lib/types";
import { splitGoodAgainst } from "@/lib/unitTypeForm";
import {
  isStaticUnitTypeLabelTarget,
  STATIC_UNIT_TYPE_LABEL_VALUE,
} from "@/lib/unitTypeLabel";
import type { MouseEvent } from "react";
import {
  UNIT_CATALOG_COLUMNS,
  type UnitCatalogSortDirection,
  type UnitCatalogSortKey,
} from "./unitCatalog";

interface Props {
  units: UnitType[];
  sortKey: UnitCatalogSortKey;
  sortDirection: UnitCatalogSortDirection;
  onSort: (key: UnitCatalogSortKey) => void;
  onSelectUnit: (name: string) => void;
}

function UnitTags({ value }: { value: string }) {
  const unitNames = splitGoodAgainst(value);
  if (unitNames.length === 0) return <span className="muted">-</span>;

  return (
    <span className="tag-list">
      {unitNames.map((unitName) => (
        <span key={unitName} className="tag unit">
          {unitName}
        </span>
      ))}
    </span>
  );
}

function UnitTypeLabel({ name }: { name: string }) {
  return (
    <span
      className="tag branch"
      data-unit-type-label={STATIC_UNIT_TYPE_LABEL_VALUE}
    >
      {name}
    </span>
  );
}

function UnitDetailButton({
  name,
  onSelectUnit,
}: {
  name: string;
  onSelectUnit: (name: string) => void;
}) {
  return (
    <button
      type="button"
      className="link-like catalog-name-button"
      onClick={(event) => {
        event.stopPropagation();
        onSelectUnit(name);
      }}
      title={`${name} の詳細を見る`}
    >
      {name}
    </button>
  );
}

function sortActionLabel(
  columnLabel: string,
  active: boolean,
  sortDirection: UnitCatalogSortDirection
) {
  if (!active) return `${columnLabel}を昇順で並べ替える`;
  const currentLabel = sortDirection === "asc" ? "昇順" : "降順";
  const nextLabel = sortDirection === "asc" ? "降順" : "昇順";
  return `${columnLabel}は現在${currentLabel}。${nextLabel}へ切り替える`;
}

export function UnitCatalogResults({
  units,
  sortKey,
  sortDirection,
  onSort,
  onSelectUnit,
}: Props) {
  const activeSortLabel =
    UNIT_CATALOG_COLUMNS.find((column) => column.key === sortKey)?.label ??
    "兵種";
  const selectUnitFromContainer = (
    event: MouseEvent<HTMLElement>,
    name: string
  ) => {
    if (isStaticUnitTypeLabelTarget(event.target)) return;
    onSelectUnit(name);
  };

  return (
    <div className="catalog-results">
      <div
        className="catalog-compact-sort"
        role="group"
        aria-label="兵種図鑑の並べ替え"
      >
        <label className="filter">
          <span>並べ替え</span>
          <select
            className="select"
            value={sortKey}
            onChange={(event) => {
              const nextKey = event.target.value as UnitCatalogSortKey;
              if (nextKey !== sortKey) onSort(nextKey);
            }}
          >
            {UNIT_CATALOG_COLUMNS.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn catalog-sort-direction"
          onClick={() => onSort(sortKey)}
          aria-label={`${activeSortLabel}を${
            sortDirection === "asc" ? "降順" : "昇順"
          }へ切り替える`}
        >
          <span aria-hidden="true">
            {sortDirection === "asc" ? "↑" : "↓"}
          </span>
          <span>{sortDirection === "asc" ? "昇順" : "降順"}</span>
        </button>
      </div>

      <div className="table-wrap catalog-full-table">
        <table className="unit-table">
          <caption className="sr-only">兵種図鑑</caption>
          <thead>
            <tr>
              {UNIT_CATALOG_COLUMNS.map((column) => {
                const active = sortKey === column.key;
                return (
                  <th
                    key={column.key}
                    aria-sort={
                      active
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      className={`th-sort${active ? " active" : ""}`}
                      onClick={() => onSort(column.key)}
                      aria-label={sortActionLabel(
                        column.label,
                        active,
                        sortDirection
                      )}
                    >
                      {column.label}
                      <span className="sort-ind" aria-hidden="true">
                        {active
                          ? sortDirection === "asc"
                            ? "▲"
                            : "▼"
                          : "⇅"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr
                key={unit.name}
                onClick={(event) =>
                  selectUnitFromContainer(event, unit.name)
                }
                className="catalog-clickable-row"
              >
                <td>
                  <UnitDetailButton
                    name={unit.name}
                    onSelectUnit={onSelectUnit}
                  />
                </td>
                <td>
                  {unit.category ? (
                    <UnitTypeLabel name={unit.category} />
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="catalog-secondary-text">
                  <UnitTags value={unit.goodAgainst} />
                </td>
                <td>{unit.attack}</td>
                <td>{unit.defense}</td>
                <td className="catalog-secondary-text">{unit.cost || "-"}</td>
                <td className="catalog-secondary-text">
                  {unit.reqStats || "-"}
                </td>
                <td className="catalog-secondary-text">
                  {unit.bonus || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="catalog-card-list" aria-label="兵種一覧">
        {units.map((unit) => (
          <li key={unit.name} className="catalog-card">
            <article
              className="catalog-unit-card-action"
              onClick={(event) => selectUnitFromContainer(event, unit.name)}
            >
              <header className="catalog-card-header">
                <UnitDetailButton
                  name={unit.name}
                  onSelectUnit={onSelectUnit}
                />
                {unit.category ? (
                  <UnitTypeLabel name={unit.category} />
                ) : (
                  <span className="muted">-</span>
                )}
              </header>

              <dl className="catalog-primary-stats">
                <div>
                  <dt>攻撃</dt>
                  <dd>{unit.attack}</dd>
                </div>
                <div>
                  <dt>防御</dt>
                  <dd>{unit.defense}</dd>
                </div>
                <div>
                  <dt>雇用</dt>
                  <dd>{unit.cost || "-"}</dd>
                </div>
              </dl>

              <details
                className="catalog-card-details"
                onClick={(event) => event.stopPropagation()}
              >
                <summary>
                  <span className="catalog-details-closed">
                    一覧の詳細を表示
                  </span>
                  <span className="catalog-details-open">
                    一覧の詳細を閉じる
                  </span>
                  <span className="sr-only">：{unit.name}</span>
                </summary>
                <dl className="catalog-detail-list">
                  <div>
                    <dt>得意兵種</dt>
                    <dd>
                      <UnitTags value={unit.goodAgainst} />
                    </dd>
                  </div>
                  <div>
                    <dt>必要能力値</dt>
                    <dd>{unit.reqStats || "-"}</dd>
                  </div>
                  <div>
                    <dt>ボーナス</dt>
                    <dd>{unit.bonus || "-"}</dd>
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
