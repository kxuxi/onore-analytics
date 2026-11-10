import { SegmentedControl } from "@/components/SegmentedControl";
import type { ReactNode } from "react";

/** 図鑑（兵種・武器・品物）で共通の「検索 + 絞り込み1つ」の操作行。 */
export function CatalogToolbar({ children }: { children: ReactNode }) {
  return <div className="catalog-toolbar">{children}</div>;
}

/** 一覧の見出し行。左に件数、右に並び順。 */
export function CatalogListHead<K extends string>({
  total,
  shown,
  sort,
  options,
  onSort,
}: {
  total: number;
  shown: number;
  sort: K;
  options: { key: K; label: string }[];
  onSort: (key: K) => void;
}) {
  const fmt = (n: number) => n.toLocaleString("ja-JP");
  return (
    <div className="catalog-listhead">
      <p className="catalog-count" role="status">
        {shown === total ? `全${fmt(total)}件` : `${fmt(total)}件中 ${fmt(shown)}件`}
      </p>
      <SegmentedControl
        className="catalog-sort"
        ariaLabel="並び順"
        options={options}
        value={sort}
        onChange={onSort}
      />
    </div>
  );
}

/** 数値セル。表の見出しが隠れる狭い画面では、値の前にラベルを出す。 */
export function CatalogNum({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <span className="catalog-num-label">{label}</span>
      {children}
    </>
  );
}
