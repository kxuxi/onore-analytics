"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { UnitType } from "@/lib/types";
import { deleteUnitType, upsertUnitType } from "@/lib/api";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  composeCost,
  composeReqStats,
  composeYears,
  parseCost,
  parseReqStats,
  parseYears,
  BASE_STAT_OPTIONS,
  COST_CURRENCIES,
} from "@/lib/unitTypeForm";

const REQUIRED_NAME_ERROR = "兵種名は必須です";
const DELETE_ERROR = "削除に失敗しました";

interface Props {
  /** 編集対象（新規追加時は空の UnitType） */
  initial: UnitType;
  /** 新規追加かどうか（false なら編集＝削除ボタンを表示） */
  isNew: boolean;
  /** 必要能力値セレクタの候補（基本候補に加えてデータ中の値） */
  statOptions?: string[];
  /** 閉じる（キャンセル） */
  onClose: () => void;
  /** 保存成功時（親側で再読み込みする） */
  onSaved: (saved: UnitType) => void;
  /** 削除成功時 */
  onDeleted?: (name: string) => void;
}

export function UnitEditModal({
  initial,
  isNew,
  statOptions,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [editing, setEditing] = useState<UnitType>({ ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const deleteConfirmationOpenRef = useRef(false);

  // 削除確認は編集モーダルの上に重なって開くため、最前面のモーダルだけ
  // フォーカストラップを有効にする（背面の編集モーダルは無効化）。
  const formModalRef = useModalA11y<HTMLDivElement>(!confirmDelete, onClose);
  const deleteModalRef = useModalA11y<HTMLDivElement>(
    !!confirmDelete,
    closeDeleteConfirmation
  );

  const update = <K extends keyof UnitType>(key: K, value: UnitType[K]) => {
    setEditing((cur) => ({ ...cur, [key]: value }));
  };

  function closeDeleteConfirmation() {
    deleteConfirmationOpenRef.current = false;
    if (deleteError) setError(deleteError);
    setConfirmDelete(null);
  }

  const openDeleteConfirmation = () => {
    setDeleteError(null);
    deleteConfirmationOpenRef.current = true;
    setConfirmDelete(editing.name);
  };

  const handleSave = async () => {
    if (busy) return;
    if (!editing.name.trim()) {
      setError(REQUIRED_NAME_ERROR);
      nameInputRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const saved = await upsertUnitType({
        ...editing,
        name: editing.name.trim(),
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSave();
  };

  const handleDelete = async (name: string) => {
    if (busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteUnitType(name);
      deleteConfirmationOpenRef.current = false;
      setConfirmDelete(null);
      onDeleted?.(name);
    } catch {
      // 通信中に確認Dialogを閉じても、現在見えているDialogで失敗を確認できる。
      if (deleteConfirmationOpenRef.current) {
        setDeleteError(DELETE_ERROR);
      } else {
        setError(DELETE_ERROR);
      }
      setBusy(false);
    }
  };

  const reqStats = parseReqStats(editing.reqStats);
  const cost = parseCost(editing.cost);
  const years = parseYears(editing.years);

  // セレクタ候補（現在値が候補に無ければ補う）
  const stats = Array.from(
    new Set([...BASE_STAT_OPTIONS, ...(statOptions ?? []), reqStats.stat].filter(Boolean))
  );
  const currencies = Array.from(
    new Set([...COST_CURRENCIES, cost.currency].filter(Boolean))
  );
  const nameIsInvalid = error === REQUIRED_NAME_ERROR;

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={onClose}
        role="presentation"
        aria-hidden={confirmDelete ? true : undefined}
      >
        <div
          ref={formModalRef}
          className="modal unit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unit-form-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="unit-form-title">
            {isNew ? "兵種を追加" : `兵種を編集: ${initial.name}`}
          </h3>

          <form
            className="unit-edit-form"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={busy}
          >
            <div className="unit-form">
              <fieldset className="unit-form-section">
                <legend>基本情報</legend>
                <div className="unit-form-section-fields">
                  <label className="filter">
                    <span>兵種名（必須）</span>
                    <input
                      ref={nameInputRef}
                      id="unit-name"
                      className="text-input"
                      value={editing.name}
                      onChange={(event) => {
                        update("name", event.target.value);
                        if (
                          error === REQUIRED_NAME_ERROR &&
                          event.target.value.trim()
                        ) {
                          setError(null);
                        }
                      }}
                      placeholder="例: カノン砲"
                      required
                      aria-invalid={nameIsInvalid}
                      aria-describedby={
                        nameIsInvalid
                          ? "unit-name-requirement unit-name-error"
                          : "unit-name-requirement"
                      }
                    />
                  </label>
                  <span id="unit-name-requirement" className="sr-only">
                    兵種名は必須です
                  </span>
                  <label className="filter">
                    <span>種類</span>
                    <input
                      className="text-input"
                      value={editing.category}
                      onChange={(e) => update("category", e.target.value)}
                      placeholder="例: 弓兵"
                    />
                  </label>
                  <label className="filter">
                    <span>攻撃</span>
                    <input
                      type="number"
                      className="text-input"
                      value={editing.attack}
                      onChange={(e) =>
                        update("attack", Number(e.target.value) || 0)
                      }
                    />
                  </label>
                  <label className="filter">
                    <span>防御</span>
                    <input
                      type="number"
                      className="text-input"
                      value={editing.defense}
                      onChange={(e) =>
                        update("defense", Number(e.target.value) || 0)
                      }
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="unit-form-section">
                <legend>雇用・条件</legend>
                <div className="unit-form-section-fields">
                  <div className="filter">
                    <span id="unit-cost-label">雇用</span>
                    <div
                      className="field-inline"
                      role="group"
                      aria-labelledby="unit-cost-label"
                    >
                      <select
                        className="select inline-select"
                        value={cost.currency}
                        onChange={(e) =>
                          update(
                            "cost",
                            composeCost(e.target.value, cost.amount)
                          )
                        }
                        aria-label="雇用コストの種類（金・米）"
                      >
                        {currencies.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="text-input"
                        value={cost.amount}
                        onChange={(e) =>
                          update(
                            "cost",
                            composeCost(cost.currency, e.target.value)
                          )
                        }
                        aria-label="雇用コストの金額"
                        placeholder="金額"
                      />
                    </div>
                  </div>
                  <div className="filter">
                    <span id="unit-years-label">年数</span>
                    <div
                      className="field-inline"
                      role="group"
                      aria-labelledby="unit-years-label"
                    >
                      <input
                        type="number"
                        className="text-input"
                        value={years}
                        onChange={(e) =>
                          update("years", composeYears(e.target.value))
                        }
                        aria-label="必要年数"
                        placeholder="例: 36"
                      />
                      <span className="field-suffix">年</span>
                    </div>
                  </div>
                  <div className="filter">
                    <span id="unit-required-stats-label">必要能力値</span>
                    <div
                      className="field-inline"
                      role="group"
                      aria-labelledby="unit-required-stats-label"
                    >
                      <select
                        className="select inline-select"
                        value={reqStats.stat}
                        onChange={(e) =>
                          update(
                            "reqStats",
                            composeReqStats(e.target.value, reqStats.num)
                          )
                        }
                        aria-label="必要能力値の種類"
                      >
                        <option value="">なし</option>
                        {stats.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="text-input"
                        value={reqStats.num}
                        onChange={(e) =>
                          update(
                            "reqStats",
                            composeReqStats(reqStats.stat, e.target.value)
                          )
                        }
                        aria-label="必要能力値の数値"
                        placeholder="数値"
                        disabled={!reqStats.stat}
                      />
                    </div>
                  </div>
                  <label className="filter">
                    <span>技術</span>
                    <input
                      className="text-input"
                      value={editing.tech}
                      onChange={(e) => update("tech", e.target.value)}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="unit-form-section">
                <legend>特性・効果</legend>
                <div className="unit-form-section-fields">
                  <label className="filter">
                    <span>得意兵種</span>
                    <input
                      className="text-input"
                      value={editing.goodAgainst}
                      onChange={(e) =>
                        update("goodAgainst", e.target.value)
                      }
                      placeholder="例: 歩兵:壁:"
                    />
                  </label>
                  <label className="filter">
                    <span>施設/国宝</span>
                    <input
                      className="text-input"
                      value={editing.facility}
                      onChange={(e) => update("facility", e.target.value)}
                      placeholder="例: 鉄工所,南蛮町"
                    />
                  </label>
                  <label className="filter">
                    <span>特殊攻撃</span>
                    <textarea
                      className="text-input"
                      rows={3}
                      value={editing.special}
                      onChange={(e) => update("special", e.target.value)}
                    />
                  </label>
                  <label className="filter">
                    <span>ボーナス</span>
                    <input
                      className="text-input"
                      value={editing.bonus}
                      onChange={(e) => update("bonus", e.target.value)}
                      placeholder="例: 兵種アタック+12%"
                    />
                  </label>
                </div>
              </fieldset>
            </div>

            {error && (
              <p
                id={nameIsInvalid ? "unit-name-error" : undefined}
                className="form-error"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
              >
                {busy ? "保存中…" : isNew ? "追加する" : "保存する"}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                キャンセル
              </button>
              {!isNew && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={openDeleteConfirmation}
                  disabled={busy}
                  style={{ marginLeft: "auto" }}
                >
                  削除
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="modal-backdrop"
          onClick={closeDeleteConfirmation}
          role="presentation"
        >
          <div
            ref={deleteModalRef}
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unit-delete-title"
            aria-describedby="unit-delete-description"
            aria-busy={busy}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="unit-delete-title">兵種を削除しますか？</h3>
            <p id="unit-delete-description">
              「{confirmDelete}」を削除します。この操作は元に戻せません。
            </p>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={closeDeleteConfirmation}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={busy}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
