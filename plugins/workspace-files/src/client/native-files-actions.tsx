import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FileExplorerSettings } from '../shared/settings-contract.ts'
import { fileAddressFor } from './workspace-address.ts'
import { createExplorerApi } from './rpc.ts'
import { CreateFileDialog } from './explorer/CreateFileDialog.tsx'
import { NewFileIconButton } from './explorer/ToolbarIcons.tsx'
import { favoritesForWorkspace, normalizeFavoritePath, toggleWorkspaceFavorite, type FavoriteToggleResult } from './favorites.ts'
import { restoreDialogTrigger, trapDialogTab } from './dialog-focus.ts'
import type { WorkspaceFilesSearchActionProps } from './sidebar-files-tab.ts'
import css from './native-files-enhancements.module.css'

interface QuickOpenState {
  readonly results: readonly string[]
  readonly busy: boolean
  readonly error: string | null
  readonly partial: boolean
}

interface SidebarResourceApi {
  openResource(address: string, options?: { readonly params?: { readonly line?: number } }): void
}

type ScopedWorkspaceFilesActionProps = WorkspaceFilesSearchActionProps & {
  readonly ctx: ClientContext
  readonly scope: ConfigForm<FileExplorerSettings>
}

function useFavoriteSettings(scope: ConfigForm<FileExplorerSettings>) {
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  return {
    entries: snapshot.value?.favoriteFiles ?? [],
    ready: snapshot.status === 'ready' && snapshot.value !== undefined,
    revision: snapshot.revision,
    writable: snapshot.status === 'ready' && snapshot.value !== undefined && snapshot.writable,
  }
}

type FavoriteUpdateFailureReason = 'invalid-root' | 'invalid-path' | 'limit' | 'read-only' | 'save-failed'
type FavoriteUpdateResult = FavoriteToggleResult | { readonly ok: false; readonly reason: 'read-only' | 'save-failed' }

async function updateWorkspaceFavorite(
  scope: ConfigForm<FileExplorerSettings>,
  entries: FileExplorerSettings['favoriteFiles'],
  workspaceRoot: string,
  path: string,
  writable: boolean,
  expectedRevision: number | undefined,
): Promise<FavoriteUpdateResult> {
  if (!writable) return { ok: false, reason: 'read-only' }
  if (expectedRevision === undefined) return { ok: false, reason: 'save-failed' }
  const result = toggleWorkspaceFavorite(entries, workspaceRoot, path)
  if (!result.ok) return result
  try {
    const accepted = await scope.mutate([
      {
        op: 'set',
        path: ['favoriteFiles'],
        value: result.favorites.map((favorite) => ({
          workspaceRoot: favorite.workspaceRoot,
          path: favorite.path,
        })),
      },
    ], expectedRevision)
    if (!accepted) return { ok: false, reason: 'save-failed' }
    return result
  } catch {
    return { ok: false, reason: 'save-failed' }
  }
}

function favoriteErrorMessage(reason: FavoriteUpdateFailureReason, t: WorkspaceFilesSearchActionProps['t']): string {
  if (reason === 'limit') return t('favoriteLimitReached')
  if (reason === 'read-only') return t('readOnly')
  if (reason === 'save-failed') return t('favoriteSaveFailed')
  return t('favoriteUnavailable')
}

function splitQuickOpenQuery(query: string): { readonly path: string; readonly line?: number } {
  const normalized = query.trim()
  const lineSuffix = /:(\d+)$/u.exec(normalized)
  if (lineSuffix === null) return { path: normalized }
  return { path: normalized.slice(0, lineSuffix.index).trim(), line: Math.max(1, Number(lineSuffix[1])) }
}

function useQuickOpen(api: ReturnType<typeof createExplorerApi>, open: boolean, query: string): QuickOpenState {
  const [results, setResults] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partial, setPartial] = useState(false)

  useEffect(() => {
    const { path } = splitQuickOpenQuery(query)
    if (!open) {
      setResults([])
      setBusy(false)
      setError(null)
      setPartial(false)
      return
    }
    if (path === '') {
      setResults([])
      setBusy(false)
      setError(null)
      setPartial(false)
      return
    }
    setResults([])
    setBusy(true)
    setError(null)
    setPartial(false)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void api.quickOpen(path, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) {
          setResults([])
          setError(result.error.message)
          return
        }
        setResults(result.value.results)
        setPartial(result.value.truncated === true)
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Quick Open failed')
      }).finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    }, 120)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [api, open, query])

  return { results, busy, error, partial }
}

interface QuickOpenResultsProps extends QuickOpenState {
  readonly activeIndex: number
  readonly onOpen: (path: string) => void
  readonly onHover: (index: number) => void
  readonly t: WorkspaceFilesSearchActionProps['t']
}

function QuickOpenResults(props: QuickOpenResultsProps): ReactElement {
  const { activeIndex, busy, error, partial, results, t, onHover, onOpen } = props
  return (
    <div className={css.results} id="workspace-quick-open-results" role="listbox">
      {busy ? <div className={css.message} role="status">{t('searching')}</div> : null}
      {error !== null ? <div className={css.error} role="alert">{error}</div> : null}
      {partial && error === null ? <div className={css.message} role="status">{t('quickOpenPartial')}</div> : null}
      {!busy && error === null && results.length === 0 ? <div className={css.message}>{t('quickOpenEmpty')}</div> : null}
      {results.map((path, index) => (
        <button
          key={path}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={css.result}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onOpen(path)}
        >
          <span className={css.resultPath}>{path}</span>
        </button>
      ))}
    </div>
  )
}

interface QuickOpenDialogProps extends QuickOpenState {
  readonly open: boolean
  readonly query: string
  readonly activeIndex: number
  readonly onClose: () => void
  readonly onOpen: (path: string) => void
  readonly onQueryChange: (query: string) => void
  readonly onIndexChange: (index: number) => void
  readonly t: WorkspaceFilesSearchActionProps['t']
}

function QuickOpenDialog(props: QuickOpenDialogProps): ReactElement | null {
  const { activeIndex, onClose, onIndexChange, onOpen, onQueryChange, open, query, results, t } = props
  const dialogRef = useRef<HTMLElement | null>(null)
  if (!open || typeof document === 'undefined') return null
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault()
      onIndexChange((activeIndex + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault()
      onIndexChange((activeIndex - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && !props.busy && results[activeIndex] !== undefined) {
      event.preventDefault()
      onOpen(results[activeIndex]!)
    }
  }
  return createPortal(
    <div className={css.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        ref={dialogRef}
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('quickOpen')}
        tabIndex={-1}
        onKeyDown={(event) => {
          trapDialogTab(event, dialogRef.current)
          if (event.key === 'Escape') onClose()
        }}
      >
        <header className={css.dialogHeader}>
          <strong>{t('quickOpen')}</strong>
          <button type="button" className={css.closeButton} aria-label={t('quickOpenClose')} onClick={onClose}>×</button>
        </header>
        <input
          className={css.searchInput}
          type="search"
          role="combobox"
          aria-label={t('quickOpenPlaceholder')}
          aria-controls="workspace-quick-open-results"
          aria-expanded="true"
          maxLength={256}
          autoFocus
          placeholder={t('quickOpenPlaceholder')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <QuickOpenResults {...props} onOpen={onOpen} onHover={onIndexChange} />
      </section>
    </div>,
    document.body,
  )
}

/** Path-oriented Quick Open contributed to the native Files action list. */
export function WorkspaceQuickOpenAction(
  props: WorkspaceFilesSearchActionProps & { readonly ctx: ClientContext },
): ReactElement {
  const { absolutePath, ctx, sessionId, t } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const api = useMemo(() => createExplorerApi(ctx, sessionId), [ctx, sessionId])
  const state = useQuickOpen(api, open, query)
  useEffect(() => setActiveIndex(0), [state.results])
  const closeDialog = (): void => {
    setOpen(false)
    window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
  }
  const openPath = (path: string): void => {
    const sidebar = ctx.get('sidebarRight') as SidebarResourceApi | undefined
    if (sidebar === undefined) return
    const { line } = splitQuickOpenQuery(query)
    const options = line === undefined ? undefined : { params: { line } }
    sidebar.openResource(fileAddressFor(sessionId, absolutePath, path), options)
    setOpen(false)
    window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={css.searchButton}
        title={t('quickOpen')}
        aria-label={t('quickOpen')}
        data-workspace-files-action="quick-open"
        aria-expanded={open}
        onClick={() => { setQuery(''); setOpen(true) }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M4 2.5h7l4 4v11H4z" fill="none" stroke="currentColor" />
          <path d="M11 2.5v4h4M6.5 10h6M6.5 13h6" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <QuickOpenDialog
        {...state}
        open={open}
        query={query}
        activeIndex={activeIndex}
        onClose={closeDialog}
        onOpen={openPath}
        onQueryChange={setQuery}
        onIndexChange={setActiveIndex}
        t={t}
      />
    </>
  )
}

interface FavoritesDialogProps {
  readonly open: boolean
  readonly favorites: ReturnType<typeof favoritesForWorkspace>
  readonly ready: boolean
  readonly writable: boolean
  readonly saving: boolean
  readonly checkingPath: string | null
  readonly error: string | null
  readonly onClose: () => void
  readonly onOpen: (path: string) => void
  readonly onRemove: (path: string) => void
  readonly t: WorkspaceFilesSearchActionProps['t']
}

function FavoritesDialog(props: FavoritesDialogProps): ReactElement | null {
  const { checkingPath, error, favorites, onClose, onOpen, onRemove, open, ready, saving, t, writable } = props
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])
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
        aria-label={t('favoriteTitle')}
        tabIndex={-1}
        onKeyDown={(event) => {
          trapDialogTab(event, dialogRef.current)
          if (event.key === 'Escape') onClose()
        }}
      >
        <header className={css.dialogHeader}>
          <strong>{t('favoriteTitle')}</strong>
          <button ref={closeButtonRef} type="button" className={css.closeButton} aria-label={t('favoriteClose')} onClick={onClose}>×</button>
        </header>
        <div className={css.message} role="status">{t('favoriteAddDeferred')}</div>
        {!ready
          ? <div className={css.message} role="status">{t('favoriteLoading')}</div>
          : !writable ? <div className={css.message} role="status">{t('readOnly')}</div> : null}
        {ready && favorites.length === 0 ? (
          <div className={css.message}>{t('favoriteEmpty')}</div>
        ) : ready ? (
          <div className={css.favoriteList} role="list">
            {favorites.map((favorite) => (
              <div className={css.favoriteRow} role="listitem" key={JSON.stringify([favorite.workspaceRoot, favorite.path])}>
                <button
                  type="button"
                  className={css.favoriteOpen}
                  disabled={checkingPath !== null}
                  data-workspace-favorite-open={favorite.path}
                  onClick={() => onOpen(favorite.path)}
                >
                  <span className={css.resultPath}>{favorite.path}</span>
                </button>
                <button
                  type="button"
                  className={css.favoriteRemove}
                  aria-label={t('favoriteRemove')}
                  title={t('favoriteRemove')}
                  disabled={!writable || saving || checkingPath !== null}
                  data-workspace-favorite-remove={favorite.path}
                  onClick={() => onRemove(favorite.path)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {checkingPath !== null ? <div className={css.message} role="status">{t('favoriteChecking')}</div> : null}
        {saving ? <div className={css.message} role="status">{t('favoriteSaving')}</div> : null}
        {error !== null ? <div className={css.error} role="alert">{error}</div> : null}
      </section>
    </div>,
    document.body,
  )
}

/** Workspace-root-scoped favorite shortcuts contributed to the native Files action list. */
export function WorkspaceFavoritesAction(props: ScopedWorkspaceFilesActionProps): ReactElement {
  const { absolutePath, ctx, scope, sessionId, t } = props
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkingPath, setCheckingPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const checkingController = useRef<AbortController | null>(null)
  useEffect(() => () => checkingController.current?.abort(), [])
  const settings = useFavoriteSettings(scope)
  const api = useMemo(() => createExplorerApi(ctx, sessionId), [ctx, sessionId])
  const favorites = useMemo(() => favoritesForWorkspace(settings.entries, absolutePath), [absolutePath, settings.entries])
  const closeDialog = (): void => {
    checkingController.current?.abort()
    checkingController.current = null
    setCheckingPath(null)
    setOpen(false)
    setError(null)
    window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
  }
  const updateFavorite = async (path: string): Promise<void> => {
    setError(null)
    const result = await updateWorkspaceFavorite(scope, settings.entries, absolutePath, path, settings.writable, settings.revision)
    if (!result.ok) {
      setError(favoriteErrorMessage(result.reason, t))
      return
    }
  }
  const openFavorite = async (path: string): Promise<void> => {
    checkingController.current?.abort()
    const controller = new AbortController()
    checkingController.current = controller
    setError(null)
    setCheckingPath(path)
    try {
      const relativePath = normalizeFavoritePath(path)
      if (relativePath === null) {
        setError(t('favoriteUnavailable'))
        return
      }
      const separator = relativePath.lastIndexOf('/')
      const parentPath = separator < 0 ? '' : relativePath.slice(0, separator)
      const listing = await api.list(parentPath, controller.signal)
      if (controller.signal.aborted) return
      const existsAsRegularFile = listing.ok && listing.value.entries.some(
        (entry) => entry.kind === 'file' && entry.path === relativePath,
      )
      if (!existsAsRegularFile) {
        setError(t('favoriteUnavailable'))
        return
      }
      const sidebar = ctx.get('sidebarRight') as SidebarResourceApi | undefined
      if (sidebar === undefined) {
        setError(t('favoriteUnavailable'))
        return
      }
      sidebar.openResource(fileAddressFor(sessionId, absolutePath, relativePath))
      setOpen(false)
      setError(null)
      window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
    } catch {
      if (!controller.signal.aborted) setError(t('favoriteUnavailable'))
    } finally {
      if (checkingController.current === controller) {
        checkingController.current = null
        setCheckingPath(null)
      }
    }
  }
  const removeFavorite = async (path: string): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      await updateFavorite(path)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={css.searchButton}
        title={t('favoriteTitle')}
        aria-label={t('favoriteTitle')}
        aria-expanded={open}
        data-workspace-files-action="favorites"
        onClick={() => { setError(null); setOpen(true) }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="m10 2 2.45 4.96 5.47.8-3.96 3.86.93 5.45L10 14.5l-4.89 2.57.93-5.45L2.08 7.76l5.47-.8L10 2z" />
        </svg>
      </button>
      <FavoritesDialog
        open={open}
        favorites={favorites}
        ready={settings.ready}
        writable={settings.writable}
        saving={saving}
        checkingPath={checkingPath}
        error={error}
        onClose={closeDialog}
        onOpen={(path) => { void openFavorite(path) }}
        onRemove={(path) => { void removeFavorite(path) }}
        t={t}
      />
    </>
  )
}

/** Create a Session-scoped file, then open it in DSH's native Preview. */
export function WorkspaceCreateFileAction(
  props: WorkspaceFilesSearchActionProps & { readonly ctx: ClientContext },
): ReactElement {
  const { absolutePath, ctx, sessionId, t } = props
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const api = useMemo(() => createExplorerApi(ctx, sessionId), [ctx, sessionId])
  const closeDialog = (): void => {
    setOpen(false)
    window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
  }
  const onCreated = (path: string): void => {
    const sidebar = ctx.get('sidebarRight') as SidebarResourceApi | undefined
    sidebar?.openResource(fileAddressFor(sessionId, absolutePath, path))
    setOpen(false)
    window.setTimeout(() => restoreDialogTrigger(triggerRef.current), 0)
  }

  return (
    <>
      <NewFileIconButton
        buttonRef={triggerRef}
        title={t('createFile')}
        onClick={() => setOpen(true)}
      />
      {open ? <CreateFileDialog api={api} t={t} onClose={closeDialog} onCreated={onCreated} /> : null}
    </>
  )
}
