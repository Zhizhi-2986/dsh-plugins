/**
 * Center-column editor: tabs + Monaco/textarea + markdown preview.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ExplorerApi } from '../rpc.ts'
import type { TabsStore } from '../state/tabs.ts'
import type { BuffersStore } from '../state/buffers.ts'
import { publishPreviewEditorActionState } from '../state/preview-editor-actions.ts'
import { isMarkdownPath, type MdModeStore } from '../state/md-mode.ts'
import { useExplorerT } from '../use-explorer-t.ts'
import { languageForPath, loadMonaco, type MonacoEditorApi } from './monaco-loader.ts'
import { findOffsets, nextFindOffset, offsetToLineColumn } from './find.ts'
import css from './editor.module.css'

export interface EditorSurfaceProps {
  readonly ctx: ClientContext
  readonly api: ExplorerApi
  readonly tabs: TabsStore
  readonly buffers: BuffersStore
  readonly mdModes: MdModeStore
  readonly sessionId?: string
  readonly actionPlacement?: 'editor-toolbar' | 'preview-toolbar'
  readonly onSaveAndExit?: (savedContent: string) => void
}

type DesktopEditorTheme = 'vs' | 'vs-dark'

function desktopEditorTheme(): DesktopEditorTheme {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'vs-dark'
  const rootStyle = window.getComputedStyle(document.documentElement)
  const declaredScheme = rootStyle.colorScheme.toLowerCase()
  if (declaredScheme.includes('light')) return 'vs'
  if (declaredScheme.includes('dark')) return 'vs-dark'

  const background = window.getComputedStyle(document.body).backgroundColor
  const channels = background.match(/[\d.]+/gu)?.slice(0, 3).map(Number)
  if (channels?.length === 3) {
    const luminance = (channels[0]! * 299 + channels[1]! * 587 + channels[2]! * 114) / 1000
    return luminance > 150 ? 'vs' : 'vs-dark'
  }
  return 'vs-dark'
}

function revealFindOffset(editor: MonacoEditorApi, text: string, offset: number, length: number): void {
  const start = offsetToLineColumn(text, offset)
  const end = offsetToLineColumn(text, offset + length)
  const range = {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  }
  editor.setSelection(range)
  editor.revealRangeInCenter(range)
  editor.focus()
}

/**
 * Multi-tab editor surface bound to explorer RPC + local stores.
 */
export function EditorSurface(props: EditorSurfaceProps): ReactElement {
  const {
    ctx,
    api,
    tabs,
    buffers,
    mdModes,
    sessionId,
    actionPlacement = 'editor-toolbar',
    onSaveAndExit,
  } = props
  const t = useExplorerT(ctx)
  const tRef = useRef(t)
  tRef.current = t
  const tabState = useSyncExternalStore(tabs.subscribe, tabs.getSnapshot)
  useSyncExternalStore(buffers.subscribe, () => buffers.get(tabState.activePath ?? '')?.content ?? '')
  useSyncExternalStore(mdModes.subscribe, () => (
    tabState.activePath === null ? 'source' : mdModes.get(tabState.activePath)
  ))

  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findCaseSensitive, setFindCaseSensitive] = useState(false)
  const [findPosition, setFindPosition] = useState<number | null>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const [desktopTheme, setDesktopTheme] = useState<DesktopEditorTheme>(desktopEditorTheme)
  const [saving, setSaving] = useState(false)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<MonacoEditorApi | null>(null)
  const loadInFlight = useRef(new Map<string, Promise<boolean>>())
  const saveInFlight = useRef(new Map<string, Promise<boolean>>())
  const pendingJump = useRef<{ path: string; line: number } | null>(null)
  const pendingFind = useRef<{ path: string; offset: number; length: number } | null>(null)
  const applyingExternal = useRef(false)
  const pendingFocus = useRef(false)
  const activePath = tabState.activePath
  const isEditing = editingPath === activePath
  const buffer = activePath === null ? undefined : buffers.get(activePath)
  const isDirty = buffer !== undefined && buffer.content !== buffer.savedContent
  const findMatches = useMemo(
    () => findOffsets(buffer?.content ?? '', findQuery, findCaseSensitive),
    [buffer?.content, findCaseSensitive, findQuery],
  )
  const mdMode = activePath !== null && isMarkdownPath(activePath)
    ? mdModes.get(activePath)
    : 'source'

  useEffect(() => {
    if (actionPlacement !== 'preview-toolbar' || sessionId === undefined) return
    publishPreviewEditorActionState(sessionId, { activePath, editing: isEditing, saving })
  }, [actionPlacement, activePath, isEditing, saving, sessionId])

  useEffect(() => {
    if (actionPlacement !== 'preview-toolbar' || sessionId === undefined) return
    return () => publishPreviewEditorActionState(sessionId, { activePath: null, editing: false, saving: false })
  }, [actionPlacement, sessionId])

  useLayoutEffect(() => {
    const updateTheme = (): void => setDesktopTheme(desktopEditorTheme())
    updateTheme()
    const observer = new window.MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  const openPath = useCallback(async (path: string, edit = false): Promise<void> => {
    tabs.open(path)
    if (edit) {
      pendingFocus.current = true
      if (isMarkdownPath(path)) mdModes.set(path, 'source')
    }
    if (buffers.get(path) !== undefined) {
      setEditingPath(edit ? path : null)
      if (edit && activePath === path) {
        const editor = editorRef.current
        if (editor !== null) {
          editor.updateOptions({ readOnly: false })
          editor.focus()
          pendingFocus.current = false
        } else textareaRef.current?.focus()
      }
      return
    }
    const pending = loadInFlight.current.get(path)
    if (pending !== undefined) {
      if (await pending) setEditingPath(edit ? path : null)
      return
    }
    const load = (async (): Promise<boolean> => {
      try {
        const result = await api.read(path)
        if (!result.ok) {
          setError(result.error.message)
          tabs.close(path)
          return false
        }
        setError(null)
        buffers.load(path, result.value.content, result.value.version)
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'File read failed')
        tabs.close(path)
        return false
      }
    })()
    loadInFlight.current.set(path, load)
    const loaded = await load
    if (loadInFlight.current.get(path) === load) loadInFlight.current.delete(path)
    if (loaded) setEditingPath(edit ? path : null)
  }, [activePath, api, buffers, mdModes, tabs])

  useEffect(() => {
    const queued = takePendingOpen(sessionId)
    if (queued !== null) {
      if (queued.line !== undefined) {
        pendingJump.current = { path: queued.path, line: queued.line }
        mdModes.set(queued.path, 'source')
      }
      void openPath(queued.path, queued.edit === true)
    }
  }, [activePath, mdModes, openPath, sessionId])

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ path: string; line?: number; edit?: boolean; sessionId?: string }>).detail
      if (detail?.path && (detail.sessionId === undefined || detail.sessionId === sessionId)) {
        pendingOpen = null
        if (detail.line !== undefined) {
          pendingJump.current = { path: detail.path, line: detail.line }
          mdModes.set(detail.path, 'source')
        }
        void openPath(detail.path, detail.edit === true)
      }
    }
    window.addEventListener('file-explorer:open', handler as EventListener)
    return () => window.removeEventListener('file-explorer:open', handler as EventListener)
  }, [mdModes, openPath, sessionId])

  const savePath = useCallback((path: string): Promise<boolean> => {
    const inFlight = saveInFlight.current.get(path)
    if (inFlight !== undefined) return inFlight
    const entry = buffers.get(path)
    if (entry === undefined) return Promise.resolve(false)
    if (entry.content === entry.savedContent) return Promise.resolve(true)

    const operation = (async (): Promise<boolean> => {
      setSaving(true)
      setStatus(tRef.current('editorSaving'))
      try {
        const submittedContent = entry.content
        const result = await api.write(path, submittedContent, entry.version)
        if (!result.ok) {
          setError(result.error.code === 'CONFLICT' ? tRef.current('editorConflict') : result.error.message)
          setStatus('')
          return false
        }
        buffers.markSaved(path, submittedContent, result.value.version)
        setError(null)
        setStatus(tRef.current('editorSaved'))
        window.setTimeout(() => setStatus(''), 2000)
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Save failed')
        setStatus('')
        return false
      } finally {
        setSaving(false)
      }
    })()
    saveInFlight.current.set(path, operation)
    void operation.finally(() => {
      if (saveInFlight.current.get(path) === operation) saveInFlight.current.delete(path)
    })
    return operation
  }, [api, buffers])

  // Refs keep the Monaco lifecycle effect independent of per-render callbacks.
  const saveRef = useRef(savePath)
  saveRef.current = savePath
  const isEditingRef = useRef(isEditing)
  isEditingRef.current = isEditing

  const saveActive = useCallback(async (): Promise<void> => {
    if (activePath === null) return
    const entry = buffers.get(activePath)
    if (entry === undefined) {
      setStatus(tRef.current('editorNoChanges'))
      window.setTimeout(() => setStatus(''), 1600)
      return
    }
    if (entry.content === entry.savedContent) {
      setStatus(tRef.current('editorNoChanges'))
      window.setTimeout(() => setStatus(''), 1600)
      return
    }
    await savePath(activePath)
  }, [activePath, buffers, savePath])

  const saveAndExit = useCallback(async (): Promise<void> => {
    await saveActive()
    if (activePath === null || buffers.isDirty(activePath)) return
    setEditingPath(null)
    const entry = buffers.get(activePath)
    if (entry !== undefined) onSaveAndExit?.(entry.content)
  }, [activePath, buffers, onSaveAndExit, saveActive])

  useEffect(() => {
    if (actionPlacement !== 'preview-toolbar') return
    const onPreviewSave = (event: Event): void => {
      const detail = (event as CustomEvent<{ readonly path?: string; readonly sessionId?: string }>).detail
      if (detail?.path !== activePath || detail.sessionId !== sessionId || !isEditing) return
      void saveAndExit()
    }
    window.addEventListener('file-explorer:save-preview', onPreviewSave)
    return () => window.removeEventListener('file-explorer:save-preview', onPreviewSave)
  }, [actionPlacement, activePath, isEditing, saveAndExit, sessionId])

  const openFind = useCallback((): void => {
    if (activePath === null) return
    setFindOpen(true)
    window.requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [activePath])

  useEffect(() => {
    if (actionPlacement !== 'preview-toolbar') return
    const onPreviewFind = (event: Event): void => {
      const detail = (event as CustomEvent<{ readonly path?: string; readonly sessionId?: string }>).detail
      if (detail?.path !== activePath || detail.sessionId !== sessionId) return
      if (findOpen) setFindOpen(false)
      else openFind()
    }
    window.addEventListener('file-explorer:find-preview', onPreviewFind)
    return () => window.removeEventListener('file-explorer:find-preview', onPreviewFind)
  }, [actionPlacement, activePath, findOpen, openFind, sessionId])

  const moveFind = useCallback((direction: 1 | -1): void => {
    if (activePath === null || findQuery.length === 0) return
    const next = nextFindOffset(findMatches, findPosition, direction)
    if (next === null) return
    const content = buffer?.content ?? ''
    pendingFind.current = { path: activePath, offset: next, length: findQuery.length }
    setFindPosition(next)
    if (isMarkdownPath(activePath) && mdMode === 'preview') mdModes.set(activePath, 'source')
    if (editorRef.current !== null) {
      revealFindOffset(editorRef.current, content, next, findQuery.length)
      pendingFind.current = null
      return
    }
    if (textareaRef.current !== null) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(next, next + findQuery.length)
      pendingFind.current = null
    }
  }, [activePath, buffer?.content, findMatches, findPosition, findQuery.length, mdMode, mdModes])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target
      const inEditor = target instanceof Element && target.closest('[data-file-explorer-editor]') !== null
      if (!inEditor || !(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveActive()
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openFind()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFind, saveActive])

  useEffect(() => {
    let cancelled = false
    void loadMonaco()
      .then(() => {
        if (!cancelled) setMonacoReady(true)
      })
      .catch(() => {
        if (!cancelled) setMonacoFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!monacoReady || monacoFailed || hostRef.current === null || activePath === null) {
      editorRef.current?.dispose()
      editorRef.current = null
      return
    }
    let disposed = false
    void loadMonaco().then((monaco) => {
      if (disposed || hostRef.current === null) return
      editorRef.current?.dispose()
      const content = buffers.get(activePath)?.content ?? ''
      const editor = monaco.editor.create(hostRef.current, {
        value: content,
        language: languageForPath(activePath),
        automaticLayout: true,
        minimap: { enabled: true, renderCharacters: false },
        fontSize: 13,
        theme: desktopTheme,
        scrollBeyondLastLine: false,
        readOnly: !isEditingRef.current,
      })
      editorRef.current = editor
      if (pendingFocus.current) {
        pendingFocus.current = false
        editor.focus()
      }
      editor.onDidChangeModelContent(() => {
        if (applyingExternal.current) return
        buffers.setContent(activePath, editor.getValue())
      })
      editor.onDidBlurEditorWidget(() => {
        if (isEditingRef.current) void saveRef.current(activePath)
      })
      const jump = pendingJump.current
      if (jump !== null && jump.path === activePath) {
        const line = Math.max(1, Math.min(jump.line, editor.getModel()?.getLineCount() ?? jump.line))
        editor.setPosition({ lineNumber: line, column: 1 })
        editor.revealLineInCenter(line)
        editor.focus()
        pendingJump.current = null
      }
      const find = pendingFind.current
      if (find !== null && find.path === activePath) {
        revealFindOffset(editor, content, find.offset, find.length)
        pendingFind.current = null
      }
    })

    return () => {
      disposed = true
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [monacoReady, monacoFailed, activePath, buffers, desktopTheme])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: !isEditing })
  }, [isEditing])

  useEffect(() => {
    if (!pendingFocus.current || !isEditing) return
    const editor = editorRef.current
    if (editor !== null) {
      editor.updateOptions({ readOnly: false })
      editor.focus()
      pendingFocus.current = false
      return
    }
    if (!monacoFailed || textareaRef.current === null) return
    textareaRef.current.focus()
    pendingFocus.current = false
  }, [activePath, isEditing, monacoFailed, monacoReady])

  useEffect(() => {
    if (activePath === null || editorRef.current === null) return
    const next = buffers.get(activePath)?.content ?? ''
    if (editorRef.current.getValue() === next) return
    applyingExternal.current = true
    try {
      editorRef.current.setValue(next)
    } finally {
      applyingExternal.current = false
    }
  }, [activePath, buffer?.content, buffers])

  useEffect(() => {
    const jump = pendingJump.current
    const textarea = textareaRef.current
    if (jump === null || jump.path !== activePath || textarea === null || (monacoReady && !monacoFailed)) return
    const text = buffers.get(activePath)?.content ?? ''
    const lines = text.split('\\n')
    const targetLine = Math.max(1, Math.min(jump.line, lines.length))
    const offset = lines.slice(0, targetLine - 1).reduce((total, line) => total + line.length + 1, 0)
    textarea.focus()
    textarea.setSelectionRange(offset, offset)
    pendingJump.current = null
  }, [activePath, buffer?.content, buffers, monacoReady, monacoFailed, mdMode])

  const dropTab = useCallback((path: string): void => {
    tabs.close(path)
    buffers.drop(path)
    mdModes.drop(path)
  }, [buffers, mdModes, tabs])

  const onClosePaths = useCallback(async (paths: readonly string[]): Promise<void> => {
    if (paths.length === 0) return
    for (const path of paths) {
      if (!buffers.isDirty(path)) continue
      const saved = await savePath(path)
      if (!saved || buffers.isDirty(path)) return
    }
    for (const path of paths) dropTab(path)
  }, [buffers, dropTab, savePath])

  const onClose = useCallback((path: string): void => {
    void onClosePaths([path])
  }, [onClosePaths])

  if (tabState.open.length === 0 || activePath === null) {
    return (
      <div className={css.surface} data-file-explorer-editor="">
        <div className={css.empty}>{t('editorEmpty')}</div>
      </div>
    )
  }

  return (
    <div className={css.surface} data-file-explorer-editor="">
      {error !== null ? <div className={css.errorBanner}>{error}</div> : null}
      <div className={css.toolbar}>
        {actionPlacement !== 'preview-toolbar' ? (
          !isEditing ? (
            <button
              type="button"
              className={css.toolBtn}
              data-editor-primary-action=""
              onClick={() => {
                if (isMarkdownPath(activePath)) mdModes.set(activePath, 'source')
                pendingFocus.current = true
                setEditingPath(activePath)
              }}
            >{t('editorEdit')}</button>
          ) : (
            <button
              type="button"
              className={css.toolBtn}
              data-editor-primary-action=""
              disabled={saving}
              onClick={() => void saveAndExit()}
            >
              {saving ? t('editorSaving') : t('editorSave')}
            </button>
          )
        ) : null}
        {actionPlacement !== 'preview-toolbar' ? (
          <button
            type="button"
            className={findOpen ? `${css.toolBtn} ${css.toolBtnActive}` : css.toolBtn}
            aria-label={t('editorFind')}
            title={t('editorFind')}
            aria-expanded={findOpen}
            onClick={() => findOpen ? setFindOpen(false) : openFind()}
          >
            <svg className={css.findIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="m12.5 12.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {actionPlacement !== 'preview-toolbar' ? (
        <div className={css.pathBar} title={activePath} aria-label={t('editorFilePath')}>
          {activePath}
        </div>
      ) : null}
      {findOpen ? (
        <div className={css.findBar} role="search">
          <input
            ref={findInputRef}
            type="search"
            aria-label={t('editorFindPlaceholder')}
            placeholder={t('editorFindPlaceholder')}
            value={findQuery}
            onChange={(event) => { setFindQuery(event.target.value); setFindPosition(null) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setFindOpen(false)
              else if (event.key === 'Enter') moveFind(event.shiftKey ? -1 : 1)
            }}
          />
          <button
            type="button"
            aria-label={t('editorFindCaseSensitive')}
            aria-pressed={findCaseSensitive}
            onClick={() => { setFindCaseSensitive((value) => !value); setFindPosition(null) }}
          >Aa</button>
          <span className={css.findCount} aria-live="polite">
            {findPosition === null || !findMatches.includes(findPosition)
              ? `0/${findMatches.length}`
              : `${findMatches.indexOf(findPosition) + 1}/${findMatches.length}`}
          </span>
          <button type="button" aria-label={t('editorFindPrevious')} onClick={() => moveFind(-1)}>↑</button>
          <button type="button" aria-label={t('editorFindNext')} onClick={() => moveFind(1)}>↓</button>
          <button type="button" aria-label={t('editorFindClose')} onClick={() => setFindOpen(false)}>×</button>
        </div>
      ) : null}
      <div
        className={css.body}
        data-editor-canvas=""
      >
        {monacoReady && !monacoFailed ? (
          <div className={css.monacoHost} ref={hostRef} />
        ) : (
          <textarea
            ref={textareaRef}
            className={css.textarea}
            style={{ colorScheme: desktopTheme === 'vs' ? 'light' : 'dark' }}
            value={buffer?.content ?? ''}
            onChange={(event) => buffers.setContent(activePath, event.target.value)}
            onBlur={() => { if (isEditing) void saveActive() }}
            readOnly={!isEditing}
            spellCheck={false}
          />
        )}
      </div>
      <div className={css.statusBar} data-editor-status-bar role="status">
        <span className={css.status}>{status || (monacoFailed ? t('editorTextareaMode') : '')}</span>
        <span className={css.statusMeta}>
          <span>{languageForPath(activePath)}</span>
          <span>UTF-8</span>
        </span>
      </div>
    </div>
  )
}

interface OpenRequest {
  readonly path: string
  readonly line?: number
  readonly edit?: boolean
  readonly sessionId?: string
}

let pendingOpen: OpenRequest | null = null

/** Consume a queued request only in its target Session's sidebar tab. */
function takePendingOpen(sessionId?: string): OpenRequest | null {
  const request = pendingOpen
  if (request !== null && request.sessionId !== undefined && request.sessionId !== sessionId) return null
  pendingOpen = null
  return request
}

/** Dispatch a Session-scoped open request, remembered until its editor mounts. */
export function requestOpenPath(path: string, line?: number, edit?: boolean, sessionId?: string): void {
  const detail = { path, line, edit, sessionId }
  pendingOpen = detail
  window.dispatchEvent(new CustomEvent('file-explorer:open', { detail }))
}
