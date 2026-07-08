"use client";

import { useEffect, useMemo, useState } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { parseBattleCard } from "@/lib/parser";
import {
  DEFAULT_WIN_LEFT,
  DEFAULT_WIN_RIGHT,
  FACTION_PALETTE,
  factionBadgeStyle,
  paletteName,
  type FactionColorMap,
} from "@/lib/factionColors";

interface Props {
  db: WarlordMap;
  log: BattleRecord[];
  colors: FactionColorMap;
  onChange: (next: FactionColorMap) => void;
  onSelectFaction: (name: string) => void;
  isAdmin?: boolean;
  onDeleteFaction?: (faction: string) => Promise<void> | void;
}

/** 入力された文字列を #RRGGBB（大文字）へ正規化する。3桁/6桁・先頭#の有無に対応。
 *  妥当な16進カラーでなければ null を返す。 */
function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return (
      "#" +
      s
        .split("")
        .map((c) => c + c)
        .join("")
        .toUpperCase()
    );
  }
  return null;
}

export function FactionTab({
  db,
  log,
  colors,
  onChange,
  onSelectFaction,
  isAdmin = false,
  onDeleteFaction,
}: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  // カスタムHEX入力の作業値（パレットを開いている国の現在色で初期化）。
  const [customHex, setCustomHex] = useState("");
  // 国の戦闘記録を削除中の対象国名（ボタンの二重押下防止）。
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setCustomHex(openFor ? colors[openFor] ?? "" : "");
  }, [openFor, colors]);

  const factions = useMemo(
    () =>
      Array.from(
        new Set(
          log.flatMap((record) => {
            const card = parseBattleCard(record.line);
            if (!card) return [] as string[];
            return [card.left.faction?.trim(), card.right.faction?.trim()].filter(
              (v): v is string => !!v
            );
          })
        )
      ).sort((a, b) => a.localeCompare(b, "ja")),
    [log]
  );

  const setColor = (faction: string, color: string) => {
    onChange({ ...colors, [faction]: color });
    setOpenFor(null);
  };

  const clearColor = (faction: string) => {
    const next = { ...colors };
    delete next[faction];
    onChange(next);
    setOpenFor(null);
  };

  const handleDelete = async (faction: string) => {
    if (!onDeleteFaction) return;
    const ok = window.confirm(
      `「${faction}」が関わる戦闘記録をすべて削除します（全期間が対象）。\n` +
        `両陣営で戦った記録のため、相手国の履歴からも消えます。\n` +
        `この操作は取り消せません。よろしいですか？`
    );
    if (!ok) return;
    setDeleting(faction);
    try {
      await onDeleteFaction(faction);
    } finally {
      setDeleting(null);
    }
  };

  const resetAll = () => {
    if (!window.confirm("すべての国カラー設定を初期状態（既定色）に戻しますか？")) return;
    onChange({});
    setOpenFor(null);
  };

  const assigned = factions.filter((f) => colors[f]).length;

  // パレットを開いている間は Escape で閉じられるようにする（キーボード操作対応）。
  useEffect(() => {
    if (!openFor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openFor]);

  return (
    <section className="panel">
      <div className="history-head">
        <h2>国カラー設定</h2>
        <span className="count-badge">
          {assigned} / {factions.length} 設定済
        </span>
        {assigned > 0 && (
          <button
            type="button"
            className="btn"
            onClick={resetAll}
            title="すべての国カラーを既定色に戻します"
          >
            すべてリセット
          </button>
        )}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        国（勢力）ごとに色を設定します。戦闘履歴カードの左右ボーダー（各国の色）と勝者名の色に反映されます。
        上の「対象の期」に応じて、その期に登場する国だけを表示します。国名をクリックすると、その国の成績ページを開けます。
        未設定の国は既定色（左側
        <span className="swatch" style={{ background: DEFAULT_WIN_LEFT }} />
        / 右側
        <span className="swatch" style={{ background: DEFAULT_WIN_RIGHT }} />）
        で表示されます。
      </p>

      {factions.length === 0 ? (
        <div className="empty">
          登録された国がありません。戦闘履歴を登録すると国が一覧に表示されます。
        </div>
      ) : (
        <div className="faction-color-list">
          {factions.map((f) => {
            const current = colors[f];
            const isSet = !!current;
            const name = paletteName(current);
            return (
              <div className="faction-color-row" key={f}>
                <button
                  type="button"
                  className="tag faction faction-link"
                  style={factionBadgeStyle(f, colors)}
                  onClick={() => onSelectFaction(f)}
                  title={`${f} の成績を見る`}
                >
                  {f}
                </button>
                <div className="faction-picker">
                  <button
                    type="button"
                    className="color-trigger"
                    onClick={() => setOpenFor((cur) => (cur === f ? null : f))}
                    aria-expanded={openFor === f}
                    aria-label={`${f} の色を選択（現在: ${
                      isSet ? name ?? current : "未設定"
                    }）`}
                  >
                    <span
                      className="swatch-lg"
                      style={{ background: current ?? "transparent" }}
                    />
                    <span className={isSet ? "" : "muted"}>
                      {isSet ? name ?? current : "未設定"}
                    </span>
                  </button>

                  {openFor === f && (
                    <div className="palette-pop">
                      <div className="palette-grid">
                        {FACTION_PALETTE.map((c) => (
                          <button
                            type="button"
                            key={c.value}
                            className={
                              "palette-swatch" +
                              (current?.toUpperCase() === c.value.toUpperCase()
                                ? " selected"
                                : "")
                            }
                            style={{ background: c.value }}
                            title={`${c.name} ${c.value}`}
                            aria-label={`${c.name} ${c.value}`}
                            onClick={() => setColor(f, c.value)}
                          />
                        ))}
                      </div>
                      <div className="palette-custom">
                        <span className="palette-custom-label muted">
                          カスタム
                        </span>
                        <input
                          type="color"
                          className="custom-color"
                          value={normalizeHex(customHex) ?? current ?? "#888888"}
                          onChange={(e) => setCustomHex(e.target.value)}
                          aria-label={`${f} のカスタム色を選択`}
                        />
                        <input
                          type="text"
                          className="text-input custom-hex"
                          value={customHex}
                          onChange={(e) => setCustomHex(e.target.value)}
                          onKeyDown={(e) => {
                            const hex = normalizeHex(customHex);
                            if (e.key === "Enter" && hex) setColor(f, hex);
                          }}
                          placeholder="#RRGGBB"
                          maxLength={7}
                          spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                          aria-label={`${f} のカスタムHEX`}
                        />
                        <button
                          type="button"
                          className="btn btn-primary palette-apply"
                          onClick={() => {
                            const hex = normalizeHex(customHex);
                            if (hex) setColor(f, hex);
                          }}
                          disabled={!normalizeHex(customHex)}
                        >
                          適用
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {isSet && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => clearColor(f)}
                  >
                    クリア
                  </button>
                )}
                {isAdmin && onDeleteFaction && (
                  <button
                    type="button"
                    className="btn faction-delete"
                    onClick={() => handleDelete(f)}
                    disabled={deleting === f}
                    title={`${f} が関わる戦闘記録をすべて削除`}
                  >
                    {deleting === f ? "削除中…" : "削除"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {openFor && (
        <div
          className="palette-backdrop"
          onClick={() => setOpenFor(null)}
          aria-hidden
        />
      )}
    </section>
  );
}
