"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CityMap } from "@/lib/cityMap";
import { CityMapAccountMismatchError } from "@/lib/cityMapApi";
import { fetchCityScouts, saveCityScouts } from "@/lib/cityScoutApi";
import { normalizeCityScoutName, parseCityScoutReports, type CityScoutReport } from "@/lib/cityScout";

export interface CityScoutState {
  reports: CityScoutReport[];
  loading: boolean;
  error: string;
}

interface CityScoutPanelProps {
  accountId: number;
  map: CityMap;
  onStateChange: (state: CityScoutState) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CityScoutPreview({ reports, map }: { reports: CityScoutReport[]; map: CityMap }) {
  const cityNames = new Set(map.rows.flatMap((row) => row.cells.map((cell) =>
    normalizeCityScoutName(cell.split("\n")[0] ?? "")
  )));

  return (
    <ul className="city-scout-preview" aria-label="読み取った偵察結果">
      {reports.map((report, index) => (
        <li key={`${report.cityName}-${report.year}-${report.month}-${index}`}>
          <strong>{report.cityName}</strong>
          <span>{report.year}年{report.month}月</span>
          {!cityNames.has(normalizeCityScoutName(report.cityName)) && (
            <span className="city-scout-map-warning">現在の地図にない都市です（保存できます）</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CityScoutPanel({ accountId, map, onStateChange, onDirtyChange }: CityScoutPanelProps) {
  const [reports, setReports] = useState<CityScoutReport[]>([]);
  const [loadedAccount, setLoadedAccount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [accountMismatch, setAccountMismatch] = useState(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    setLoadedAccount(null);
    setReports([]);
    setLoadError("");
    setSource("");
    setExpanded(false);
    setSaving(false);
    setSaveError("");
    setSavedMessage("");
    setAccountMismatch(false);
    inFlightRef.current = false;

    void fetchCityScouts(accountId)
      .then((result) => {
        if (generation !== generationRef.current) return;
        setReports(result.reports);
      })
      .catch((error: unknown) => {
        if (generation !== generationRef.current) return;
        setLoadError(error instanceof Error ? error.message : "都市の偵察情報を読み込めませんでした。");
        setAccountMismatch(error instanceof CityMapAccountMismatchError);
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        setLoadedAccount(accountId);
        setLoading(false);
      });

    return () => {
      generationRef.current = generation + 1;
    };
  }, [accountId, loadAttempt]);

  const parsed = useMemo(() => {
    if (!source.trim()) return { reports: [], error: "" };
    try {
      return { reports: parseCityScoutReports(source), error: "" };
    } catch (error) {
      return {
        reports: [],
        error: error instanceof Error ? error.message : "偵察結果の形式を確認してください。",
      };
    }
  }, [source]);

  const waitingForAccount = loadedAccount !== accountId;
  const state = useMemo<CityScoutState>(() => ({
    reports: waitingForAccount ? [] : reports,
    loading: loading || waitingForAccount,
    error: accountMismatch
      ? "アカウントが切り替わりました。ページを再読み込みしてください。"
      : loadError,
  }), [accountMismatch, loadError, loading, reports, waitingForAccount]);
  const isDirty = Boolean(source.trim()) || saving;

  useEffect(() => onStateChange(state), [onStateChange, state]);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  async function handleSave() {
    if (inFlightRef.current || loading || waitingForAccount || loadError || accountMismatch || !parsed.reports.length) return;
    const generation = generationRef.current;
    const submittedSource = source;
    inFlightRef.current = true;
    setSaving(true);
    setSaveError("");
    setSavedMessage("");
    try {
      const result = await saveCityScouts(accountId, submittedSource);
      if (generation !== generationRef.current) return;
      setReports(result.reports);
      setSource((current) => current === submittedSource ? "" : current);
      const saved = result.savedCityNames.length;
      const skipped = result.skippedCityNames.length;
      setSavedMessage([
        saved ? `${saved}都市の情報を保存しました。` : "保存済みの情報を維持しました。",
        skipped ? `${skipped}都市は保存済みの情報より古いため、上書きしませんでした。` : "",
      ].filter(Boolean).join(" "));
    } catch (error) {
      if (generation !== generationRef.current) return;
      setSaveError(error instanceof Error ? error.message : "都市の偵察情報を保存できませんでした。");
      setAccountMismatch(error instanceof CityMapAccountMismatchError);
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  return (
    <section className="city-scout-panel" aria-labelledby="city-scout-title" aria-busy={state.loading}>
      <div className="city-scout-heading">
        <h2 id="city-scout-title">都市の偵察情報</h2>
        {!state.loading && !loadError && (
          <button
            type="button"
            className="btn"
            aria-expanded={expanded}
            aria-controls="city-scout-editor"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "貼り付け欄を閉じる" : "偵察結果を貼り付ける"}
          </button>
        )}
      </div>
      {state.loading ? (
        <p className="city-map-help" role="status">都市の偵察情報を読み込んでいます…</p>
      ) : loadError ? (
        <div className="city-map-save-error">
          <p className="city-map-error" role="alert">{loadError}</p>
          <button type="button" className="btn" onClick={() =>
            accountMismatch ? window.location.reload() : setLoadAttempt((attempt) => attempt + 1)
          }>
            {accountMismatch ? "ページを再読み込み" : "偵察情報を再読み込み"}
          </button>
        </div>
      ) : (
        <>
          <p className="city-map-help">
            {reports.length
              ? `${reports.length}都市の偵察情報を保存済みです。`
              : "ゲームの偵察結果を貼り付けると、地図の都市から確認できます。"}
          </p>
          <div id="city-scout-editor" className="city-scout-editor" hidden={!expanded}>
            <label htmlFor="city-scout-source">ゲーム内年月から始まる偵察結果</label>
            <textarea
              id="city-scout-source"
              className="city-scout-source"
              rows={10}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setSavedMessage("");
                if (!accountMismatch) setSaveError("");
              }}
              readOnly={accountMismatch}
              placeholder={"1634年 9月\nブルゴス [己鯖夕食突撃部] : 大都市\n人口 : 618700人 治安 : 99\n…"}
              aria-invalid={Boolean(parsed.error) || undefined}
              aria-describedby={`city-scout-help${parsed.error ? " city-scout-validation-error" : ""}`}
              spellCheck={false}
            />
            <p id="city-scout-help" className="city-map-help">
              都市名を自動で読み取り、アカウントに保存します。複数都市をまとめて貼り付けられます。古い年月の情報では上書きしません。
            </p>
            {parsed.error && <p id="city-scout-validation-error" className="city-map-error" role="alert">{parsed.error}</p>}
            {parsed.reports.length > 0 && <CityScoutPreview reports={parsed.reports} map={map} />}
            <div className="city-scout-actions">
              <button
                type="button"
                className="btn"
                disabled={saving || accountMismatch || !parsed.reports.length}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中…" : saveError && !accountMismatch ? "都市情報の保存を再試行" : "都市情報を保存"}
              </button>
              {Boolean(source.trim()) && <span className="city-map-save-state" data-dirty role="status">未保存の偵察結果</span>}
            </div>
          </div>
          {saveError && (
            <div className="city-map-save-error">
              <p className="city-map-error" role="alert">{saveError}</p>
              {accountMismatch && <p className="city-map-help">未保存のテキストをコピーしてから、ページを再読み込みしてください。</p>}
              {accountMismatch && <button type="button" className="btn" onClick={() => window.location.reload()}>ページを再読み込み</button>}
              {!accountMismatch && !expanded && <button type="button" className="btn" onClick={() => setExpanded(true)}>貼り付け欄を開く</button>}
            </div>
          )}
          {savedMessage && <p className="city-scout-success" role="status">{savedMessage}</p>}
        </>
      )}
    </section>
  );
}
