/** Workspace tree and scoped full-text search results. */

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ExplorerApi } from '../rpc.ts'
import type { FsEntry, WorkspaceSearchMatch } from '../../shared/rpc-contract.ts'
import { subscribeRootPinned } from '../root-events.ts'
import type { TabsStore } from '../state/tabs.ts'
import type { BuffersStore } from '../state/buffers.ts'
import { useExplorerT } from '../use-explorer-t.ts'
import {
  CollapseAllIconButton,
  ExpandAllIconButton,
  HiddenFilesToggleIconButton,
  NewFileIconButton,
  RefreshIconButton,
} from './ToolbarIcons.tsx'
import { CreateFileDialog } from './CreateFileDialog.tsx'
import { GlobalReplaceDialog } from './GlobalReplaceDialog.tsx'
import { TreeNode, type TreeAction } from './TreeNode.tsx'
import { createTreeExpansionBudget } from './tree-expansion.ts'
import css from './explorer.module.css'

export interface ExplorerPanelProps {
  readonly ctx: ClientContext
  readonly api: ExplorerApi
  readonly tabs: TabsStore
  readonly buffers: BuffersStore
  readonly onOpenFile: (path: string, line?: number, edit?: boolean) => void
}

class PanelBoundary extends Component<{ readonly children: ReactNode }, { readonly message: string | null }> {
  override state: { readonly message: string | null } = { message: null }

  static getDerivedStateFromError(error: Error): { readonly message: string } {
    return { message: error.message }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[workspace-files] panel error', error, info)
  }

  override render(): ReactNode {
    return this.state.message === null
      ? this.props.children
      : <div className={css.errorBanner}>{this.state.message}</div>
  }
}

function workspaceLabel(root: string): string {
  const normalized = root.replaceAll('\\', '/').replace(/\/+$/, '')
  const name = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized
  return name || root || 'workspace'
}

const SHOW_HIDDEN_KEY = 'dsh-workspace-enhanced:show-hidden'

function readShowHidden(): boolean {
  try {
    return window.localStorage.getItem(SHOW_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Dot-prefixed segments are workspace noise: VCS data, caches, tool configs. */
function isHiddenPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..')
}

export function ExplorerPanel(props: ExplorerPanelProps): ReactElement {
  return <PanelBoundary><ExplorerPanelInner {...props} /></PanelBoundary>
}

function ExplorerPanelInner(props: ExplorerPanelProps): ReactElement {
  const { ctx, api, tabs, buffers, onOpenFile } = props
  const t = useExplorerT(ctx)
  const activePath = useSyncExternalStore(tabs.subscribe, () => tabs.getSnapshot().activePath)
  const [entries, setEntries] = useState<readonly FsEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [treeAction, setTreeAction] = useState<TreeAction | null>(null)
  const [expandLimitReached, setExpandLimitReached] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [rootPath, setRootPath] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [matches, setMatches] = useState<readonly WorkspaceSearchMatch[]>([])
  const [partialSearch, setPartialSearch] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [quickResults, setQuickResults] = useState<readonly string[]>([])
  const [quickIndex, setQuickIndex] = useState(0)
  const [quickLoading, setQuickLoading] = useState(false)
  const [quickError, setQuickError] = useState<string | null>(null)
  const [quickTruncated, setQuickTruncated] = useState(false)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const quickInput = useRef<HTMLInputElement | null>(null)
  const showQuickOpen = useCallback((): void => {
    setSearchOpen(false)
    setQuickOpen(true)
    setQuickQuery('')
    setQuickResults([])
    setQuickTruncated(false)
    setQuickIndex(0)
    setQuickLoading(false)
    setQuickError(null)
    window.requestAnimationFrame(() => {
      quickInput.current?.focus()
      quickInput.current?.select()
    })
  }, [])

  useEffect(() => {
    setShowHidden(readShowHidden())
  }, [])

  const toggleHidden = useCallback((): void => {
    setShowHidden((current) => {
      const next = !current
      try {
        window.localStorage.setItem(SHOW_HIDDEN_KEY, next ? '1' : '0')
      } catch {
        // Storage is optional; the tree still reflects this session.
      }
      return next
    })
  }, [])

  const visibleEntries = useMemo(
    () => entries.filter((entry) => showHidden || !isHiddenPath(entry.path)),
    [entries, showHidden],
  )
  const visibleQuickResults = useMemo(
    () => quickResults.filter((path) => showHidden || !isHiddenPath(path)),
    [quickResults, showHidden],
  )

  useEffect(() => {
    setQuickIndex(0)
  }, [visibleQuickResults])

  useEffect(() => {
    if (activePath !== null) setSelectedPath(activePath)
  }, [activePath])

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [listResult, rootResult] = await Promise.all([api.list(''), api.getRoot()])
      if (rootResult.ok) setRootPath(rootResult.value.root)
      if (!listResult.ok) {
        setError(listResult.error.message)
        return
      }
      setError(null)
      setEntries(listResult.value.entries)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workspace listing failed')
    }
  }, [api])

  useEffect(() => { void reload() }, [reload, refreshToken])
  useEffect(() => subscribeRootPinned(() => setRefreshToken((value) => value + 1)), [])

  useEffect(() => {
    const onOpenRequest = (): void => showQuickOpen()
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const inPlugin = target instanceof Element
        && target.closest('[data-file-explorer-panel], [data-file-explorer-editor]') !== null
      if (inPlugin && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        showQuickOpen()
      }
    }
    window.addEventListener('file-explorer:quick-open', onOpenRequest)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('file-explorer:quick-open', onOpenRequest)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [showQuickOpen])

  useEffect(() => {
    const normalized = query.trim()
    if (normalized === '') {
      setMatches([])
      setPartialSearch(false)
      setSearching(false)
      setError(null)
      return
    }
    setMatches([])
    setPartialSearch(false)
    setSearching(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void api.search(normalized, {}, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setMatches(result.value.results)
          setPartialSearch(result.value.truncated === true)
          setError(null)
        } else {
          setMatches([])
          setError(result.error.message)
        }
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setMatches([])
          setError(cause instanceof Error ? cause.message : 'Workspace search failed')
        }
      }).finally(() => {
        if (!controller.signal.aborted) setSearching(false)
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      setSearching(false)
    }
  }, [api, query])

  useEffect(() => {
    if (!quickOpen) return
    const raw = quickQuery.trim()
    const lineSuffix = /:(\d+)$/u.exec(raw)
    const pathQuery = (lineSuffix === null ? raw : raw.slice(0, lineSuffix.index)).trim()
    if (pathQuery === '') {
      const recent = tabs.getSnapshot()
      const recentPaths = [
        ...(recent.activePath === null ? [] : [recent.activePath]),
        ...recent.open.map((tab) => tab.path).filter((path) => path !== recent.activePath).reverse(),
      ]
      setQuickResults(recentPaths.slice(0, 50))
      setQuickError(null)
      setQuickTruncated(false)
      setQuickLoading(false)
      setQuickIndex(0)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setQuickLoading(true)
      void api.quickOpen(pathQuery, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setQuickResults(result.value.results)
          setQuickError(null)
          setQuickTruncated(result.value.truncated === true)
          setQuickIndex(0)
        } else {
          setQuickResults([])
          setQuickTruncated(false)
          setQuickError(result.error.message)
        }
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setQuickResults([])
          setQuickTruncated(false)
          setQuickError(cause instanceof Error ? cause.message : 'Quick Open failed')
        }
      }).finally(() => {
        if (!controller.signal.aborted) setQuickLoading(false)
      })
    }, 120)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      setQuickLoading(false)
    }
  }, [api, quickOpen, quickQuery, tabs])

  const chooseQuickOpen = (path: string): void => {
    const lineMatch = /:(\d+)$/u.exec(quickQuery.trim())
    const line = lineMatch === null ? undefined : Math.max(1, Number(lineMatch[1]))
    setQuickOpen(false)
    setQuickQuery('')
    onOpenFile(path, line)
  }

  const handleQuickKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setQuickOpen(false)
    } else if (event.key === 'ArrowDown' && visibleQuickResults.length > 0) {
      event.preventDefault()
      setQuickIndex((index) => (index + 1) % visibleQuickResults.length)
    } else if (event.key === 'ArrowUp' && visibleQuickResults.length > 0) {
      event.preventDefault()
      setQuickIndex((index) => (index - 1 + visibleQuickResults.length) % visibleQuickResults.length)
    } else if (event.key === 'Enter' && !quickLoading && visibleQuickResults[quickIndex] !== undefined) {
      event.preventDefault()
      chooseQuickOpen(visibleQuickResults[quickIndex]!)
    }
  }

  const bump = (): void => setRefreshToken((value) => value + 1)
  const selectMatch = (match: WorkspaceSearchMatch): void => {
    setSearchOpen(false)
    setQuery('')
    setSelectedPath(match.path)
    onOpenFile(match.path, match.line)
  }
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setSearchOpen(false)
      setQuery('')
      return
    }
    if (event.key === 'Enter' && !searching && matches[0] !== undefined) {
      event.preventDefault()
      selectMatch(matches[0])
    }
  }
  const expandAll = (): void => {
    setExpandLimitReached(false)
    setTreeAction((current) => {
      const id = (current?.id ?? 0) + 1
      return { id, action: 'expand', budget: createTreeExpansionBudget(id, () => setExpandLimitReached(true)) }
    })
  }
  const collapseAll = (): void => {
    setExpandLimitReached(false)
    setTreeAction((current) => ({ id: (current?.id ?? 0) + 1, action: 'collapse' }))
  }

  return (
    <div className={css.panel} data-file-explorer-panel="">
      <div className={css.toolbar}>
        <div className={css.workspaceName} title={rootPath || undefined}>{workspaceLabel(rootPath)}</div>
        <div className={css.toolbarActions}>
          <NewFileIconButton title={t('createFile')} onClick={() => setCreateOpen(true)} />
          <ExpandAllIconButton title={t('expandAll')} onClick={expandAll} />
          <CollapseAllIconButton title={t('collapseAll')} onClick={collapseAll} />
          <HiddenFilesToggleIconButton
            title={showHidden ? t('hideHiddenFiles') : t('showHiddenFiles')}
            active={showHidden}
            onClick={toggleHidden}
          />
          <button type="button" className={css.quickOpenButton} title={t('quickOpen')} onClick={showQuickOpen}>{t('quickOpen')}</button>
          <RefreshIconButton title={t('refresh')} onClick={bump} />
        </div>
      </div>
      {expandLimitReached ? <div className={css.searchMessage} role="status">{t('expandAllLimitReached')}</div> : null}
      <div className={css.searchWrap}>
        <div className={css.searchControls}>
          <input
            ref={searchInput}
            className={css.searchInput}
            type="search"
            role="searchbox"
            aria-label={t('searchWorkspace')}
            aria-expanded={searchOpen && query.trim() !== ''}
            aria-controls="workspace-search-results"
            placeholder={t('searchWorkspace')}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setMatches([])
              setSearching(event.target.value.trim() !== '')
              setSearchOpen(true)
            }}
            onKeyDown={handleSearchKeyDown}
          />
          <button
            type="button"
            className={css.replaceOpenButton}
            title={t('replaceTitle')}
            aria-label={t('replaceTitle')}
            data-file-explorer-replace=""
            onClick={() => setReplaceOpen(true)}
          >{t('replaceShort')}</button>
        </div>
        {quickOpen ? (
          <div className={css.quickOpenDialog} role="dialog" aria-label={t('quickOpen')}>
            <div className={css.quickOpenHeader}>
              <input
                ref={quickInput}
                className={css.searchInput}
                type="search"
                role="combobox"
                aria-label={t('quickOpenPlaceholder')}
                aria-controls="workspace-quick-open-results"
                aria-expanded={quickOpen}
                maxLength={256}
                placeholder={t('quickOpenPlaceholder')}
                value={quickQuery}
                onChange={(event) => {
                  setQuickQuery(event.target.value)
                  setQuickResults([])
                  setQuickTruncated(false)
                  setQuickIndex(0)
                  setQuickLoading(event.target.value.trim() !== '')
                  setQuickError(null)
                }}
                onKeyDown={handleQuickKeyDown}
              />
              <button type="button" aria-label={t('quickOpenClose')} onClick={() => setQuickOpen(false)}>×</button>
            </div>
            <div className={css.quickOpenResults} id="workspace-quick-open-results" role="listbox">
              {quickLoading ? <div className={css.searchMessage} role="status">{t('searching')}</div> : null}
              {quickError !== null ? <div className={css.searchMessage} role="alert">{quickError}</div> : null}
              {quickTruncated && quickError === null ? <div className={css.searchMessage} role="status">{t('quickOpenPartial')}</div> : null}
              {!quickLoading && quickError === null && quickResults.length === 0 ? <div className={css.searchMessage}>{t('quickOpenEmpty')}</div> : null}
              {visibleQuickResults.map((path, index) => (
                <button
                  key={path}
                  type="button"
                  role="option"
                  aria-selected={index === quickIndex}
                  className={index === quickIndex ? `${css.searchResult} ${css.quickOpenSelected}` : css.searchResult}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setQuickIndex(index)}
                  onClick={() => chooseQuickOpen(path)}
                >
                  <span className={css.searchPath}>{path}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {searchOpen && query.trim() !== '' ? (
          <div className={css.searchResults} id="workspace-search-results" role="listbox" aria-label={t('searchWorkspace')}>
            {searching ? <div className={css.searchMessage} role="status">{t('searching')}</div> : null}
            {!searching && matches.length === 0 ? <div className={css.searchMessage}>{t('searchNoResults')}</div> : null}
            {!searching && partialSearch ? <div className={css.searchMessage} role="status">{t('searchPartial')}</div> : null}
            {matches.map((match, index) => (
              <button
                key={`${match.path}:${match.line}:${index}`}
                type="button"
                role="option"
                aria-selected={false}
                className={css.searchResult}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMatch(match)}
              >
                <span className={css.searchPath}>{match.path}<span className={css.searchLine}>:{match.line}</span></span>
                <span className={css.searchSnippet}>{match.snippet}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error !== null ? <div className={css.errorBanner} role="alert">{error}</div> : null}
      {visibleEntries.length === 0 && error === null ? (
        <div className={css.empty}>{t('emptyWorkspace')}</div>
      ) : (
        <div className={css.treeScroll} data-file-explorer-tree-scroll="">
          <ul className={css.tree} role="tree">
            {visibleEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                api={api}
                t={t}
                activePath={activePath}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                onOpenFile={onOpenFile}
                onError={setError}
                refreshToken={refreshToken}
                treeAction={treeAction}
                expandCascadeId={null}
                expandBudget={null}
              />
            ))}
          </ul>
        </div>
      )}
      {createOpen ? (
        <CreateFileDialog
          api={api}
          t={t}
          onClose={() => setCreateOpen(false)}
          onCreated={(path) => {
            setCreateOpen(false)
            setError(null)
            setSelectedPath(path)
            bump()
            onOpenFile(path, undefined, true)
          }}
        />
      ) : null}
      {replaceOpen ? (
        <GlobalReplaceDialog
          api={api}
          buffers={buffers}
          t={t}
          initialFindText={query.trim()}
          onClose={() => setReplaceOpen(false)}
        />
      ) : null}
    </div>
  )
}
