"use client";

import { useMemo, useState } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { factionSummaries, formatWinRate } from "@/lib/stats";
import { factionNameStyle, type FactionColorMap } from "@/lib/factionColors";
import { SearchBox } from "@/components/SearchBox";
import { PageHeader } from "@/components/layout/PageHeader";

interface Props {
  db: WarlordMap;
  log: BattleRecord[];
  colors: FactionColorMap;
  onSelectFaction: (name: string) => void;
}

type SortKey = "battles" | "winRate" | "members" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "battles", label: "戦闘数順" },
  { key: "winRate", label: "勝率順" },
  { key: "members", label: "人数順" },
  { key: "name", label: "名前順" },
];

export function NationTab({ db, log, colors, onSelectFaction }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("battles");

  const summaries = useMemo(() => factionSummaries(log, db), [log, db]);

  // 検索語での絞り込みと並べ替えを適用した表示用リスト。
  const view = useMemo(() => {
    const q = query.trim();
    const filtered = q
      ? summaries.filter((f) => f.faction.includes(q))
      : summaries;
    const arr = [...filtered];
    switch (sort) {
      case "winRate":
        arr.sort(
          (a, b) =>
            (b.decided > 0 ? 1 : 0) - (a.decided > 0 ? 1 : 0) ||
            b.winRate - a.winRate ||
            b.battles - a.battles ||
            a.faction.localeCompare(b.faction, "ja")
        );
        break;
      case "members":
        arr.sort(
          (a, b) =>
            b.members - a.members ||
            b.battles - a.battles ||
            a.faction.localeCompare(b.faction, "ja")
        );
        break;
      case "name":
        arr.sort((a, b) => a.faction.localeCompare(b.faction, "ja"));
        break;
      // "battles" は factionSummaries の既定（戦闘数→勝率順）をそのまま使う。
      default:
        break;
    }
    return arr;
  }, [summaries, query, sort]);

  // 勝率バーの基準（最大勝率）。全国の比較がしやすいよう相対幅にする。
  const maxRate =
    view.reduce((m, f) => (f.decided > 0 ? Math.max(m, f.winRate) : m), 0) || 1;

  return (
    <section className="panel">
      <PageHeader
        title="国"
        description="登録された国（勢力）の一覧です。所属人数・戦闘数・勝率を確認でき、国名を選ぶとその国の成績ページ（所属武将や現在の主力兵種）を開けます。"
      />

      <div className="search-row">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="国名で検索"
        />
        <label className="sort-toggle">
          <span className="muted" style={{ fontSize: 12 }}>
            並べ替え
          </span>
          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="国の並べ替え"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className="count-badge">
          {view.length.toLocaleString("ja-JP")} / {summaries.length.toLocaleString("ja-JP")} 国
        </span>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        該当 {view.length.toLocaleString("ja-JP")}国
      </p>

      {view.length === 0 ? (
        <div className="empty">
          <p className="empty-title">該当する国がありません</p>
          <p className="empty-hint">
            「戦闘履歴」タブで戦績を登録するか、DBに武将の所属国を登録すると、ここに国の一覧が表示されます。
            すでに登録済みの場合は検索語を見直してください。
          </p>
        </div>
      ) : (
        <ol className="nation-list">
          {view.map((f, i) => {
            const pct = f.decided > 0 ? Math.round(f.winRate * 100) : 0;
            const barWidth = f.decided > 0 ? (f.winRate / maxRate) * 100 : 0;
            return (
              <li key={f.faction} className="nation-row">
                <span className="nation-rank">{i + 1}</span>
                <div className="nation-main">
                  <div className="nation-head">
                    <button
                      type="button"
                      className="nation-name link-like"
                      style={factionNameStyle(f.faction, colors)}
                      onClick={() => onSelectFaction(f.faction)}
                      title={`${f.faction} の成績を見る`}
                    >
                      {f.faction}
                    </button>
                    <span className="nation-rate">
                      {formatWinRate(f.winRate, f.decided)}
                    </span>
                  </div>
                  <div className="nation-meta">
                    <span className="tag">{f.members.toLocaleString("ja-JP")}人</span>
                    <span className="muted">
                      {f.battles.toLocaleString("ja-JP")}戦
                      {f.decided > 0
                        ? `・${f.wins.toLocaleString("ja-JP")}勝${f.losses.toLocaleString(
                            "ja-JP"
                          )}敗`
                        : ""}
                    </span>
                  </div>
                  <span
                    className="nation-bar"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${f.faction} の勝率 ${pct}%`}
                  >
                    <span
                      className="nation-bar-fill"
                      style={{ width: `${barWidth}%` }}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
