"use client";

import { useEffect, useState } from "react";
import type { WarlordMap } from "@/lib/types";
import { FactionTab } from "@/components/tabs/FactionTab";
import { resolveTheme, type ResolvedTheme, type ThemePref } from "@/lib/theme";
import type { FactionColorMap } from "@/lib/factionColors";

interface Props {
  db: WarlordMap;
  log: import("@/lib/types").BattleRecord[];
  colors: FactionColorMap;
  onChangeColors: (next: FactionColorMap) => void;
  onSelectFaction: (name: string) => void;
  themePref: ThemePref;
  onChangeTheme: (pref: ThemePref) => void;
  isAdmin?: boolean;
  onDeleteFaction?: (faction: string) => Promise<void> | void;
}

const THEME_CHOICES: { value: ThemePref; label: string }[] = [
  { value: "auto", label: "自動" },
  { value: "system", label: "OSに合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

/** 環境設定タブ。テーマ（外観）と国カラーの設定をまとめて行う。 */
export function SettingsTab({
  db,
  log,
  colors,
  onChangeColors,
  onSelectFaction,
  themePref,
  onChangeTheme,
  isAdmin = false,
  onDeleteFaction,
}: Props) {
  // 解決済みテーマ（時間帯依存）は描画後に算出し、SSR との不一致を避ける。
  const [resolved, setResolved] = useState<ResolvedTheme | null>(null);
  useEffect(() => {
    setResolved(resolveTheme(themePref));
  }, [themePref]);

  return (
    <>
      <section className="panel">
        <div className="history-head">
          <h2>テーマ（外観）</h2>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          画面のライト／ダークを切り替えます。「自動」は時間帯で切り替わります
          （6:00〜18:00 はライト、それ以外はダーク）。「OSに合わせる」は端末の
          外観設定（prefers-color-scheme）に追従します。
        </p>
        <div className="theme-options">
          <div className="theme-seg" role="group" aria-label="テーマの切り替え">
            {THEME_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={
                  "theme-seg-btn" + (themePref === c.value ? " active" : "")
                }
                aria-pressed={themePref === c.value}
                onClick={() => onChangeTheme(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {resolved && (
            <span className="theme-current">
              現在:{" "}
              <strong>{resolved === "light" ? "ライト" : "ダーク"}</strong>
              {themePref === "auto"
                ? "（時間帯による自動）"
                : themePref === "system"
                  ? "（OS設定に追従）"
                  : ""}
            </span>
          )}
        </div>
      </section>

      <FactionTab
        db={db}
        log={log}
        colors={colors}
        onChange={onChangeColors}
        onSelectFaction={onSelectFaction}
        isAdmin={isAdmin}
        onDeleteFaction={onDeleteFaction}
      />
    </>
  );
}
