"use client";

import { useModalA11y } from "@/lib/useModalA11y";

interface CityMapResetDialogProps {
  busy: boolean;
  error: string;
  accountMismatch?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CityMapResetDialog({ busy, error, accountMismatch = false, onClose, onConfirm }: CityMapResetDialogProps) {
  const close = () => {
    if (!busy) onClose();
  };
  const dialogRef = useModalA11y<HTMLDivElement>(true, close, { inertOutside: true });

  return (
    <div className="modal-backdrop city-map-reset-backdrop" role="presentation" onClick={close}>
      <div
        ref={dialogRef}
        className="modal city-map-reset-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="city-map-reset-title"
        aria-describedby="city-map-reset-description city-map-reset-warning"
        aria-busy={busy}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="city-map-reset-title">都市地図のデータをリセット</h2>
        <p id="city-map-reset-description">ログイン中のアカウントに保存した地図、都市の偵察情報、行商人の年月設定を削除します。未保存の入力も破棄されます。</p>
        <p id="city-map-reset-warning">戦闘履歴や他のアカウントのデータは削除されません。元に戻せません。</p>
        {error && <p className="city-map-error" role="alert">{error}</p>}
        {accountMismatch && <p>アカウントが変更されています。ページを再読み込みしてから操作してください。</p>}
        <div className="city-map-reset-actions">
          <button type="button" className="btn" disabled={busy} onClick={close}>キャンセル</button>
          {accountMismatch ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => window.location.reload()}>ページを再読み込み</button>
          ) : (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { if (!busy) onConfirm(); }}>
              {busy ? "リセット中…" : "リセットする"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
