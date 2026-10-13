"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CityMapMerchantControls } from "./CityMapMerchantControls";
import { CityMapResetDialog } from "./CityMapResetDialog";
import { CityScoutPanel, type CityScoutState } from "./CityScoutPanel";
import { CityScoutDetailDialog } from "./CityScoutDetailDialog";
import { normalizeCityScoutName, type CityScoutReport } from "@/lib/cityScout";
import { isMerchantNote, type MerchantPrediction } from "@/lib/cityMapMerchants";
import {
  CITY_MAP_EXAMPLE,
  MAX_CITY_MAP_SIZE,
  MAX_CITY_MAP_SOURCE_LENGTH,
  parseCityMap,
  type CityMap,
} from "@/lib/cityMap";
import {
  CityMapAccountMismatchError,
  fetchCityMap,
  saveCityMap,
} from "@/lib/cityMapApi";
import { resetCityMapData } from "@/lib/cityMapResetApi";

interface CityMapTabProps {
  accountId: number;
  onDirtyChange?: (dirty: boolean) => void;
}

const EMPTY_MAP: CityMap = { columns: [], rows: [] };
const INITIAL_SCOUT_STATE: CityScoutState = { reports: [], loading: true, error: "" };

/** HTMLを解釈せず、座標とセル内の改行をそのまま表示する。 */
export function CityMapGrid({ map, merchantPrediction, onCitySelect, scoutsByCity }: {
  map: CityMap;
  merchantPrediction?: MerchantPrediction | null;
  onCitySelect?: (cityName: string) => void;
  scoutsByCity?: ReadonlyMap<string, CityScoutReport>;
}) {
  return (
    <div
      className="city-map-scroll"
      role="region"
      aria-label="都市地図。横にスクロールできます"
      tabIndex={0}
    >
      <table
        className="city-map-grid"
        style={{ "--city-map-column-count": map.columns.length } as CSSProperties}
      >
        <caption className="sr-only">
          都市地図（{map.rows.length}行 × {map.columns.length}列）
        </caption>
        <colgroup>
          <col className="city-map-coordinate-column" />
          {map.columns.map((column, index) => (
            <col key={`${index}-${column}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">行 / 列</span></th>
            {map.columns.map((column, index) => (
              <th key={`${index}-${column}`} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.label}`}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, columnIndex) => {
                const [city, ...notes] = cell.split("\n");
                const merchants = merchantPrediction?.positions.filter(
                  (position) => position.rowIndex === rowIndex && position.columnIndex === columnIndex
                ) ?? [];
                const visibleNotes = merchantPrediction !== undefined
                  ? notes.filter((note) => !isMerchantNote(note))
                  : notes;
                const clickable = Boolean(city && onCitySelect);
                const Cell = clickable ? "button" : "div";
                const scout = scoutsByCity?.get(normalizeCityScoutName(city));
                // 工業都市→工業などと短く表示する。大都市・都市はそのまま残す。
                const cityType = scout?.cityType.replace(/^(.{2,})都市$/, "$1") ?? "";
                const facilities = scout?.facilities?.map((facility) => facility.trim()).filter(Boolean) ?? [];
                const facilityInitials = facilities.map((facility) => Array.from(facility)[0]).join("/");
                const className = [
                  "city-map-cell",
                  cell && "city-map-cell-populated",
                  scout && "city-map-cell-scouted",
                  merchants.length > 0 && "city-map-cell-merchant",
                  clickable && "city-map-city-button",
                ].filter(Boolean).join(" ");
                return (
                  <td key={columnIndex}>
                    <Cell
                      className={className}
                      // 枠線の色を行商人ごとに分け、2人が同じ都市にいる場合も区別する。
                      data-merchants={merchants.length ? merchants.map((position) => position.merchant).join(" ") : undefined}
                      type={clickable ? "button" : undefined}
                      onClick={clickable ? () => onCitySelect?.(city) : undefined}
                      aria-label={clickable ? `${city}の都市情報${cityType ? `（${cityType}）` : ""}${facilities.length ? `、施設: ${facilities.join("、")}` : ""}` : undefined}
                      aria-haspopup={clickable ? "dialog" : undefined}
                    >
                      {cell ? (
                        <>
                          <span className="city-map-city">
                            {city}{cityType && <span className="city-map-city-type">（{cityType}）</span>}
                          </span>
                          {facilityInitials && (
                            <span className="city-map-facilities" title={facilities.join(" / ")}>{facilityInitials}</span>
                          )}
                          {visibleNotes.map((note, noteIndex) => (
                            <span className="city-map-note" key={noteIndex}>{note}</span>
                          ))}
                          {merchants.length > 0 && (
                            <span className="city-map-merchant-badges">
                              {merchants.map((position) => (
                                <span
                                  key={position.merchant}
                                  className={`city-map-merchant-badge city-map-merchant-badge--${position.merchant}`}
                                >
                                  行商人{position.merchant}
                                </span>
                              ))}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="city-map-empty-marker" aria-hidden="true">·</span>
                          <span className="sr-only">空きマス</span>
                        </>
                      )}
                    </Cell>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CityMapTab({ accountId, onDirtyChange }: CityMapTabProps) {
  const [source, setSource] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [accountMismatch, setAccountMismatch] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const [merchantPrediction, setMerchantPrediction] = useState<MerchantPrediction | null>(null);
  const [merchantDirty, setMerchantDirty] = useState(false);
  const [scoutState, setScoutState] = useState<CityScoutState>(INITIAL_SCOUT_STATE);
  const [scoutDirty, setScoutDirty] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetAccountMismatch, setResetAccountMismatch] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [resetRevision, setResetRevision] = useState(0);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const resetInFlightRef = useRef(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setAccountMismatch(false);
    setSource("");
    setSavedSource("");
    setSaving(false);
    setScoutState(INITIAL_SCOUT_STATE);
    setSelectedCity(null);
    setMerchantPrediction(null);
    setMerchantDirty(false);
    setScoutDirty(false);
    setResetOpen(false);
    setResetting(false);
    setResetError("");
    setResetAccountMismatch(false);
    setResetComplete(false);
    inFlightRef.current = false;
    resetInFlightRef.current = false;

    void fetchCityMap(accountId)
      .then((stored) => {
        if (generation !== generationRef.current) return;
        setSource(stored.source);
        setSavedSource(stored.source);
        setEditorOpen(!stored.source.trim());
      })
      .catch((error: unknown) => {
        if (generation !== generationRef.current) return;
        setLoadError(error instanceof Error ? error.message : "都市地図を読み込めませんでした。");
        setAccountMismatch(error instanceof CityMapAccountMismatchError);
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
      });

    return () => {
      generationRef.current += 1;
    };
  }, [accountId, loadAttempt]);

  const parsed = useMemo(() => {
    if (!source.trim()) return { map: null, error: "" };
    try {
      return { map: parseCityMap(source), error: "" };
    } catch (error) {
      return {
        map: null,
        error: error instanceof Error ? error.message : "表の形式を確認してください。",
      };
    }
  }, [source]);

  const hasUnsavedSource = source !== savedSource;
  // 入力を元に戻しても、通信中の保存が完了するまでは離脱を保護する。
  const isDirty = hasUnsavedSource || saving || merchantDirty || scoutDirty || resetting;
  const scoutsByCity = useMemo(
    () => new Map(scoutState.reports.map((report) => [normalizeCityScoutName(report.cityName), report])),
    [scoutState.reports]
  );
  const validationError = parsed.error || (
    hasUnsavedSource && !source.trim()
      ? "地図が空です。表を入力してください。保存済みの地図は削除されません。"
      : ""
  );

  useEffect(() => {
    if (resetOpen || loading || loadError || saving || saveError || accountMismatch || !hasUnsavedSource || !parsed.map) return;

    const generation = generationRef.current;
    const timer = window.setTimeout(() => {
      if (generation !== generationRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      setSaving(true);

      void saveCityMap(accountId, source)
        .then((stored) => {
          if (generation !== generationRef.current) return;
          // 保存中の追加入力は上書きせず、次の保存対象として残す。
          setSavedSource(stored.source);
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) return;
          setSaveError(error instanceof Error ? error.message : "都市地図を保存できませんでした。");
          setAccountMismatch(error instanceof CityMapAccountMismatchError);
        })
        .finally(() => {
          if (generation !== generationRef.current) return;
          inFlightRef.current = false;
          setSaving(false);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [accountId, accountMismatch, hasUnsavedSource, loadError, loading, parsed.map, resetOpen, saveError, saving, source]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

  const updateSource = (value: string) => {
    setSource(value);
    setResetComplete(false);
    if (!accountMismatch) setSaveError("");
  };
  const resetData = async () => {
    if (resetInFlightRef.current || resetAccountMismatch) return;
    const generation = generationRef.current;
    resetInFlightRef.current = true;
    setResetting(true);
    setResetError("");
    try {
      // 先に送信した地図・行商設定・偵察情報の保存が完了してからリセットする。
      await resetCityMapData(accountId);
      if (generation !== generationRef.current) return;
      // リセット前のレスポンスが表示に反映されないようにする。
      generationRef.current += 1;
      inFlightRef.current = false;
      setSource("");
      setSavedSource("");
      setSaving(false);
      setSaveError("");
      setAccountMismatch(false);
      setEditorOpen(true);
      setMerchantPrediction(null);
      setMerchantDirty(false);
      setScoutState(INITIAL_SCOUT_STATE);
      setScoutDirty(false);
      setSelectedCity(null);
      setResetRevision((revision) => revision + 1);
      setResetOpen(false);
      setResetComplete(true);
      resetInFlightRef.current = false;
      setResetting(false);
    } catch (error: unknown) {
      if (generation !== generationRef.current) return;
      setResetError(error instanceof Error ? error.message : "都市地図のデータをリセットできませんでした。");
      setResetAccountMismatch(error instanceof CityMapAccountMismatchError);
      resetInFlightRef.current = false;
      setResetting(false);
    }
  };
  const cityCount = parsed.map?.rows.reduce(
    (count, row) => count + row.cells.filter((cell) => cell.trim()).length,
    0
  ) ?? 0;
  const status = saving
    ? "自動保存中…"
    : saveError
      ? "保存に失敗しました"
      : hasUnsavedSource
        ? parsed.map ? "自動保存待ち" : "未保存"
        : savedSource ? "保存済み" : "未設定";

  const openResetDialog = () => {
    setResetError("");
    setResetAccountMismatch(false);
    setResetComplete(false);
    setResetOpen(true);
  };
  const ready = !loading && !loadError;
  // 行商設定は地図がある場合だけ保存できるため、地図か偵察情報があれば消す対象がある。
  const hasStoredData = Boolean(savedSource.trim()) || scoutState.reports.length > 0;
  const merchantsActive = merchantPrediction?.status === "active";

  return (
    <section className="panel city-map-page" aria-busy={loading}>
      <PageHeader
        title="都市地図"
        description={`ゲームの表を貼り付けると地図に変換します（最大${MAX_CITY_MAP_SIZE} × ${MAX_CITY_MAP_SIZE}マス）。ログイン中のアカウントに自動保存されます。`}
        meta={ready && (
          <span className="city-map-save-state" data-dirty={hasUnsavedSource || saving || undefined} role="status" aria-live="polite">
            {status}
          </span>
        )}
        actions={
          <button
            type="button"
            className="btn"
            disabled={!ready}
            aria-expanded={editorOpen}
            aria-controls="city-map-editor"
            onClick={() => setEditorOpen((open) => !open)}
          >
            {editorOpen ? "入力欄を閉じる" : "地図のテキストを編集"}
          </button>
        }
      />

      {loading ? (
        <p className="city-map-state" role="status">都市地図を読み込んでいます…</p>
      ) : loadError ? (
        <div className="city-map-load-error">
          <p className="city-map-error" role="alert">{loadError}</p>
          <button
            type="button"
            className="btn"
            onClick={() => accountMismatch ? window.location.reload() : setLoadAttempt((attempt) => attempt + 1)}
          >
            {accountMismatch ? "ページを再読み込み" : "再読み込み"}
          </button>
        </div>
      ) : (
        <>
          {resetComplete && <p className="city-map-notice" role="status">都市地図のデータをリセットしました。</p>}

          <div className="city-map-editor" id="city-map-editor" hidden={!editorOpen}>
            <div className="city-map-editor-heading">
              <label htmlFor="city-map-source">地図のテキスト</label>
              {!source.trim() && (
                <button type="button" className="btn" onClick={() => updateSource(CITY_MAP_EXAMPLE)}>
                  入力例を使う
                </button>
              )}
            </div>
            <p className="city-map-help" id="city-map-input-help">
              先頭行に a・b などの列名、左端に 1・2 などの行番号があるゲームの表を、そのままコピーして貼り付けられます。タブ・改行区切りの表とMarkdown表に対応しています。
              セル内の &lt;br&gt; は改行になり、★行商などの注記も表示します。
            </p>
            <textarea
              id="city-map-source"
              className="city-map-source"
              value={source}
              onChange={(event) => updateSource(event.target.value)}
              aria-invalid={Boolean(validationError) || undefined}
              aria-describedby={`city-map-input-help${validationError ? " city-map-validation-error" : ""}`}
              spellCheck={false}
              placeholder={"|   | a | b |\n| - | - | - |\n| 1 | リスボン<br> | マラガ<br>★行商 |\n| 2 |   | セビリア<br> |"}
            />
            {validationError && (
              <p id="city-map-validation-error" className="city-map-error" role="alert">{validationError}</p>
            )}
            <div className="city-map-editor-footer">
              {/* 地図・偵察情報・行商設定をまとめて消すため、日常の操作から離して置く。 */}
              {hasStoredData && <button
                type="button"
                className="btn city-map-reset-trigger"
                disabled={accountMismatch || resetting}
                aria-haspopup="dialog"
                onClick={openResetDialog}
              >
                データリセット
              </button>}
              <p className="city-map-help city-map-character-count">
                {source.length.toLocaleString("ja-JP")} / {MAX_CITY_MAP_SOURCE_LENGTH.toLocaleString("ja-JP")}文字
              </p>
            </div>
          </div>

          {validationError && !editorOpen && (
            <p className="city-map-error" role="alert">{validationError}</p>
          )}
          {saveError && (
            <div className="city-map-save-error">
              <div>
                <p className="city-map-error" role="alert">{saveError}</p>
                {accountMismatch && (
                  <p className="city-map-help">未保存のテキストをコピーしてから、ページを再読み込みしてください。</p>
                )}
              </div>
              <button
                type="button"
                className="btn"
                disabled={!accountMismatch && !parsed.map}
                onClick={() => accountMismatch ? window.location.reload() : setSaveError("")}
              >
                {accountMismatch ? "ページを再読み込み" : "保存を再試行"}
              </button>
            </div>
          )}

          {!parsed.map && !editorOpen && (
            <div className="city-map-empty">
              <p className="empty-title">{validationError ? "表の内容を確認してください" : "まだ都市地図がありません"}</p>
              <p className="empty-hint">
                {validationError
                  ? "入力を修正すると、ここに地図が表示されます。"
                  : "ゲームの表を貼り付けると、都市の配置をここで確認できます。"}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setEditorOpen(true)}>
                {validationError ? "入力欄を開く" : "地図のテキストを入力"}
              </button>
            </div>
          )}

          <div className="city-map-controls">
            {parsed.map && (
              <CityMapMerchantControls
                key={`merchant-${accountId}-${resetRevision}`}
                map={parsed.map}
                accountId={accountId}
                suspended={resetOpen}
                onPredictionChange={setMerchantPrediction}
                onDirtyChange={setMerchantDirty}
              />
            )}
            <CityScoutPanel
              key={`scout-${accountId}-${resetRevision}`}
              accountId={accountId}
              map={parsed.map ?? EMPTY_MAP}
              onStateChange={setScoutState}
              onDirtyChange={setScoutDirty}
            />
          </div>

          {parsed.map && (
            <div className="city-map-view">
              <div className="city-map-toolbar">
                <p className="city-map-dimensions">
                  {parsed.map.rows.length}行 × {parsed.map.columns.length}列・{cityCount}都市
                </p>
                <ul className="city-map-legend" aria-label="地図の凡例">
                  {merchantsActive && (
                    <>
                      <li><span className="city-map-legend-swatch" data-merchants="1" aria-hidden="true" />行商人1</li>
                      <li><span className="city-map-legend-swatch" data-merchants="2" aria-hidden="true" />行商人2</li>
                    </>
                  )}
                  {scoutsByCity.size > 0 && (
                    <li><span className="city-map-legend-swatch" data-scouted aria-hidden="true" />偵察済み</li>
                  )}
                  <li className="city-map-legend-hint">都市をクリックで偵察情報を表示</li>
                </ul>
              </div>
              <CityMapGrid
                map={parsed.map}
                merchantPrediction={merchantPrediction}
                onCitySelect={setSelectedCity}
                scoutsByCity={scoutsByCity}
              />
            </div>
          )}
          {parsed.map && selectedCity && (
            <CityScoutDetailDialog
              cityName={selectedCity}
              report={scoutsByCity.get(normalizeCityScoutName(selectedCity)) ?? null}
              loading={scoutState.loading}
              error={scoutState.error}
              onClose={() => setSelectedCity(null)}
            />
          )}
        </>
      )}
      {resetOpen && (
        <CityMapResetDialog
          busy={resetting}
          error={resetError}
          accountMismatch={resetAccountMismatch}
          onClose={() => {
            if (!resetInFlightRef.current) setResetOpen(false);
          }}
          onConfirm={() => { void resetData(); }}
        />
      )}
    </section>
  );
}
