import type { ReactNode } from "react";

type FilterOption = string | { value: string; label: string };

/**
 * 絞り込みパネルのラベル付きセレクト。
 * 値は常に文字列で受け渡し、数値や型付きキーへの変換は呼び出し側で行う。
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: ReactNode;
  value: string;
  /** 文字列ならその値を表示にも使う。 */
  options: readonly FilterOption[];
  onChange: (value: string) => void;
  /** 先頭に置く空値（""）の選択肢。「すべて」「指定なし」など。 */
  emptyLabel?: string;
}) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {emptyLabel != null && <option value="">{emptyLabel}</option>}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
