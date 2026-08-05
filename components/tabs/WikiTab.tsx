"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  createWikiPage,
  deleteWikiPage,
  fetchWikiPage,
  fetchWikiPages,
  updateWikiPage,
} from "@/lib/api";
import type {
  WikiPage,
  WikiPageInput,
  WikiPageSummary,
} from "@/lib/types";
import {
  parseWikiPageInput,
  WIKI_CONTENT_MAX_LENGTH,
  WIKI_TITLE_MAX_LENGTH,
} from "@/lib/wiki";
import { PageHeader } from "@/components/layout/PageHeader";
import { SearchIcon, TrashIcon } from "@/components/icons";
import { MarkdownContent } from "@/components/wiki/MarkdownContent";

type EditorMode = "edit" | "preview" | "split";
type Notify = (kind: "success" | "error", message: string) => void;

interface WikiTabProps {
  onNotify?: Notify;
  onDirtyChange?: (dirty: boolean) => void;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日時不明" : DATE_FORMATTER.format(date);
}

function summaryFromPage(page: WikiPage): WikiPageSummary {
  return {
    id: page.id,
    title: page.title,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function sortSummaries(pages: WikiPageSummary[]): WikiPageSummary[] {
  return [...pages].sort((a, b) => {
    const timeDifference =
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return timeDifference || b.id - a.id;
  });
}

/** 管理者だけが閲覧・編集できる複数ページ構成のMarkdown Wiki。 */
export function WikiTab({ onNotify, onDirtyChange }: WikiTabProps) {
  const [pages, setPages] = useState<WikiPageSummary[]>([]);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("split");
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const requestSequence = useRef(0);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const applyPage = useCallback((page: WikiPage | null) => {
    setActivePage(page);
    setTitle(page?.title ?? "");
    setContent(page?.content ?? "");
    setTitleInvalid(false);
    setErrorMessage("");
    setStatusMessage("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sequence = ++requestSequence.current;
    setInitialLoading(true);
    setInitialLoadFailed(false);
    setErrorMessage("");

    async function loadInitialPage() {
      try {
        const summaries = await fetchWikiPages();
        if (cancelled || sequence !== requestSequence.current) return;
        setPages(summaries);

        if (summaries.length > 0) {
          const page = await fetchWikiPage(summaries[0].id);
          if (cancelled || sequence !== requestSequence.current) return;
          applyPage(page);
        } else if (loadAttempt > 0) {
          setFocusRequest((current) => current + 1);
        }
      } catch (error) {
        if (cancelled || sequence !== requestSequence.current) return;
        setInitialLoadFailed(true);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Wikiページを読み込めませんでした"
        );
      } finally {
        if (!cancelled && sequence === requestSequence.current) {
          setInitialLoading(false);
        }
      }
    }

    void loadInitialPage();
    return () => {
      cancelled = true;
    };
  }, [applyPage, loadAttempt]);

  const isDirty = activePage
    ? title !== activePage.title || content !== activePage.content
    : title.length > 0 || content.length > 0;
  const deferredContent = useDeferredValue(content);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange]
  );

  useEffect(() => {
    const narrowLayout = window.matchMedia("(max-width: 780px)");
    const preferEditMode = (matches: boolean) => {
      if (matches) {
        setEditorMode((current) => (current === "split" ? "edit" : current));
      }
    };
    preferEditMode(narrowLayout.matches);
    const handleLayoutChange = (event: MediaQueryListEvent) => {
      preferEditMode(event.matches);
    };
    narrowLayout.addEventListener("change", handleLayoutChange);
    return () => narrowLayout.removeEventListener("change", handleLayoutChange);
  }, []);

  useEffect(() => {
    if (focusRequest === 0 || initialLoading || pageLoading) return;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, initialLoading, pageLoading]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("未保存の変更があります。変更を破棄して移動しますか？");
  }, [isDirty]);

  const openPage = useCallback(
    async (id: number, forceReload = false) => {
      if (initialLoading || pageLoading || saving || deleting) return;
      if (activePage?.id === id && !forceReload) return;
      if (!confirmDiscard()) return;

      const sequence = ++requestSequence.current;
      setPageLoading(true);
      setErrorMessage("");
      setStatusMessage("");
      try {
        const page = await fetchWikiPage(id);
        if (sequence !== requestSequence.current) return;
        applyPage(page);
        setFocusRequest((current) => current + 1);
      } catch (error) {
        if (sequence !== requestSequence.current) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Wikiページを読み込めませんでした"
        );
      } finally {
        if (sequence === requestSequence.current) setPageLoading(false);
      }
    },
    [
      activePage?.id,
      applyPage,
      confirmDiscard,
      deleting,
      initialLoading,
      pageLoading,
      saving,
    ]
  );

  const startNewPage = useCallback(() => {
    if (
      initialLoading ||
      initialLoadFailed ||
      pageLoading ||
      saving ||
      deleting
    ) {
      return;
    }
    if (!confirmDiscard()) return;
    ++requestSequence.current;
    setPageLoading(false);
    applyPage(null);
    setFocusRequest((current) => current + 1);
  }, [
    applyPage,
    confirmDiscard,
    deleting,
    initialLoadFailed,
    initialLoading,
    pageLoading,
    saving,
  ]);

  const handleSave = useCallback(async () => {
    if (
      initialLoading ||
      initialLoadFailed ||
      saving ||
      deleting ||
      pageLoading
    ) {
      return;
    }

    const parsedInput = parseWikiPageInput({ title, content });
    if (!parsedInput.ok) {
      setTitleInvalid(!title.trim());
      setErrorMessage(parsedInput.error);
      setStatusMessage("");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const input: WikiPageInput = parsedInput.value;
      const savedPage = activePage
        ? await updateWikiPage(activePage.id, input, activePage.updatedAt)
        : await createWikiPage(input);
      applyPage(savedPage);
      setPages((current) =>
        sortSummaries([
          summaryFromPage(savedPage),
          ...current.filter((page) => page.id !== savedPage.id),
        ])
      );
      setStatusMessage("保存しました");
      onNotify?.("success", "Wikiページを保存しました");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Wikiページを保存できませんでした";
      setErrorMessage(message);
      onNotify?.("error", message);
    } finally {
      setSaving(false);
    }
  }, [
    activePage,
    applyPage,
    content,
    deleting,
    initialLoadFailed,
    initialLoading,
    onNotify,
    pageLoading,
    saving,
    title,
  ]);

  const handleDelete = useCallback(async () => {
    if (
      !activePage ||
      initialLoading ||
      pageLoading ||
      deleting ||
      saving
    ) {
      return;
    }
    const confirmed = window.confirm(
      `「${activePage.title}」を削除します。未保存の変更も失われ、この操作は取り消せません。よろしいですか？`
    );
    if (!confirmed) return;

    setDeleting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await deleteWikiPage(activePage.id);
      const remainingPages = pages.filter((page) => page.id !== activePage.id);
      setPages(remainingPages);
      onNotify?.("success", "Wikiページを削除しました");

      ++requestSequence.current;
      applyPage(null);
      if (remainingPages.length > 0) {
        setPageLoading(true);
        const sequence = ++requestSequence.current;
        try {
          const nextPage = await fetchWikiPage(remainingPages[0].id);
          if (sequence === requestSequence.current) {
            applyPage(nextPage);
            setFocusRequest((current) => current + 1);
          }
        } catch (error) {
          if (sequence === requestSequence.current) {
            setErrorMessage(
              error instanceof Error
                ? `ページは削除しましたが、次のページを読み込めませんでした: ${error.message}`
                : "ページは削除しましたが、次のページを読み込めませんでした"
            );
          }
        } finally {
          if (sequence === requestSequence.current) setPageLoading(false);
        }
      } else {
        setFocusRequest((current) => current + 1);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Wikiページを削除できませんでした";
      setErrorMessage(message);
      onNotify?.("error", message);
    } finally {
      setDeleting(false);
    }
  }, [
    activePage,
    applyPage,
    deleting,
    initialLoading,
    onNotify,
    pageLoading,
    pages,
    saving,
  ]);

  const discardChanges = useCallback(() => {
    if (!isDirty) return;
    if (!window.confirm("未保存の変更を破棄しますか？")) return;
    applyPage(activePage);
  }, [activePage, applyPage, isDirty]);

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLocaleLowerCase() === "s"
    ) {
      event.preventDefault();
      void handleSave();
    }
  };

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ja-JP");
  const filteredPages = useMemo(
    () =>
      normalizedQuery
        ? pages.filter((page) =>
            page.title.toLocaleLowerCase("ja-JP").includes(normalizedQuery)
          )
        : pages,
    [normalizedQuery, pages]
  );

  const saveState = activePage
    ? isDirty
      ? "未保存"
      : "保存済み"
    : isDirty
      ? "未保存"
      : "新規ページ";
  const hasUpdateConflict = errorMessage.includes("別の画面で更新");

  return (
    <section className="panel wiki-page" aria-busy={initialLoading || pageLoading}>
      <PageHeader
        title="管理Wiki"
        description="運用手順や判断基準をMarkdownで整理できます。内容の閲覧・編集はログイン中の管理者だけに限定されます。"
        actions={
          <button
            type="button"
            className="btn"
            onClick={startNewPage}
            disabled={
              initialLoading ||
              initialLoadFailed ||
              pageLoading ||
              saving ||
              deleting
            }
          >
            新しいページ
          </button>
        }
      />

      <div className="wiki-shell">
        <aside className="wiki-sidebar" aria-label="Wikiページ一覧">
          <div className="wiki-sidebar-heading">
            <span className="section-title">ページ</span>
            <span className="wiki-page-count">{pages.length}件</span>
          </div>
          <label className="wiki-search">
            <span className="sr-only">Wikiページを検索</span>
            <SearchIcon />
            <input
              type="search"
              className="text-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="タイトルを検索"
            />
          </label>

          {initialLoading ? (
            <p className="wiki-sidebar-state" role="status">
              ページを読み込んでいます…
            </p>
          ) : initialLoadFailed ? (
            <p className="wiki-sidebar-state">
              ページ一覧を読み込めませんでした。
            </p>
          ) : filteredPages.length === 0 ? (
            <p className="wiki-sidebar-state">
              {pages.length === 0
                ? "まだページがありません。"
                : "一致するページがありません。"}
            </p>
          ) : (
            <nav className="wiki-page-list" aria-label="Wiki記事">
              {filteredPages.map((page) => {
                const selected = activePage?.id === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    className={"wiki-page-link" + (selected ? " active" : "")}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => void openPage(page.id)}
                    disabled={pageLoading || saving || deleting}
                  >
                    <span className="wiki-page-link-title">{page.title}</span>
                    <time dateTime={page.updatedAt}>
                      {formatDate(page.updatedAt)}
                    </time>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        <div className="wiki-main">
          {initialLoading || pageLoading ? (
            <div className="wiki-editor-loading" role="status">
              ページを読み込んでいます…
            </div>
          ) : initialLoadFailed ? (
            <div className="wiki-load-error">
              <h3>Wikiページを読み込めませんでした</h3>
              <p role="alert">
                {errorMessage ||
                  "通信状態を確認して、もう一度読み込んでください。"}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => setLoadAttempt((current) => current + 1)}
              >
                再試行
              </button>
            </div>
          ) : (
            <form
              className="wiki-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
              onKeyDown={handleEditorKeyDown}
            >
              <div className="wiki-editor-head">
                <div>
                  <h3>{activePage ? "ページを編集" : "新しいページ"}</h3>
                  {activePage && (
                    <p>
                      最終更新{" "}
                      <time dateTime={activePage.updatedAt}>
                        {formatDate(activePage.updatedAt)}
                      </time>
                    </p>
                  )}
                </div>
                <span
                  className="wiki-save-state"
                  data-dirty={isDirty || undefined}
                >
                  {saveState}
                </span>
              </div>

              <label className="wiki-title-field">
                <span>タイトル</span>
                <input
                  ref={titleInputRef}
                  name="title"
                  className="text-input"
                  value={title}
                  maxLength={WIKI_TITLE_MAX_LENGTH}
                  required
                  aria-invalid={titleInvalid || undefined}
                  aria-describedby={
                    titleInvalid && errorMessage
                      ? "wiki-form-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (event.target.value.trim()) {
                      setTitleInvalid(false);
                      if (errorMessage === "タイトルは必須です") {
                        setErrorMessage("");
                      }
                    }
                    setStatusMessage("");
                  }}
                  placeholder="例: 戦闘履歴の登録手順"
                  disabled={saving || deleting}
                />
              </label>

              {errorMessage && (
                <div className="wiki-form-error-row">
                  <p
                    id="wiki-form-error"
                    className="wiki-form-message error"
                    role="alert"
                  >
                    {errorMessage}
                  </p>
                  {hasUpdateConflict && activePage && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void openPage(activePage.id, true)}
                    >
                      最新内容を読み込む
                    </button>
                  )}
                </div>
              )}
              <p
                className="wiki-form-message success"
                role="status"
                aria-live="polite"
              >
                {statusMessage}
              </p>

              <div className="wiki-editor-toolbar">
                <div
                  className="wiki-mode-switch"
                  role="group"
                  aria-label="Markdownの表示モード"
                >
                  {(
                    [
                      ["edit", "編集"],
                      ["preview", "プレビュー"],
                      ["split", "分割"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={editorMode === mode ? "active" : ""}
                      aria-pressed={editorMode === mode}
                      onClick={() => setEditorMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="wiki-markdown-help">
                  Markdown / Ctrl・⌘ + S で保存
                </span>
              </div>

              <div className="wiki-workspace" data-mode={editorMode}>
                {editorMode !== "preview" && (
                  <section className="wiki-edit-pane" aria-label="Markdown編集">
                    <div className="wiki-pane-title">
                      <span className="wiki-pane-label">Markdown</span>
                      <span>
                        {content.length.toLocaleString("ja-JP")} /{" "}
                        {WIKI_CONTENT_MAX_LENGTH.toLocaleString("ja-JP")}
                      </span>
                    </div>
                    <textarea
                      name="content"
                      className="wiki-markdown-input"
                      value={content}
                      maxLength={WIKI_CONTENT_MAX_LENGTH}
                      onChange={(event) => {
                        setContent(event.target.value);
                        setStatusMessage("");
                      }}
                      placeholder={
                        "# 見出し\n\n本文をMarkdownで入力してください。"
                      }
                      aria-label="Wiki本文（Markdown）"
                      disabled={saving || deleting}
                    />
                  </section>
                )}

                {editorMode !== "edit" && (
                  <section
                    className="wiki-preview-pane"
                    aria-label="プレビュー"
                  >
                    <div className="wiki-pane-title">
                      <span className="wiki-pane-label">プレビュー</span>
                    </div>
                    {deferredContent.trim() ? (
                      <MarkdownContent content={deferredContent} />
                    ) : (
                      <p className="wiki-preview-empty">
                        Markdownを入力すると、ここにプレビューが表示されます。
                      </p>
                    )}
                  </section>
                )}
              </div>

              <div className="wiki-editor-actions">
                <div>
                  <button
                    type="button"
                    className="btn btn-danger wiki-delete-button"
                    onClick={() => void handleDelete()}
                    disabled={!activePage || deleting || saving}
                  >
                    <TrashIcon />
                    {deleting ? "削除中…" : "削除"}
                  </button>
                </div>
                <div className="wiki-editor-primary-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={discardChanges}
                    disabled={!isDirty || saving || deleting}
                  >
                    変更を破棄
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving || deleting || pageLoading}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
