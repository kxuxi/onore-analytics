"use client";

import { ShowMoreButton } from "@/components/ShowMoreButton";
import { SideWinRate } from "@/components/SideWinRate";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BattleRecord, Warlord, WarlordMap } from "@/lib/types";
import { lookup } from "@/lib/storage";
import { factionBadgeStyle, type FactionColorMap } from "@/lib/factionColors";
import { getMyWarlord, setMyWarlord } from "@/lib/myWarlord";
import {
  collectWarlordBattles,
  summarize,
  summarizeBySide,
  splitBySide,
  latestSelfProfile,
  selfUnitStats,
  formatWinRate,
  warlordNamesInLog,
  type StatSummary,
} from "@/lib/stats";
import { WinRateBar } from "@/components/detail/DetailParts";
import { HomeActivation, HomeWarlordSearch } from "./HomeActivation";
import { filterHomeWarlordSuggestions } from "./homeSearch";
import {
  computeStratagemUnlockStatus,
  groupPendingByThreshold,
  STRATAGEM_CATEGORIES,
} from "@/lib/stratagemUnlock";
import {
  computeConscriptionSecurityDecrease,
  CONSCRIPTION_POLITICS_ITEMS,
} from "@/lib/conscriptionSecurity";

interface Props {
  log: BattleRecord[];
  db: WarlordMap;
  colors: FactionColorMap;
  /** 管理者のみ「自分のステータス」編集フォームを表示する。 */
  isAdmin?: boolean;
  onSelectWarlord: (name: string) => void;
  onSelectUnit: (name: string) => void;
  onSelectFaction: (name: string) => void;
  /** 未選択時に武将ランキングを開く。未指定時は導線を表示しない。 */
  onSelectRanking?: () => void;
  /** 未選択時に戦闘履歴を開く。未指定時は導線を表示しない。 */
  onSelectHistory?: () => void;
  /** 自分のステータス（能力値・最大徴兵兵数）を保存する。管理者のみ表示。 */
  onUpdateStats?: (stats: HomeStatsInput) => Promise<void>;
}

/** 自分のステータス編集フォームが送信する入力値。 */
export interface HomeStatsInput {
  name: string;
  power?: number;
  intelligence?: number;
  leadership?: number;
  politics?: number;
  strategy?: number;
  maxTroops?: number;
}

interface StatFieldDef {
  key: keyof Omit<HomeStatsInput, "name">;
  label: string;
  step?: string;
}

const STATS_FIELDS: StatFieldDef[] = [
  { key: "power", label: "武力" },
  { key: "intelligence", label: "知力" },
  { key: "leadership", label: "統率力" },
  { key: "politics", label: "政治力" },
  { key: "strategy", label: "計略", step: "0.1" },
  { key: "maxTroops", label: "最大徴兵兵数" },
];

type StatFormState = Record<StatFieldDef["key"], string>;

function statFormStateFrom(warlord: Warlord | undefined): StatFormState {
  return {
    power: warlord?.power?.toString() ?? "",
    intelligence: warlord?.intelligence?.toString() ?? "",
    leadership: warlord?.leadership?.toString() ?? "",
    politics: warlord?.politics?.toString() ?? "",
    strategy: warlord?.strategy?.toString() ?? "",
    maxTroops: warlord?.maxTroops?.toString() ?? "",
  };
}

/**
 * 「自分のステータス」編集カード。能力値と最大徴兵兵数を自己申告で保存する。
 * 管理者のみ表示（`key={name}` で武将を切り替えるたびに入力を作り直す）。
 */
function HomeStatsEditor({
  name,
  warlord,
  onSave,
  defaultOpen,
}: {
  name: string;
  warlord: Warlord | undefined;
  onSave: (stats: HomeStatsInput) => Promise<void>;
  /** 能力値が未設定のときは最初から開いて入力を促す。 */
  defaultOpen: boolean;
}) {
  const [form, setForm] = useState<StatFormState>(() =>
    statFormStateFrom(warlord),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: StatFieldDef["key"], value: string) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const stats: HomeStatsInput = { name };
      for (const { key } of STATS_FIELDS) {
        const raw = form[key].trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (Number.isNaN(n)) {
          setError(
            `「${STATS_FIELDS.find((f) => f.key === key)?.label}」は数値で入力してください`,
          );
          setBusy(false);
          return;
        }
        stats[key] = n;
      }
      await onSave(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="home-card home-editor" open={defaultOpen}>
      <summary className="home-editor-summary">
        <h3 className="home-card-title">⚙️ 自分のステータス</h3>
        <span className="home-editor-hint muted">能力値を編集</span>
      </summary>
      <p className="home-card-note muted">
        能力値と最大徴兵兵数を自己申告で設定できます（このブラウザ以外の利用者にも公開されます）。
      </p>
      <form onSubmit={handleSubmit} className="home-editor-form">
        <div className="filter-grid">
          {STATS_FIELDS.map(({ key, label, step }) => (
            <label key={key} className="filter">
              <span>{label}</span>
              <input
                type="number"
                inputMode="decimal"
                step={step ?? "1"}
                className="text-input"
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        {error && (
          <p style={{ color: "var(--outcome-loss-text)", fontSize: 13 }}>
            {error}
          </p>
        )}
        <div>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </details>
  );
}

/** 「計略解放まで」カードで表示する、次に到達する閾値の段数。 */
const NEXT_UNLOCK_TIERS = 2;

/**
 * 「計略解放まで」カード。出現判定値（計略P + 知力×2/3 切捨て）から、
 * 次に到達する閾値{@link NEXT_UNLOCK_TIERS}段ぶんを「あと計略P / 知力いくつで、何が解放されるか」
 * としてまとめて示す。解放済みは件数だけ示し、トグルで分類別の一覧を確認できる。
 * 能力値が設定されていれば誰でも見られる（編集は管理者のみ）。
 */
function StratagemUnlockCard({
  intelligence,
  strategy,
}: {
  intelligence: number;
  strategy: number;
}) {
  const [showUnlocked, setShowUnlocked] = useState(false);
  const statuses = useMemo(
    () => computeStratagemUnlockStatus(intelligence, strategy),
    [intelligence, strategy]
  );
  const currentValue = statuses[0]?.currentValue ?? 0;
  const unlocked = statuses.filter((s) => s.unlocked);
  const tiers = groupPendingByThreshold(statuses).slice(0, NEXT_UNLOCK_TIERS);
  const unlockedByCategory = STRATAGEM_CATEGORIES.map((category) => ({
    category,
    items: unlocked.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="home-card">
      <h3 className="home-card-title">🔮 計略解放まで</h3>
      <p className="home-card-note muted">
        出現判定値（計略P＋知力×2/3 切捨て）は現在{" "}
        <strong className="home-card-em">
          {Number.isInteger(currentValue)
            ? currentValue
            : currentValue.toFixed(1)}
        </strong>
      </p>
      {tiers.length > 0 ? (
        <ol className="home-unlock-tiers">
          {tiers.map((tier) => (
            <li key={tier.threshold} className="home-unlock-tier">
              <div className="home-unlock-tier-head">
                <span className="home-unlock-threshold">
                  判定値 {tier.threshold}
                </span>
                <span className="home-unlock-need muted">
                  あと計略P +{tier.neededStrategy} または 知力 +
                  {tier.neededIntelligence}
                </span>
              </div>
              <ul className="home-unlock-chips">
                {tier.items.map((s) => (
                  <li
                    key={s.label}
                    className="home-unlock-chip"
                    title={
                      s.requiredP != null
                        ? `${s.category}・必要P ${s.requiredP}`
                        : s.category
                    }
                  >
                    {s.label}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="home-card-note muted">すべて解放済みです。</p>
      )}
      {unlocked.length > 0 && (
        <div className="show-more-row">
          <button
            type="button"
            className="btn show-more-btn"
            onClick={() => setShowUnlocked((v) => !v)}
            aria-expanded={showUnlocked}
          >
            {showUnlocked
              ? "解放済みを隠す"
              : `解放済み（${unlocked.length}件）を表示`}
          </button>
        </div>
      )}
      {showUnlocked && (
        <dl className="home-unlock-done">
          {unlockedByCategory.map((g) => (
            <div key={g.category} className="home-unlock-done-group">
              <dt className="home-unlock-done-cat">{g.category}</dt>
              <dd className="home-unlock-done-items">
                <ul className="home-unlock-chips">
                  {g.items.map((s) => (
                    <li
                      key={s.label}
                      className="home-unlock-chip is-done"
                      title={
                        s.requiredP != null ? `必要P ${s.requiredP}` : undefined
                      }
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** 治安減少量の表示用フォーマット（整数ならそのまま、小数は小数点以下2桁まで）。 */
function formatSecurityDecrease(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * 「徴兵時の治安減少値」カード。徴兵数と政治力を上げる持ち物から、
 * 治安減少量 = 徴兵数 ÷ (政治力×2) + 1 を計算して表示する。
 * 政治力が設定されていれば誰でも見られる（読み取り専用のローカル計算）。
 */
function ConscriptionSecurityCard({
  politics,
  maxTroops,
}: {
  politics: number;
  maxTroops?: number;
}) {
  const [troopsInput, setTroopsInput] = useState(
    () => maxTroops?.toString() ?? "",
  );
  const [itemName, setItemName] = useState(CONSCRIPTION_POLITICS_ITEMS[0].name);

  const item =
    CONSCRIPTION_POLITICS_ITEMS.find((i) => i.name === itemName) ??
    CONSCRIPTION_POLITICS_ITEMS[0];
  const effectivePolitics = politics + item.politicsBonus;
  const troops = Number(troopsInput);
  const decrease =
    troopsInput.trim() !== "" && Number.isFinite(troops) && troops >= 0
      ? computeConscriptionSecurityDecrease(troops, effectivePolitics)
      : null;

  return (
    <div className="home-card">
      <h3 className="home-card-title">🛡️ 徴兵時の治安減少値</h3>
      <p className="home-card-note muted">
        治安減少量 = 徴兵数 ÷ (政治力 × 2) + 1
      </p>
      <div className="filter-grid">
        <label className="filter">
          <span>徴兵数</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="text-input"
            value={troopsInput}
            onChange={(e) => setTroopsInput(e.target.value)}
          />
        </label>
        <label className="filter">
          <span>持ち物</span>
          <select
            className="text-input"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          >
            {CONSCRIPTION_POLITICS_ITEMS.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
                {i.politicsBonus > 0 ? `（政治+${i.politicsBonus}）` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {item.note && <p className="home-card-note muted">{item.note}</p>}
      <div className="home-result" aria-live="polite">
        <span className="home-result-label">治安減少量</span>
        <span className="home-result-val">
          {decrease != null ? `-${formatSecurityDecrease(decrease)}` : "—"}
        </span>
        <span className="home-result-sub muted">
          政治力 {effectivePolitics}（持ち物込み）で計算
        </span>
      </div>
    </div>
  );
}

/** 「使用兵種の割合」で最初に表示する兵種数。超えた分はトグルで開閉する。 */
const UNIT_USAGE_TOP = 6;

type WarlordOutcomes = ReturnType<typeof collectWarlordBattles>;

/**
 * 「使用兵種の割合」カード。出兵・守備の 2 列に分け、それぞれの戦闘だけで
 * 兵種の使用割合と勝率を集計する（モバイルでは縦に積む）。
 */
function UnitUsageCard({
  outcomes,
  onSelectUnit,
}: {
  outcomes: WarlordOutcomes;
  onSelectUnit: (name: string) => void;
}) {
  const { attack, defense } = useMemo(
    () => splitBySide(outcomes),
    [outcomes],
  );
  return (
    <div className="home-card">
      <div className="home-card-head">
        <h3 className="home-card-title">🧩 使用兵種の割合</h3>
        <span className="home-card-aside muted">棒は勝率（100%基準）</span>
      </div>
      <div className="home-usage-cols">
        <UnitUsageList
          title="⚔️ 出兵"
          outcomes={attack}
          onSelectUnit={onSelectUnit}
        />
        <UnitUsageList
          title="🏯 守備"
          outcomes={defense}
          onSelectUnit={onSelectUnit}
        />
      </div>
    </div>
  );
}

/**
 * 使用兵種の 1 列分。使用回数の多い順に兵種を並べ、
 * 勝率（横棒・100% 基準）と使用割合を 1 行で示す。
 * 上位 {@link UNIT_USAGE_TOP} 件を超えた兵種はトグルで表示を切り替える。
 */
function UnitUsageList({
  title,
  outcomes,
  onSelectUnit,
}: {
  title: string;
  outcomes: WarlordOutcomes;
  onSelectUnit: (name: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => selfUnitStats(outcomes), [outcomes]);
  const total = all.reduce((sum, u) => sum + u.battles, 0);
  const hiddenCount = Math.max(0, all.length - UNIT_USAGE_TOP);
  const rows = showAll ? all : all.slice(0, UNIT_USAGE_TOP);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <section className="home-usage-col">
      <div className="home-card-head">
        <h4 className="home-usage-title">{title}</h4>
        <span className="home-card-aside muted">
          計 {total.toLocaleString("ja-JP")}戦
        </span>
      </div>
      {all.length === 0 ? (
        <p className="home-split-empty muted">この期の戦闘はありません。</p>
      ) : (
        <ol className="home-usage">
          {rows.map((u) => {
            const share = pct(u.battles);
            const winRate = formatWinRate(u.winRate, u.decided);
            // 棒の長さ＝勝率（端まで＝勝率100%）。勝敗が確定していなければ空。
            const fill = u.decided > 0 ? u.winRate * 100 : 0;
            return (
              <li
                key={u.unit}
                className="home-usage-row"
                title={`${u.unit}：${u.battles.toLocaleString("ja-JP")}戦（${share}%）・勝率 ${winRate}`}
              >
                <span className="home-usage-name">
                  {u.unit === "不明" ? (
                    <span className="muted">不明</span>
                  ) : (
                    <button
                      type="button"
                      className="link-like"
                      onClick={() => onSelectUnit(u.unit)}
                      title={`${u.unit} の戦績を見る`}
                    >
                      {u.unit}
                    </button>
                  )}
                </span>
                <span className="home-usage-track" aria-hidden="true">
                  <span
                    className="home-usage-fill"
                    style={{ width: `${fill}%` }}
                  />
                </span>
                <span className="home-usage-wr">勝率 {winRate}</span>
                <span className="home-usage-share muted">
                  {share}%
                  <span className="home-usage-count">
                    {u.battles.toLocaleString("ja-JP")}戦
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {hiddenCount > 0 && (
        <ShowMoreButton
          hiddenCount={hiddenCount}
          unit="種"
          expanded={showAll}
          onToggle={() => setShowAll((v) => !v)}
        />
      )}
    </section>
  );
}

/**
 * ホーム画面のダッシュボード。
 * 「自分の武将」をクッキーで管理し、その武将に関する各種サマリを表示する。
 */
export function HomeTab({
  log,
  db,
  colors,
  isAdmin = false,
  onSelectWarlord,
  onSelectUnit,
  onSelectFaction,
  onSelectRanking,
  onSelectHistory,
  onUpdateStats,
}: Props) {
  // 自分の武将名（クッキー由来）。詳細はハイドレーション後にマウントされるため
  // 初期化子で同期的にクッキーを読んでも SSR 不整合は起きない。
  const [name, setName] = useState<string | null>(() => getMyWarlord());
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dashboardHeadingRef = useRef<HTMLHeadingElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<"dashboard" | "search" | "change" | null>(
    null,
  );

  // 武将選択の候補は「対象の期に登場した武将」に絞る（log は対象の期でフィルタ済み）。
  const allNames = useMemo(() => {
    const set = warlordNamesInLog(log, db);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [log, db]);

  const suggestions = useMemo(
    () => filterHomeWarlordSuggestions(allNames, query),
    [allNames, query],
  );

  // 自分の武将の戦績（household 別名を統合して集計）。
  const outcomes = useMemo(
    () => (name ? collectWarlordBattles(log, name) : []),
    [log, name],
  );
  const overall = useMemo(() => summarize(outcomes), [outcomes]);
  // 出兵（left）・守備（right）それぞれの戦績。
  const { attack, defense } = useMemo(
    () => summarizeBySide(outcomes),
    [outcomes],
  );

  const dbInfo = name ? lookup(db, name) : undefined;
  const profile = latestSelfProfile(outcomes);
  const faction = dbInfo?.faction ?? profile?.faction;
  const type = dbInfo?.type ?? profile?.type;
  const branch = dbInfo?.branch ?? profile?.branch;
  const hasStratagemStats =
    dbInfo?.intelligence != null && dbInfo?.strategy != null;
  const hasPolitics = dbInfo?.politics != null;

  const choose = (n: string) => {
    pendingFocusRef.current = "dashboard";
    setMyWarlord(n);
    setName(n);
    setEditing(false);
    setQuery("");
  };

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (pendingFocus === "dashboard" && name && !editing) {
      dashboardHeadingRef.current?.focus();
      pendingFocusRef.current = null;
    } else if (pendingFocus === "search" && editing) {
      searchInputRef.current?.focus();
      pendingFocusRef.current = null;
    } else if (pendingFocus === "change" && name && !editing) {
      changeButtonRef.current?.focus();
      pendingFocusRef.current = null;
    }
  }, [editing, name]);

  // 初回の未選択状態だけに、サービスの価値と補助導線を表示する。
  if (!name) {
    return (
      <HomeActivation
        query={query}
        suggestions={suggestions}
        inputRef={searchInputRef}
        onQueryChange={setQuery}
        onChoose={choose}
        onSelectRanking={onSelectRanking}
        onSelectHistory={onSelectHistory}
      />
    );
  }

  // 選択済み武将を変更するときは、従来どおり検索とキャンセルだけを表示する。
  if (editing) {
    return (
      <section className="panel home-panel">
        <div className="home-picker">
          <h2 className="home-picker-title">自分の武将を選ぶ</h2>
          <p className="muted">
            ホームに成績サマリを表示する武将を選びます。選択はこのブラウザ（クッキー）に保存されます。
          </p>
          <HomeWarlordSearch
            inputRef={searchInputRef}
            query={query}
            suggestions={suggestions}
            onQueryChange={setQuery}
            onChoose={choose}
          />
          <button
            type="button"
            className="btn home-picker-cancel"
            onClick={() => {
              pendingFocusRef.current = "change";
              setEditing(false);
              setQuery("");
            }}
          >
            キャンセル
          </button>
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

  return (
    <section className="panel home-panel">
      <div className="home-dash">
        {/* 📊 あなたの成績（ヒーロー） */}
        <div className="home-hero home-card">
          <div className="home-hero-head">
            <div className="home-hero-id">
              <div className="home-hero-eyebrow">📊 あなたの成績（通算）</div>
              <h2
                ref={dashboardHeadingRef}
                className="home-hero-name"
                tabIndex={-1}
              >
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
              ref={changeButtonRef}
              type="button"
              className="btn home-change"
              onClick={() => {
                pendingFocusRef.current = "search";
                setEditing(true);
                setQuery("");
              }}
            >
              武将を変更
            </button>
          </div>

          {outcomes.length === 0 ? (
            <p className="home-empty muted">
              この期の戦闘履歴に「{name}
              」の戦績が見つかりません。サイドバーで期を切り替えるか、別の武将を選んでください。
            </p>
          ) : (
            <div className="home-hero-body">
              <div className="home-kpi">
                <div className="home-kpi-label">勝率</div>
                <div className="home-kpi-val">
                  {formatWinRate(overall.winRate, overall.decided)}
                </div>
                <div className="home-kpi-meta muted">
                  {overall.wins.toLocaleString("ja-JP")}勝{" "}
                  {overall.losses.toLocaleString("ja-JP")}敗・総戦闘数{" "}
                  {overall.battles.toLocaleString("ja-JP")}
                </div>
                <WinRateBar summary={overall} />
              </div>
              <div className="home-splits">
                <SideWinRate
                  title="⚔️ 出兵勝率"
                  summary={attack}
                  headingLevel="h3"
                  emptyText="この期の戦闘はありません。"
                  className="home-split"
                />
                <SideWinRate
                  title="🏯 守備勝率"
                  summary={defense}
                  headingLevel="h3"
                  emptyText="この期の戦闘はありません。"
                  className="home-split"
                />
              </div>
            </div>
          )}
        </div>

        {outcomes.length > 0 && (
          <UnitUsageCard outcomes={outcomes} onSelectUnit={onSelectUnit} />
        )}

        {(hasStratagemStats || hasPolitics) && (
          <div className="home-grid">
            {hasStratagemStats && (
              <StratagemUnlockCard
                intelligence={dbInfo!.intelligence!}
                strategy={dbInfo!.strategy!}
              />
            )}
            {hasPolitics && (
              <ConscriptionSecurityCard
                key={name}
                politics={dbInfo!.politics!}
                maxTroops={dbInfo?.maxTroops}
              />
            )}
          </div>
        )}

        {isAdmin && onUpdateStats && (
          <HomeStatsEditor
            key={name}
            name={name}
            warlord={dbInfo}
            onSave={onUpdateStats}
            defaultOpen={!hasStratagemStats && !hasPolitics}
          />
        )}
      </div>
    </section>
  );
}
