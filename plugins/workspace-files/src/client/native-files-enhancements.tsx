import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileAddressFor, parseSessionFileAddress } from './workspace-address.ts'
import { createExplorerApi } from './rpc.ts'
import { EditorSurface, requestOpenPath } from './editor/EditorSurface.tsx'
import { MarkdownPreview } from './editor/MarkdownPreview.tsx'
import { editorStoresForSession } from './state/session-stores.ts'
import { getPreviewEditorActionState, subscribePreviewEditorActionState } from './state/preview-editor-actions.ts'
import { normalizeFavoritePath } from './favorites.ts'
import { restoreDialogTrigger, trapDialogTab } from './dialog-focus.ts'
import type {
  WorkspaceCodeRendererProps,
  WorkspaceDocumentEditActionProps,
  WorkspaceDocumentRendererProps,
  WorkspaceFilesSearchActionProps,
  WorkspacePlainTextRendererProps,
} from './sidebar-files-tab.ts'
import css from './native-files-enhancements.module.css'

interface SearchMatch {
  readonly path: string
  readonly line: number
  readonly snippet: string
}

interface SearchState {
  readonly results: readonly SearchMatch[]
  readonly busy: boolean
  readonly error: string | null
  readonly partial: boolean
}

interface SidebarRightResourceApi {
  openResource(address: string, options?: { readonly params?: { readonly line?: number } }): void
}

interface SearchResultsProps extends SearchState {
  readonly query: string
  readonly onOpen: (match: SearchMatch) => void
  readonly t: WorkspaceFilesSearchActionProps['t']
}

interface SearchDialogProps extends SearchResultsProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onQueryChange: (query: string) => void
}

function useWorkspaceSearch(api: ReturnType<typeof createExplorerApi>, open: boolean, query: string): SearchState {
  const [results, setResults] = useState<readonly SearchMatch[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partial, setPartial] = useState(false)

  useEffect(() => {
    const normalized = query.trim()
    if (!open || normalized === '') {
      setResults([])
      setPartial(false)
      setError(null)
      setBusy(false)
      return
    }
    setResults([])
    setPartial(false)
    setError(null)
    setBusy(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void api.search(normalized, {}, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) {
          setResults([])
          setError(result.error.message)
          setPartial(false)
          return
        }
        setResults(result.value.results)
        setPartial(result.value.truncated === true)
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setResults([])
          setError(cause instanceof Error ? cause.message : 'Search failed')
          setPartial(false)
        }
      }).finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [api, open, query])

  return { results, busy, error, partial }
}

function SearchResults(props: SearchResultsProps): ReactElement {
  const { busy, error, partial, query, results, t, onOpen } = props
  return (
    <div className={css.results} role="listbox" aria-label={t('searchWorkspace')}>
      {busy ? <div className={css.message} role="status">{t('searching')}</div> : null}
      {!busy && query.trim() === '' ? <div className={css.message}>{t('searchEnterQuery')}</div> : null}
      {!busy && error !== null ? <div className={css.error} role="alert">{error}</div> : null}
      {!busy && error === null && query.trim() !== '' && results.length === 0
        ? <div className={css.message}>{t('searchNoResults')}</div>
        : null}
      {partial ? <div className={css.message} role="status">{t('searchPartial')}</div> : null}
      {results.map((match) => (
        <button
          key={`${match.path}:${match.line}`}
          type="button"
          role="option"
          aria-selected="false"
          className={css.result}
          onClick={() => onOpen(match)}
        >
          <span className={css.resultPath}>{match.path}:{match.line}</span>
          <span className={css.resultSnippet}>{match.snippet}</span>
        </button>
      ))}
    </div>
  )
}

function SearchDialog(props: SearchDialogProps): ReactElement | null {
  const { busy, error, onClose, onOpen, onQueryChange, open, partial, query, results, t } = props
  const dialogRef = useRef<HTMLElement | null>(null)
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      className={css.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('searchWorkspace')}
        tabIndex={-1}
        onKeyDown={(event) => {
          trapDialogTab(event, dialogRef.current)
          if (event.key === 'Escape') onClose()
        }}
      >
        <header className={css.dialogHeader}>
          <strong>{t('searchWorkspace')}</strong>
          <button type="button" className={css.closeButton} aria-label={t('tabClose')} onClick={onClose}>×</button>
        </header>
        <input
          className={css.searchInput}
          type="search"
          role="searchbox"
          autoFocus
          aria-label={t('searchWorkspace')}
          placeholder={t('searchWorkspace')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0] !== undefined) onOpen(results[0])
          }}
        />
        <SearchResults
          results={results}
          busy={busy}
          error={error}
          partial={partial}
          query={query}
          onOpen={onOpen}
          t={t}
        />
      </section>
    </div>,
    document.body,
  )
}

/** Search popover contributed to the native Files tab's action list. */
export function WorkspaceFilesSearchAction(
  props: WorkspaceFilesSearchActionProps & { readonly ctx: ClientContext },
): ReactElement {
  const { absolutePath, ctx, sessionId, t } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const api = useMemo(() => createExplorerApi(ctx, sessionId), [ctx, sessionId])
  const search = useWorkspaceSearch(api, open, query)
  const closeDialog = (): void => {
    setOpen(false)
    window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
  }
  const openMatch = (match: SearchMatch): void => {
    const sidebar = ctx.get('sidebarRight') as SidebarRightResourceApi | undefined
    if (sidebar === undefined) return
    sidebar.openResource(fileAddressFor(sessionId, absolutePath, match.path), { params: { line: match.line } })
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={css.searchButton}
        aria-label={t('searchWorkspace')}
        title={t('searchWorkspace')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
      </button>
      <SearchDialog
        {...search}
        query={query}
        open={open}
        onClose={closeDialog}
        onOpen={openMatch}
        onQueryChange={setQuery}
        t={t}
      />
    </>
  )
}

interface WorkspaceDocumentContent {
  readonly kind: 'text'
  readonly text: string
  readonly eof: boolean
  readonly pages?: readonly { readonly offset: number; readonly text: string; readonly lines: number }[]
}

interface WorkspaceDocumentBodyProps {
  readonly ctx: ClientContext
  readonly sessionId: string
  readonly resourceAddress: string
  readonly content: WorkspaceDocumentContent
  readonly t: WorkspaceDocumentRendererProps['t']
  readonly renderer: 'markdown' | 'code' | 'text'
  readonly wrap?: boolean
  readonly scrollportRef?: WorkspaceCodeRendererProps['scrollportRef']
  readonly targetLine?: number
}

interface WorkspaceDocumentEditorState {
  readonly api: ReturnType<typeof createExplorerApi>
  readonly stores: ReturnType<typeof editorStoresForSession>
  readonly editorSessionId: string | null
  readonly editorPath: string
  readonly canEdit: boolean
  readonly editing: boolean
  readonly setEditing: (editing: boolean) => void
}

function useCloseEditorWhenLastTabCloses(
  stores: ReturnType<typeof editorStoresForSession>,
  editing: boolean,
  setEditing: (editing: boolean) => void,
): void {
  const activePath = useSyncExternalStore(stores.tabs.subscribe, () => stores.tabs.getSnapshot().activePath)
  const hadActivePath = useRef(false)
  useEffect(() => {
    if (!editing) {
      hadActivePath.current = false
      return
    }
    if (activePath !== null) hadActivePath.current = true
    else if (hadActivePath.current) {
      hadActivePath.current = false
      setEditing(false)
    }
  }, [activePath, editing, setEditing])
}

function useWorkspaceDocumentEditor(props: WorkspaceDocumentBodyProps): WorkspaceDocumentEditorState {
  const { ctx, resourceAddress, sessionId } = props
  const resourceKey = JSON.stringify([sessionId, resourceAddress])
  const previousResourceKey = useRef(resourceKey)
  const resourceChanged = previousResourceKey.current !== resourceKey
  const parsed = useMemo(() => parseSessionFileAddress(resourceAddress), [resourceAddress])
  const relativePath = parsed === null ? null : normalizeFavoritePath(parsed.path)
  const editable = parsed !== null && parsed.sessionId === sessionId && relativePath !== null
  const editorSessionId = editable ? parsed.sessionId : null
  const editorPath = editable ? relativePath : ''
  const api = useMemo(() => createExplorerApi(ctx, editorSessionId), [ctx, editorSessionId])
  const stores = useMemo(() => editorStoresForSession(editorSessionId), [editorSessionId])
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (previousResourceKey.current === resourceKey) return
    previousResourceKey.current = resourceKey
    setEditing(false)
  }, [resourceKey])
  useCloseEditorWhenLastTabCloses(stores, editing, setEditing)
  return { api, stores, editorSessionId, editorPath, canEdit: editable && !resourceChanged, editing, setEditing }
}

function PlainTextPages(props: { readonly content: WorkspaceDocumentContent; readonly targetLine?: number }): ReactElement {
  const pages = props.content.pages ?? [{ offset: 0, text: props.content.text, lines: props.content.text.split('\n').length }]
  return (
    <div className={css.plainTextDocument} data-textpreview-plain="">
      {pages.map((page) => (
        <pre className={css.plainTextPage} data-textpreview-page={page.offset} key={page.offset}>
          {page.lines === 0 ? null : page.text.split('\n').map((text, index) => {
            const line = page.offset + index
            const isTarget = line === props.targetLine
            return (
              <div
                className={isTarget ? `${css.plainTextLine} ${css.plainTextTarget}` : css.plainTextLine}
                data-textpreview-line={line}
                data-textpreview-target={isTarget ? line : undefined}
                key={line}
              >
                {text}{'\n'}
              </div>
            )
          })}
        </pre>
      ))}
    </div>
  )
}

function DocumentPreviewBody(props: WorkspaceDocumentBodyProps): ReactElement {
  if (props.renderer === 'markdown') {
    return (
      <div className={css.markdownBody} data-workspace-markdown-body="">
        <MarkdownPreview content={props.content.text} blockImages />
      </div>
    )
  }
  if (props.renderer === 'code') {
    const parsed = parseSessionFileAddress(props.resourceAddress)
    const language = parsed === null ? undefined : languageForPath(parsed.path)
    return (
      <div className={css.codeRenderer} data-workspace-code-body="" data-code-preview="" data-wrap={props.wrap}>
        <CodeBlock
          className={css.codeBlock}
          contentRef={props.scrollportRef}
          code={props.content.text}
          lang={language}
          streaming={!props.content.eof}
          wrap={props.wrap}
          lineNumbers
          copyLabel={props.t('codePreviewCopy')}
          copiedLabel={props.t('codePreviewCopied')}
          toolbarLabels={{
            codeLabel: props.t('codePreviewTitle'),
            wrapLabel: props.t('codePreviewWrap'),
            unwrapLabel: props.t('codePreviewUnwrap'),
          }}
        />
      </div>
    )
  }
  return (
    <div className={css.plainTextBody} data-workspace-text-body="">
      <PlainTextPages content={props.content} targetLine={props.targetLine} />
    </div>
  )
}

function WorkspaceDocumentBody(props: WorkspaceDocumentBodyProps): ReactElement {
  const editor = useWorkspaceDocumentEditor(props)
  const resourceKey = JSON.stringify([props.sessionId, props.resourceAddress])
  const [savedPreview, setSavedPreview] = useState<{
    readonly resourceKey: string
    readonly originalContent: string
    readonly savedContent: string
  } | null>(null)
  const previewContent = savedPreview?.resourceKey === resourceKey
    && savedPreview.originalContent === props.content.text
    ? { ...props.content, text: savedPreview.savedContent, pages: undefined }
    : props.content
  const enterEdit = (): void => {
    if (!editor.canEdit || editor.editorSessionId === null) return
    editor.setEditing(true)
    requestOpenPath(editor.editorPath, props.targetLine, true, editor.editorSessionId)
  }
  useEffect(() => {
    const onPreviewEdit = (event: Event): void => {
      const detail = (event as CustomEvent<{ readonly path?: string; readonly sessionId?: string }>).detail
      if (detail?.path !== editor.editorPath || detail.sessionId !== editor.editorSessionId) return
      enterEdit()
    }
    window.addEventListener('file-explorer:edit-preview', onPreviewEdit)
    return () => window.removeEventListener('file-explorer:edit-preview', onPreviewEdit)
  }, [editor.canEdit, editor.editorPath, editor.editorSessionId, editor.setEditing, props.targetLine])
  if (editor.editing && editor.canEdit && editor.editorSessionId !== null) {
    return (
      <div
        className={css.editorBody}
        data-workspace-markdown-editor={props.renderer === 'markdown' ? '' : undefined}
        data-workspace-code-editor={props.renderer === 'code' ? '' : undefined}
        data-workspace-text-editor={props.renderer === 'text' ? '' : undefined}
      >
        <EditorSurface
          ctx={props.ctx}
          api={editor.api}
          tabs={editor.stores.tabs}
          buffers={editor.stores.buffers}
          mdModes={editor.stores.mdModes}
          sessionId={editor.editorSessionId ?? undefined}
          actionPlacement="preview-toolbar"
          onSaveAndExit={(savedContent) => {
            setSavedPreview({
              resourceKey,
              originalContent: props.content.text,
              savedContent,
            })
            editor.setEditing(false)
          }}
        />
      </div>
    )
  }
  return <DocumentPreviewBody {...props} content={previewContent} />
}

/** Session-bound Preview Edit/Save toggle shared by the Markdown, Code, and Plain Text bodies. */
export function WorkspaceDocumentEditAction(
  props: WorkspaceDocumentEditActionProps & { readonly ctx: ClientContext },
): ReactElement | null {
  const { ctx, sessionId, t } = props
  const { tab } = props.useTabInfo()
  const parsed = useMemo(() => parseSessionFileAddress(tab.contentId), [tab.contentId])
  const path = parsed !== null && parsed.sessionId === sessionId
    ? normalizeFavoritePath(parsed.path)
    : null
  // Async edit preflights must not surface stale results after the Preview retargets.
  const currentTargetRef = useRef({ path, sessionId })
  currentTargetRef.current = { path, sessionId }
  const api = useMemo(() => createExplorerApi(ctx, sessionId), [ctx, sessionId])
  const stores = useMemo(() => editorStoresForSession(sessionId), [sessionId])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorState = useSyncExternalStore(
    (listener) => subscribePreviewEditorActionState(sessionId, listener),
    () => getPreviewEditorActionState(sessionId),
  )
  const editorOpen = path !== null && editorState.activePath === path
  const editing = editorOpen && editorState.editing
  const saving = editorOpen && editorState.saving

  if (path === null) return null
  const openEditor = async (): Promise<void> => {
    if (busy) return
    const requestPath = path
    const requestSessionId = sessionId
    const isCurrentTarget = (): boolean => {
      const current = currentTargetRef.current
      return current.path === requestPath && current.sessionId === requestSessionId
    }
    setBusy(true)
    setError(null)
    try {
      if (stores.buffers.get(requestPath) === undefined) {
        const readable = await api.read(requestPath)
        if (!isCurrentTarget()) return
        if (!readable.ok) {
          setError(readable.error.message)
          return
        }
        if (stores.buffers.get(requestPath) === undefined) {
          stores.buffers.load(requestPath, readable.value.content, readable.value.version)
        }
      }
      if (!isCurrentTarget()) return
      window.dispatchEvent(new CustomEvent('file-explorer:edit-preview', { detail: { path: requestPath, sessionId: requestSessionId } }))
    } catch {
      if (isCurrentTarget()) setError(t('editorReadFailed'))
    } finally {
      setBusy(false)
    }
  }
  const saveEditor = (): void => {
    if (!editing || busy || saving) return
    window.dispatchEvent(new CustomEvent('file-explorer:save-preview', { detail: { path, sessionId } }))
  }
  const openFind = (): void => {
    if (!editorOpen) return
    window.dispatchEvent(new CustomEvent('file-explorer:find-preview', { detail: { path, sessionId } }))
  }
  const actionLabel = saving ? t('editorSaving') : editing ? t('editorSave') : t('editorEditAction')

  return (
    <div className={css.documentActionGroup}>
      {editorOpen ? (
        <button
          type="button"
          className={css.searchButton}
          aria-label={t('editorFind')}
          title={t('editorFind')}
          data-workspace-document-find-action=""
          onClick={openFind}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        className={css.documentEditButton}
        aria-label={actionLabel}
        title={actionLabel}
        aria-busy={busy || saving}
        disabled={busy || saving}
        data-workspace-document-edit-action=""
        data-workspace-document-action={editing ? 'save' : 'edit'}
        onClick={() => { void (editing ? saveEditor() : openEditor()) }}
      >
        {actionLabel}
      </button>
      {error === null ? null : <span className={css.documentActionError} role="alert">{error}</span>}
    </div>
  )
}

/** Supplies a safe Markdown body under DSH's native Markdown renderer key. */
export function WorkspaceMarkdownBody(
  props: WorkspaceDocumentRendererProps & { readonly ctx: ClientContext },
): ReactElement {
  return <WorkspaceDocumentBody {...props} renderer="markdown" />
}

/** Reuses DSH's public CodeBlock primitive under its native Code renderer key. */
export function WorkspaceCodeBody(
  props: WorkspaceCodeRendererProps & { readonly ctx: ClientContext },
): ReactElement {
  return <WorkspaceDocumentBody {...props} renderer="code" />
}

/** Overrides only DSH's plain-text fallback body; the native Preview shell remains selected. */
export function WorkspacePlainTextBody(
  props: WorkspacePlainTextRendererProps & { readonly ctx: ClientContext },
): ReactElement {
  const { tab } = props.useTabInfo()
  const line = tab.navigation.params?.line
  const targetLine = typeof line === 'number' ? line : undefined
  return <WorkspaceDocumentBody {...props} renderer="text" targetLine={targetLine} />
}
