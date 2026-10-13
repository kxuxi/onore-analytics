"use client";

import type { ReactNode } from "react";
import type { CityScoutReport } from "@/lib/cityScout";
import { useModalA11y } from "@/lib/useModalA11y";

interface CityScoutDetailDialogProps {
  cityName: string;
  report: CityScoutReport | null;
  loading?: boolean;
  error?: string;
  onClose: () => void;
}

function number(value: number | null, unit = ""): string {
  return value === null ? "未記載" : `${value.toLocaleString("ja-JP", { maximumFractionDigits: 20 })}${unit}`;
}

function capacity(value: CityScoutReport["agriculture"]): string {
  return value === null ? "未記載" : `${number(value.current)} / ${number(value.max)}`;
}

function personnel(value: CityScoutReport["defenders"]): string {
  if (value === null) return "未記載";
  if (!value.names && value.count === null) return "記載なし";
  return [value.names, value.count === null ? "" : `（${number(value.count, "人")}）`].filter(Boolean).join(" ");
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="city-scout-detail-item"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function CityScoutDetailDialog({ cityName, report, loading = false, error = "", onClose }: CityScoutDetailDialogProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(true, onClose, { inertOutside: true });

  return (
    <div className="modal-backdrop city-scout-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal city-scout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-scout-dialog-title"
        aria-busy={loading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="city-scout-heading">
          <h2 id="city-scout-dialog-title">{cityName}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="都市情報を閉じる">閉じる</button>
        </div>
        {loading ? (
          <p role="status">偵察情報を読み込んでいます…</p>
        ) : error ? (
          <p className="city-map-error" role="alert">{error}</p>
        ) : report === null ? (
          <p>この都市の偵察情報はまだ保存されていません。「偵察結果を貼り付ける」から登録してください。</p>
        ) : (
          <>
            <p className="city-scout-observed">{report.year}年{report.month}月の偵察情報</p>
            <dl className="city-scout-details">
              <Detail label="所属">{report.faction || "未記載"}</Detail>
              <Detail label="都市規模">{report.cityType || "未記載"}</Detail>
              <Detail label="人口">{number(report.population, "人")}</Detail>
              <Detail label="治安">{number(report.publicOrder)}</Detail>
              <Detail label="農業">{capacity(report.agriculture)}</Detail>
              <Detail label="商業">{capacity(report.commerce)}</Detail>
              <Detail label="技術">{capacity(report.technology)}</Detail>
              <Detail label="城壁">{capacity(report.wall)}</Detail>
              <Detail label="守備兵数">{capacity(report.garrison)}</Detail>
              <Detail label="相場">{number(report.marketRate)}</Detail>
              <Detail label="都市資金">{number(report.funds)}</Detail>
              <Detail label="都市兵糧">{number(report.rice)}</Detail>
            </dl>
            <dl className="city-scout-details city-scout-details-wide">
              <Detail label="施設">
                {report.facilities === null ? "未記載" : report.facilities.length === 0 ? "記載なし" : (
                  <ul className="city-scout-facilities">{report.facilities.map((facility, index) => <li key={`${facility}-${index}`}>{facility}</li>)}</ul>
                )}
              </Detail>
              <Detail label="守備">{personnel(report.defenders)}</Detail>
              <Detail label="警備">{personnel(report.patrol)}</Detail>
              <Detail label="海上守備">{personnel(report.navalDefenders)}</Detail>
            </dl>
            <details className="city-scout-original">
              <summary tabIndex={0}>貼り付けた偵察結果</summary>
              <pre>{report.source}</pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
