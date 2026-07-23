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
  onCleanupSkewed?: () => Promise<void> | void;
  /** 過去ログ記録モード（ON のとき過去の期にも登録できる）。 */
  pastLogMode?: boolean;
  onChangePastLogMode?: (next: boolean) => void;
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
  onCleanupSkewed,
  pastLogMode = false,
  onChangePastLogMode,
}: Props) {
  // 解決済みテーマ（時間帯依存）は描画後に算出し、SSR との不一致を避ける。
  const [resolved, setResolved] = useState<ResolvedTheme | null>(null);
  useEffect(() => {
    setResolved(resolveTheme(themePref));
  }, [themePref]);

  // データ整理（項目ずれの削除）の実行中フラグ。
  const [cleaning, setCleaning] = useState(false);
  const handleCleanup = async () => {
    if (!onCleanupSkewed) return;
    const ok = window.confirm(
      "項目がずれて登録された戦闘記録と武将を削除します。\n" +
        "（オリジナル兵名や装備名のスペースで項目がずれ、タイプ欄に兵種名・" +
        "兵種タイプ欄に装備名が入り込んだデータが対象です）\n" +
        "ランキングや被弾表などの集計から取り除かれます。この操作は取り消せません。よろしいですか？"
    );
    if (!ok) return;
    setCleaning(true);
    try {
      await onCleanupSkewed();
    } finally {
      setCleaning(false);
    }
  };

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

      {isAdmin && onChangePastLogMode && (
        <section className="panel">
          <div className="history-head">
            <h2>過去ログ記録モード</h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            通常は最新の期にしか戦闘履歴を登録できません。このモードを ON にすると、
            サイドバーで過去の期を選んだ状態でも戦闘履歴を登録できます（管理者のみ）。
            過去のログを取り込むときだけ ON にし、終わったら OFF に戻すことをおすすめします。
          </p>
          <div className="theme-options">
            <div
              className="theme-seg"
              role="group"
              aria-label="過去ログ記録モードの切り替え"
            >
              <button
                type="button"
                className={"theme-seg-btn" + (!pastLogMode ? " active" : "")}
                aria-pressed={!pastLogMode}
                onClick={() => onChangePastLogMode(false)}
              >
                OFF
              </button>
              <button
                type="button"
                className={"theme-seg-btn" + (pastLogMode ? " active" : "")}
                aria-pressed={pastLogMode}
                onClick={() => onChangePastLogMode(true)}
              >
                ON
              </button>
            </div>
            <span className="theme-current">
              現在:{" "}
              <strong>
                {pastLogMode
                  ? "ON（過去の期にも登録可）"
                  : "OFF（最新の期のみ）"}
              </strong>
            </span>
          </div>
        </section>
      )}

      {isAdmin && onCleanupSkewed && (
        <section className="panel">
          <div className="history-head">
            <h2>データの整理</h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            項目がずれて登録された戦闘記録・武将を削除します。オリジナル兵名や
            装備名にスペースが含まれると項目が 1 つずれ、タイプ欄に兵種名・兵種タイプ欄に
            装備名が入り込むことがあります。これらはランキングや被弾表などの集計に
            誤って含まれるため、削除すると集計が正しくなります。
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn faction-delete"
              onClick={handleCleanup}
              disabled={cleaning}
            >
              {cleaning ? "整理中…" : "ずれたデータを整理する"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
