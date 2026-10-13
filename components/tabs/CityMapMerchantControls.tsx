"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CityMap } from "@/lib/cityMap";
import { CityMapAccountMismatchError } from "@/lib/cityMapApi";
import {
  fetchMerchantSettings,
  saveMerchantSettings,
} from "@/lib/cityMapMerchantApi";
import {
  parseMerchantSettings,
  predictMerchants,
  type MerchantPrediction,
  type MerchantSettings,
} from "@/lib/cityMapMerchants";

interface CityMapMerchantControlsProps {
  map: CityMap;
  accountId: number;
  suspended?: boolean;
  onPredictionChange: (prediction: MerchantPrediction | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

type MerchantInputs = { year: string; month: string };

const DEFAULT_INPUTS: MerchantInputs = { year: "1612", month: "1" };

function settingsToInputs(settings: MerchantSettings | null): MerchantInputs {
  return settings
    ? { year: String(settings.year), month: String(settings.month) }
    : DEFAULT_INPUTS;
}

function inputKey(inputs: MerchantInputs): string {
  return JSON.stringify(inputs);
}

/** 行商人は6か月ごとに移動するため、前後の滞在期間へ半年単位で進める。 */
export function shiftMerchantMonth(settings: MerchantSettings, months: number): MerchantSettings | null {
  const total = settings.year * 12 + settings.month - 1 + months;
  const year = Math.floor(total / 12);
  if (year < 1 || year > 9999) return null;
  return { year, month: (total % 12) + 1 };
}

export function MerchantPredictionSummary({ prediction }: { prediction: MerchantPrediction }) {
  if (prediction.status !== "active") {
    const reason = {
      "before-start": "1612年1月より前は行商人が出現しません。",
      "after-end": "行商人の最後の出現は1719年7月です。1720年1月以降は出現しません。",
      "no-cities": "地図に都市がないため、行商人の出現位置を計算できません。",
      "cinderella": "この年月はシンデレラ時間（00:00〜07:59）にあたるため、行商人は出現しません。",
    }[prediction.status];
    return (
      <p className="city-map-merchant-absence" role="status">
        {reason}
        {prediction.status === "cinderella" && prediction.nextMove &&
          `次の出現は${prediction.nextMove.year}年${prediction.nextMove.month}月です。`}
      </p>
    );
  }

  return (
    <div className="city-map-merchant-result" aria-live="polite">
      <ol className="city-map-merchant-positions" aria-label="行商人の出現位置">
        {prediction.positions.map((position) => (
          <li key={position.merchant}>
            <span className={`city-map-merchant-badge city-map-merchant-badge--${position.merchant}`}>行商人{position.merchant}</span>
            <strong>{position.city}</strong>
            <span className="city-map-merchant-coordinate">（{position.rowLabel}, {position.columnLabel}）</span>
          </li>
        ))}
      </ol>
      <p className="city-map-help">
        {prediction.stayUntil && `${prediction.stayUntil.year}年${prediction.stayUntil.month}月まで滞在。`}
        {prediction.nextMove
          ? `次の移動は${prediction.nextMove.year}年${prediction.nextMove.month}月です。`
          : "最後の滞在期間です。以後は出現しません。"}
      </p>
    </div>
  );
}

export function CityMapMerchantControls({
  map,
  accountId,
  suspended = false,
  onPredictionChange,
  onDirtyChange,
}: CityMapMerchantControlsProps) {
  const [inputs, setInputs] = useState<MerchantInputs>(DEFAULT_INPUTS);
  const [savedKey, setSavedKey] = useState(inputKey(DEFAULT_INPUTS));
  const [hasSavedSettings, setHasSavedSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [accountMismatch, setAccountMismatch] = useState(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setAccountMismatch(false);
    setInputs(DEFAULT_INPUTS);
    setSavedKey(inputKey(DEFAULT_INPUTS));
    setHasSavedSettings(false);
    setSaving(false);
    inFlightRef.current = false;

    void fetchMerchantSettings(accountId)
      .then(({ settings }) => {
        if (generation !== generationRef.current) return;
        const loaded = settingsToInputs(settings === null ? null : parseMerchantSettings(settings));
        setInputs(loaded);
        setSavedKey(inputKey(loaded));
        setHasSavedSettings(settings !== null);
      })
      .catch((error: unknown) => {
        if (generation !== generationRef.current) return;
        setLoadError(error instanceof Error ? error.message : "行商人の設定を読み込めませんでした。");
        setAccountMismatch(error instanceof CityMapAccountMismatchError);
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
      });

    return () => {
      generationRef.current = generation + 1;
    };
  }, [accountId, loadAttempt]);

  const parsed = useMemo(() => {
    try {
      const settings = parseMerchantSettings({
        year: /^\d+$/.test(inputs.year) ? Number(inputs.year) : Number.NaN,
        month: /^\d+$/.test(inputs.month) ? Number(inputs.month) : Number.NaN,
      });
      return { settings, error: "" };
    } catch (error) {
      return {
        settings: null,
        error: error instanceof Error ? error.message : "ゲーム内の年月を確認してください。",
      };
    }
  }, [inputs]);

  const prediction = useMemo(
    () => !loading && !loadError && !accountMismatch && parsed.settings
      ? predictMerchants(map, parsed.settings)
      : null,
    [accountMismatch, loadError, loading, map, parsed.settings]
  );
  const hasUnsavedInputs = inputKey(inputs) !== savedKey;
  const isDirty = hasUnsavedInputs || saving;

  useEffect(() => {
    onPredictionChange(prediction);
  }, [onPredictionChange, prediction]);

  useEffect(() => () => onPredictionChange(null), [onPredictionChange]);

  useEffect(() => {
    if (suspended || loading || loadError || saving || saveError || accountMismatch || !hasUnsavedInputs || !parsed.settings) return;

    const generation = generationRef.current;
    const settings = parsed.settings;
    const submittedKey = inputKey(inputs);
    const timer = window.setTimeout(() => {
      if (generation !== generationRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      setSaving(true);

      void saveMerchantSettings(accountId, settings)
        .then(({ settings: stored }) => {
          if (generation !== generationRef.current) return;
          // 保存中の追加入力を維持し、完了後に続けて保存する。
          setSavedKey(submittedKey);
          setHasSavedSettings(stored !== null);
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) return;
          setSaveError(error instanceof Error ? error.message : "行商人の設定を保存できませんでした。");
          setAccountMismatch(error instanceof CityMapAccountMismatchError);
        })
        .finally(() => {
          if (generation !== generationRef.current) return;
          inFlightRef.current = false;
          setSaving(false);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [accountId, accountMismatch, hasUnsavedInputs, inputs, loadError, loading, parsed.settings, saveError, saving, suspended]);

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

  const updateInput = (name: keyof MerchantInputs, value: string) => {
    setInputs((current) => ({ ...current, [name]: value }));
    if (!accountMismatch) setSaveError("");
  };
  const stepMonths = (months: number) => {
    const next = parsed.settings && shiftMerchantMonth(parsed.settings, months);
    if (!next) return;
    setInputs(settingsToInputs(next));
    if (!accountMismatch) setSaveError("");
  };
  const previous = parsed.settings && shiftMerchantMonth(parsed.settings, -6);
  const next = parsed.settings && shiftMerchantMonth(parsed.settings, 6);
  // 保存済みの通常時は表示せず、変化があるときだけ知らせる。
  const status = saving
    ? "自動保存中…"
    : saveError
      ? "保存に失敗しました"
      : hasUnsavedInputs
        ? parsed.settings ? "自動保存待ち" : "未保存"
        : hasSavedSettings ? "" : "初期値";

  return (
    <section className="city-map-merchants" aria-labelledby="city-map-merchants-title" aria-busy={loading}>
      <div className="city-map-merchant-heading">
        <h2 id="city-map-merchants-title">行商人の出現位置</h2>
        {!loading && !loadError && status && (
          <span className="city-map-save-state" data-dirty={isDirty || undefined} role="status">{status}</span>
        )}
      </div>
      {loading ? (
        <p className="city-map-help" role="status">行商人の設定を読み込んでいます…</p>
      ) : loadError ? (
        <div className="city-map-save-error">
          <p className="city-map-error" role="alert">{loadError}</p>
          <button
            type="button"
            className="btn"
            onClick={() => accountMismatch ? window.location.reload() : setLoadAttempt((attempt) => attempt + 1)}
          >
            {accountMismatch ? "ページを再読み込み" : "設定を再読み込み"}
          </button>
        </div>
      ) : (
        <>
          <div className="city-map-merchant-inputs">
            <button
              type="button"
              className="btn city-map-merchant-step"
              disabled={accountMismatch || !previous}
              aria-label="6か月前の滞在先を表示"
              title={previous ? `${previous.year}年${previous.month}月` : undefined}
              onClick={() => stepMonths(-6)}
            >
              <span aria-hidden="true">‹</span> 6か月前
            </button>
            <label htmlFor="city-map-merchant-year">
              <span>ゲーム内の年</span>
              <input
                id="city-map-merchant-year"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={inputs.year}
                onChange={(event) => updateInput("year", event.target.value)}
                disabled={accountMismatch}
                aria-invalid={Boolean(parsed.error) || undefined}
                aria-describedby={parsed.error ? "city-map-merchant-validation-error" : undefined}
              />
            </label>
            <label htmlFor="city-map-merchant-month">
              <span>月</span>
              <select
                id="city-map-merchant-month"
                value={inputs.month}
                onChange={(event) => updateInput("month", event.target.value)}
                disabled={accountMismatch}
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>{index + 1}月</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn city-map-merchant-step"
              disabled={accountMismatch || !next}
              aria-label="6か月後の滞在先を表示"
              title={next ? `${next.year}年${next.month}月` : undefined}
              onClick={() => stepMonths(6)}
            >
              6か月後 <span aria-hidden="true">›</span>
            </button>
          </div>
          {parsed.error && <p id="city-map-merchant-validation-error" className="city-map-error" role="alert">{parsed.error}</p>}
          {saveError && (
            <div className="city-map-save-error">
              <p className="city-map-error" role="alert">{saveError}</p>
              <button
                type="button"
                className="btn"
                disabled={!accountMismatch && !parsed.settings}
                onClick={() => accountMismatch ? window.location.reload() : setSaveError("")}
              >
                {accountMismatch ? "ページを再読み込み" : "設定の保存を再試行"}
              </button>
            </div>
          )}
          {prediction && <MerchantPredictionSummary prediction={prediction} />}
        </>
      )}
      <details className="city-map-merchant-rules">
        <summary>行商人の移動ルール</summary>
        <p className="city-map-help">
          ゲーム内年月から出現位置とシンデレラ時間（00:00〜07:59）の不在を判定し、設定をアカウントに保存します。
          1612年1月から、都市のあるマスを左から右、上の行から下の行へ進み、最後の都市から先頭へ戻ります。
          行商人1は最初の都市、行商人2は全都市を移動順に並べた半周先から開始します（44都市なら23番目の都市）。
          1都市に6か月（実時間で2時間）滞在し、1月・7月に移動します。
          1613〜1614年と、そこから6年ごとの2年間はシンデレラ時間にあたり、出現も移動もしません。
          最後の出現は1719年7月で、同年12月まで滞在します。
        </p>
      </details>
    </section>
  );
}
