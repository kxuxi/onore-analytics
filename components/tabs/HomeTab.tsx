"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { BattleRecord, WarlordMap } from "@/lib/types";
import { householdAliases, lookup } from "@/lib/storage";
import { normalizeDisplayToken } from "@/lib/parser";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { getMyWarlord, setMyWarlord } from "@/lib/myWarlord";
import {
  collectWarlordBattles,
  summarize,
  selfUnitStats,
  opponentTraitStats,
  opponentStats,
  metaOverview,
  latestSelfProfile,
  weeklyWinRateTrend,
  formatWinRate,
  type BattleOutcome,
} from "@/lib/stats";
import { SearchBox } from "@/components/SearchBox";
import { WinRateBar } from "@/components/detail/DetailParts";

interface Props {
  log: BattleRecord[];
  db: WarlordMap;
  colors: FactionColorMap;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectFaction: (name: string) => void;
}

/** 時系列（新しい順）の結果から、現在の連勝／連敗を表すラベルを返す。 */
function streakLabel(outcomes: BattleOutcome[]): string {
  let count = 0;
  let kind: "win" | "loss" | null = null;
  for (const o of outcomes) {
    if (o.result !== "win" && o.result !== "loss") continue;
    if (kind === null) {
      kind = o.result;
      count = 1;
    } else if (o.result === kind) {
      count++;
    } else break;
  }
  if (kind === null) return "対戦中";
  return kind === "win" ? `${count}連勝中` : `${count}連敗中`;
}

/** 勝率に応じたトーン（good=勝ち越し / bad=負け越し）。 */
function rateTone(winRate: number, decided: number): string {
  if (decided <= 0) return "";
  if (winRate > 0.5) return " good";
  if (winRate < 0.5) return " bad";
  return " even";
}

/** 勝率を 1 本のバー＋数値で示す行（兵種別勝率・敵タイプ別勝率で共用）。 */
function RateRow({
  label,
  battles,
  wins,
  losses,
  decided,
  winRate,
  onClick,
}: {
  label: ReactNode;
  battles: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
  onClick?: () => void;
}) {
  const pct = decided > 0 ? Math.round(winRate * 100) : 0;
  return (
    <div className="home-rate-row">
      <div className="home-rate-label">
        {onClick ? (
          <button type="button" className="link-btn" onClick={onClick}>
            {label}
          </button>
        ) : (
          <span>{label}</span>
        )}
        <span className="muted home-rate-count">
          {wins}勝{losses}敗 / {battles}戦
        </span>
      </div>
      <div className="home-rate-bar">
        <div
          className={"home-rate-fill" + rateTone(winRate, decided)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="home-rate-val">{formatWinRate(winRate, decided)}</div>
    </div>
  );
}

/** 勝敗結果を表示テキスト＋色クラスに変換する。 */
function resultBadge(o: BattleOutcome): { text: string; cls: string } {
  if (o.result === "win") return { text: "勝利", cls: "home-res-win" };
  if (o.result === "loss") return { text: "敗北", cls: "home-res-loss" };
  return { text: "引分・撤退", cls: "home-res-other" };
}

/**
 * ホーム画面のダッシュボード。
 * 「自分の武将」をクッキーで管理し、その武将に関する各種サマリを表示する。
 */
export function HomeTab({
  log,
  db,
  colors,
  onSelectWarlord,
  onSelectUnit,
  onSelectFaction,
}: Props) {
  // 自分の武将名（クッキー由来）。詳細はハイドレーション後にマウントされるため
  // 初期化子で同期的にクッキーを読んでも SSR 不整合は起きない。
  const [name, setName] = useState<string | null>(() => getMyWarlord());
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");

  // 武将選択の候補（全 DB の名前から検索）。
  const allNames = useMemo(() => {
    const set = new Set<string>();
    for (const w of Object.values(db)) if (w.name) set.add(w.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [db]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 12);
  }, [allNames, query]);

  // 自分の武将の戦績（household 別名を統合して集計）。
  const aliases = useMemo(
    () => (name ? householdAliases(db, name) : []),
    [db, name]
  );
  const outcomes = useMemo(
    () => (name ? collectWarlordBattles(log, name, aliases) : []),
    [log, name, aliases]
  );
  const recent30 = useMemo(() => outcomes.slice(0, 30), [outcomes]);
  const summary30 = useMemo(() => summarize(recent30), [recent30]);
  const overall = useMemo(() => summarize(outcomes), [outcomes]);
  const unitProf = useMemo(() => selfUnitStats(outcomes), [outcomes]);
  const traitStats = useMemo(() => opponentTraitStats(outcomes), [outcomes]);
  const opponents = useMemo(
    () =>
      opponentStats(outcomes)
        .filter((o) => o.battles >= 2)
        .sort((a, b) => b.battles - a.battles || b.decided - a.decided),
    [outcomes]
  );
  const meta = useMemo(() => metaOverview(log), [log]);

  // 先週比の勝率トレンド（最新の戦闘日時を基準に今週 vs 先週）。
  const weekly = useMemo(() => weeklyWinRateTrend(outcomes), [outcomes]);

  const trend = useMemo(
    () => [
      { label: "直近10戦", s: summarize(outcomes.slice(0, 10)) },
      { label: "直近30戦", s: summary30 },
      { label: "全期間", s: overall },
    ],
    [outcomes, summary30, overall]
  );

  // 苦手な相手タイプ（5戦以上・全体勝率より明確に低い）と、得意なタイプ。
  const eligTraits = useMemo(
    () => traitStats.filter((t) => t.decided >= 5),
    [traitStats]
  );
  const weakTrait = useMemo(() => {
    if (eligTraits.length === 0) return null;
    const w = eligTraits.reduce((m, t) => (t.winRate < m.winRate ? t : m));
    return w.winRate < overall.winRate - 0.05 ? w : null;
  }, [eligTraits, overall.winRate]);
  const strongTrait = useMemo(
    () =>
      eligTraits.length === 0
        ? null
        : eligTraits.reduce((m, t) => (t.winRate > m.winRate ? t : m)),
    [eligTraits]
  );

  const rival = opponents[0] ?? null;
  const rivalOutcomes = useMemo(
    () =>
      rival
        ? outcomes.filter((o) => o.opponent.name?.trim() === rival.name)
        : [],
    [outcomes, rival]
  );

  const dbInfo = name ? lookup(db, name) : undefined;
  const profile = latestSelfProfile(outcomes);
  const faction = dbInfo?.faction ?? profile?.faction;
  const type = dbInfo?.type ?? profile?.type;
  const branch = dbInfo?.branch ?? profile?.branch;

  const choose = (n: string) => {
    setMyWarlord(n);
    setName(n);
    setEditing(false);
    setQuery("");
  };

  // 武将選択画面（未設定 or 変更時）。
  if (!name || editing) {
    return (
      <section className="panel home-panel">
        <div className="home-picker">
          <h2 className="home-picker-title">自分の武将を選ぶ</h2>
          <p className="muted">
            ホームに成績サマリを表示する武将を選びます。選択はこのブラウザ（クッキー）に保存されます。
          </p>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="武将名で検索"
            ariaLabel="自分の武将を検索"
          />
          {query.trim() !== "" && (
            <ul className="home-suggest">
              {suggestions.length === 0 ? (
                <li className="home-suggest-empty muted">
                  「{query}」に一致する武将が見つかりません。
                </li>
              ) : (
                suggestions.map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      className="home-suggest-item"
                      onClick={() => choose(n)}
                    >
                      {n}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          {name && (
            <button
              type="button"
              className="btn home-picker-cancel"
              onClick={() => {
                setEditing(false);
                setQuery("");
              }}
            >
              キャンセル
            </button>
          )}
        </div>
      </section>
    );
  }

  const tags = (
    <>
      {faction && (
        <button
          type="button"
          className="tag faction faction-link"
          style={factionBadgeStyle(faction, colors)}
          onClick={() => onSelectFaction(faction)}
          title={`${faction} の成績を見る`}
        >
          {faction}
        </button>
      )}
      {type && <span className="tag type">{type}</span>}
      {branch && <span className="tag branch">{branch}</span>}
    </>
  );

  const weekPct = weekly.delta == null ? null : Math.round(weekly.delta * 100);
  const weekText =
    weekPct == null
      ? "—"
      : weekPct > 0
        ? `▲ +${weekPct}%`
        : weekPct < 0
          ? `▼ ${weekPct}%`
          : "→ ±0%";
  const weekTone =
    weekPct == null ? "" : weekPct > 0 ? " good" : weekPct < 0 ? " bad" : "";

  const metaTop = meta.units[0] ?? null;
  const rivalVerdict =
    rival && rival.decided > 0
      ? rival.winRate > 0.5
        ? "勝ち越し"
        : rival.winRate < 0.5
          ? "負け越し"
          : "五分"
      : null;

  return (
    <section className="panel home-panel">
      <div className="home-dash">
        {/* 📊 あなたの成績（ヒーロー） */}
        <div className="home-hero home-card">
          <div className="home-hero-head">
            <div className="home-hero-id">
              <div className="home-hero-eyebrow">
                📊 あなたの成績（通算）
              </div>
              <h2 className="home-hero-name">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onSelectWarlord(name)}
                  title={`${name} の詳細を見る`}
                >
                  {name}
                </button>
              </h2>
              <div className="home-hero-tags">{tags}</div>
            </div>
            <button
              type="button"
              className="btn home-change"
              onClick={() => {
                setEditing(true);
                setQuery("");
              }}
            >
              武将を変更
            </button>
          </div>

          {outcomes.length === 0 ? (
            <p className="home-empty muted">
              この期の戦闘履歴に「{name}」の戦績が見つかりません。サイドバーで期を切り替えるか、別の武将を選んでください。
            </p>
          ) : (
            <>
              <div className="home-hero-stats">
                <div className="home-bigstat">
                  <div className="home-bigstat-val">
                    {formatWinRate(overall.winRate, overall.decided)}
                  </div>
                  <div className="home-bigstat-label">勝率</div>
                </div>
                <div className="home-bigstat">
                  <div className="home-bigstat-val">
                    {overall.wins.toLocaleString("ja-JP")} -{" "}
                    {overall.losses.toLocaleString("ja-JP")}
                  </div>
                  <div className="home-bigstat-label">勝敗</div>
                </div>
                <div className="home-bigstat">
                  <div className={"home-bigstat-val" + weekTone}>
                    {weekText}
                  </div>
                  <div className="home-bigstat-label">先週比</div>
                </div>
                <div className="home-bigstat">
                  <div className="home-bigstat-val">
                    {overall.battles.toLocaleString("ja-JP")}
                  </div>
                  <div className="home-bigstat-label">総戦闘数</div>
                </div>
              </div>
              <WinRateBar summary={overall} />
            </>
          )}
        </div>

        {outcomes.length > 0 && (
          <div className="home-grid">
            {/* 🎖️ 兵種別勝率 TOP3 */}
            <div className="home-card">
              <h3 className="home-card-title">🎖️ 兵種別勝率（TOP3）</h3>
              {unitProf.length === 0 ? (
                <p className="muted">データがありません。</p>
              ) : (
                <div className="home-rate-list">
                  {unitProf.slice(0, 3).map((u) => (
                    <RateRow
                      key={u.unit}
                      label={u.unit}
                      battles={u.battles}
                      wins={u.wins}
                      losses={u.losses}
                      decided={u.decided}
                      winRate={u.winRate}
                      onClick={() => onSelectUnit(u.unit)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 📈 トレンド（直近N戦） */}
            <div className="home-card">
              <h3 className="home-card-title">📈 トレンド（勝率推移）</h3>
              <div className="home-trend">
                {trend.map((t) => (
                  <div className="home-trend-item" key={t.label}>
                    <div className="home-trend-label muted">{t.label}</div>
                    <div
                      className={
                        "home-trend-val" + rateTone(t.s.winRate, t.s.decided)
                      }
                    >
                      {formatWinRate(t.s.winRate, t.s.decided)}
                    </div>
                    <div className="home-trend-sub muted">
                      {t.s.wins}-{t.s.losses}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ⚔️ 敵武将タイプ別の勝率 */}
            <div className="home-card">
              <h3 className="home-card-title">⚔️ 敵武将タイプ別の勝率</h3>
              {traitStats.length === 0 ? (
                <p className="muted">データがありません。</p>
              ) : (
                <div className="home-rate-list">
                  {traitStats.slice(0, 5).map((t) => (
                    <RateRow
                      key={t.trait}
                      label={t.trait}
                      battles={t.battles}
                      wins={t.wins}
                      losses={t.losses}
                      decided={t.decided}
                      winRate={t.winRate}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 🎯 傾向分析 */}
            <div className="home-card">
              <h3 className="home-card-title">🎯 傾向分析</h3>
              {weakTrait ? (
                <div className="home-action home-action-warn">
                  <p className="home-action-head">
                    ⚠️ <strong>{weakTrait.trait}</strong> が苦手です
                  </p>
                  <p className="muted">
                    勝率 {formatWinRate(weakTrait.winRate, weakTrait.decided)}
                    （全体 {formatWinRate(overall.winRate, overall.decided)}）。
                    このタイプが相手のときは兵種・装備の見直しを検討しましょう。
                  </p>
                </div>
              ) : (
                <div className="home-action home-action-ok">
                  <p className="home-action-head">✅ 大きな弱点はありません</p>
                  <p className="muted">タイプ別の勝率が安定しています。</p>
                </div>
              )}
              {strongTrait && (
                <p className="home-action-foot muted">
                  得意: <strong>{strongTrait.trait}</strong>（勝率{" "}
                  {formatWinRate(strongTrait.winRate, strongTrait.decided)}）
                </p>
              )}
            </div>

            {/* 📋 最近の戦闘結果（直近5戦） */}
            <div className="home-card home-card-wide">
              <h3 className="home-card-title">📋 最近の戦闘結果（直近5戦）</h3>
              <div className="table-wrap">
                <table className="home-recent-table">
                  <thead>
                    <tr>
                      <th>日時</th>
                      <th>相手</th>
                      <th>相手の兵種</th>
                      <th>結果</th>
                      <th className="num">ターン</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.slice(0, 5).map((o, i) => {
                      const badge = resultBadge(o);
                      const unit = o.opponent.unit
                        ? normalizeDisplayToken(o.opponent.unit)
                        : "—";
                      return (
                        <tr key={o.record.id ?? `${o.record.savedAt}-${i}`}>
                          <td className="home-recent-time">
                            {o.record.time ?? o.card.battleAt ?? "—"}
                          </td>
                          <td>
                            {o.opponent.name ? (
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() =>
                                  onSelectWarlord(o.opponent.name)
                                }
                              >
                                {o.opponent.name}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{unit}</td>
                          <td className={badge.cls}>{badge.text}</td>
                          <td className="num">{o.card.turns ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 🔥 メタ環境 */}
            <div className="home-card">
              <h3 className="home-card-title">🔥 メタ環境（採用率トップ）</h3>
              {!metaTop ? (
                <p className="muted">データがありません。</p>
              ) : (
                <div className="home-meta">
                  <div className="home-meta-top">
                    <button
                      type="button"
                      className="link-btn home-meta-unit"
                      onClick={() => onSelectUnit(metaTop.unit)}
                    >
                      {metaTop.unit}
                    </button>
                    <span className="tag tier">{metaTop.tier}</span>
                  </div>
                  <div className="home-meta-stats">
                    <span>採用率 {Math.round(metaTop.pickRate * 100)}%</span>
                    <span>
                      勝率 {formatWinRate(metaTop.winRate, metaTop.decided)}
                    </span>
                  </div>
                  {meta.warnings[0] && (
                    <p className="home-warn muted">⚠️ {meta.warnings[0].message}</p>
                  )}
                </div>
              )}
            </div>

            {/* 🆚 宿敵分析 */}
            <div className="home-card">
              <h3 className="home-card-title">🆚 宿敵分析</h3>
              {!rival ? (
                <p className="muted">
                  対戦数が少なく、宿敵はまだいません。
                </p>
              ) : (
                <div className="home-rival">
                  <div className="home-rival-head">
                    <button
                      type="button"
                      className="link-btn home-rival-name"
                      onClick={() => onSelectWarlord(rival.name)}
                    >
                      {rival.name}
                    </button>
                    {rival.faction && (
                      <button
                        type="button"
                        className="tag faction faction-link"
                        style={factionBadgeStyle(rival.faction, colors)}
                        onClick={() => onSelectFaction(rival.faction!)}
                      >
                        {rival.faction}
                      </button>
                    )}
                  </div>
                  <div className="home-rival-stats">
                    <span>{rival.battles}戦</span>
                    <span className="home-res-win">{rival.wins}勝</span>
                    <span className="home-res-loss">{rival.losses}敗</span>
                    <span>
                      勝率 {formatWinRate(rival.winRate, rival.decided)}
                    </span>
                  </div>
                  <div className="home-rival-streak">
                    {streakLabel(rivalOutcomes)}
                    {rivalVerdict ? `・${rivalVerdict}` : ""}
                  </div>
                  <div className="home-rival-recent">
                    {rivalOutcomes.slice(0, 5).map((o, i) => {
                      const badge = resultBadge(o);
                      return (
                        <span
                          key={o.record.id ?? `${o.record.savedAt}-${i}`}
                          className={"home-rival-dot " + badge.cls}
                          title={badge.text}
                        >
                          {o.result === "win"
                            ? "勝"
                            : o.result === "loss"
                              ? "敗"
                              : "分"}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="link-btn home-rival-more"
                    onClick={() => onSelectWarlord(rival.name)}
                  >
                    詳細を見る →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
