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
import { isMarkdownPath, type MdModeStore } from '../state/md-mode.ts'
import { useExplorerT } from '../use-explorer-t.ts'
import { languageForPath, loadMonaco, type MonacoEditorApi } from './monaco-loader.ts'
import { findOffsets, nextFindOffset, offsetToLineColumn } from './find.ts'
import { EDITOR_CUSTOM_THEME_ID, EditorAppearanceStore } from './appearance.ts'
import { applyMonacoAppearance } from './apply-monaco-appearance.ts'
import { AppearanceMenu } from './AppearanceMenu.tsx'
import { TabStrip } from './TabStrip.tsx'
import { MarkdownPreview } from './MarkdownPreview.tsx'
import css from './editor.module.css'

export interface EditorSurfaceProps {
  readonly ctx: ClientContext
  readonly api: ExplorerApi
  readonly tabs: TabsStore
  readonly buffers: BuffersStore
  readonly mdModes: MdModeStore
}

const appearanceStore = new EditorAppearanceStore()

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
  const { ctx, api, tabs, buffers, mdModes } = props
  const t = useExplorerT(ctx)
  const tRef = useRef(t)
  tRef.current = t
  const tabState = useSyncExternalStore(tabs.subscribe, tabs.getSnapshot)
  useSyncExternalStore(buffers.subscribe, () => buffers.get(tabState.activePath ?? '')?.content ?? '')
  useSyncExternalStore(mdModes.subscribe, () => (
    tabState.activePath === null ? 'source' : mdModes.get(tabState.activePath)
  ))
  const appearance = useSyncExternalStore(appearanceStore.subscribe, appearanceStore.getSnapshot)

  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findCaseSensitive, setFindCaseSensitive] = useState(false)
  const [findPosition, setFindPosition] = useState<number | null>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
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


  useLayoutEffect(() => {
    appearanceStore.hydrate()
  }, [])

  const openPath = useCallback(async (path: string, edit = false): Promise<void> => {
    tabs.open(path)
    if (edit && isMarkdownPath(path)) mdModes.set(path, 'source')
    if (buffers.get(path) !== undefined) {
      setEditingPath(edit ? path : null)
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
  }, [api, buffers, mdModes, tabs])

  useEffect(() => {
    const queued = takePendingOpen()
    if (queued !== null && queued.path !== activePath) {
      if (queued.line !== undefined) {
        pendingJump.current = { path: queued.path, line: queued.line }
        mdModes.set(queued.path, 'source')
      }
      void openPath(queued.path, queued.edit === true)
    }
  }, [activePath, mdModes, openPath])

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ path: string; line?: number; edit?: boolean }>).detail
      if (detail?.path) {
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
  }, [mdModes, openPath])

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

  const openFind = useCallback((): void => {
    if (activePath === null) return
    setFindOpen(true)
    window.requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [activePath])

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
    if (mdMode === 'preview') {
      editorRef.current?.dispose()
      editorRef.current = null
      return
    }

    let disposed = false
    const snap = appearanceStore.getSnapshot()
    void loadMonaco().then((monaco) => {
      if (disposed || hostRef.current === null) return
      editorRef.current?.dispose()
      const content = buffers.get(activePath)?.content ?? ''
      applyMonacoAppearance(monaco, snap)
      const editor = monaco.editor.create(hostRef.current, {
        value: content,
        language: languageForPath(activePath),
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: snap.fontSize,
        theme: snap.customBackground === null ? snap.theme : EDITOR_CUSTOM_THEME_ID,
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
  }, [monacoReady, monacoFailed, activePath, mdMode, buffers])

  // Live-apply theme / custom bg / font without remounting the model.
  useEffect(() => {
    if (!monacoReady || monacoFailed) return
    void loadMonaco().then((monaco) => {
      applyMonacoAppearance(monaco, appearance)
      editorRef.current?.updateOptions({ fontSize: appearance.fontSize, readOnly: !isEditing })
    })
  }, [appearance.theme, appearance.customBackground, appearance.fontSize, monacoReady, monacoFailed, isEditing])

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
      <TabStrip
        tabs={tabState.open}
        activePath={activePath}
        buffers={buffers}
        t={t}
        onActivate={(path) => tabs.activate(path)}
        onClose={onClose}
        onClosePaths={onClosePaths}
      />
      {error !== null ? <div className={css.errorBanner}>{error}</div> : null}
      <div className={css.toolbar}>
        {!isEditing ? (
          <button
            type="button"
            className={css.toolBtn}
            onClick={() => {
              if (isMarkdownPath(activePath)) mdModes.set(activePath, 'source')
              setEditingPath(activePath)
              pendingFocus.current = true
              const editor = editorRef.current
              if (editor !== null) {
                editor.updateOptions({ readOnly: false })
                editor.focus()
                pendingFocus.current = false
              }
            }}
          >{t('editorEdit')}</button>
        ) : (
          <button
            type="button"
            className={css.toolBtn}
            disabled={saving}
            onClick={() => void saveActive()}
          >
            {saving ? t('editorSaving') : t('editorSave')}
          </button>
        )}
        <button
          type="button"
          className={findOpen ? `${css.toolBtn} ${css.toolBtnActive}` : css.toolBtn}
          aria-expanded={findOpen}
          onClick={() => findOpen ? setFindOpen(false) : openFind()}
        >{t('editorFind')}</button>
        {isMarkdownPath(activePath) ? (
          <>
            <button
              type="button"
              className={mdMode === 'source' ? `${css.toolBtn} ${css.toolBtnActive}` : css.toolBtn}
              onClick={() => mdModes.set(activePath, 'source')}
            >
              {t('editorSource')}
            </button>
            <button
              type="button"
              className={mdMode === 'preview' ? `${css.toolBtn} ${css.toolBtnActive}` : css.toolBtn}
              onClick={() => mdModes.set(activePath, 'preview')}
            >
              {t('editorPreview')}
            </button>
          </>
        ) : null}
        <span className={css.status}>
          {status || (monacoFailed ? t('editorTextareaMode') : '')}
        </span>
        <div className={css.toolbarEnd}>
          <button
            type="button"
            className={appearanceOpen ? `${css.toolBtn} ${css.toolBtnActive}` : css.toolBtn}
            aria-expanded={appearanceOpen}
            aria-haspopup="dialog"
            onClick={() => setAppearanceOpen((open) => !open)}
          >
            {t('editorAppearance')}
          </button>
          {appearanceOpen ? (
            <AppearanceMenu
              t={t}
              appearance={appearance}
              store={appearanceStore}
              onClose={() => setAppearanceOpen(false)}
            />
          ) : null}
        </div>
      </div>
      <div className={css.pathBar} title={activePath} aria-label={t('editorFilePath')}>
        {activePath}
      </div>
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
        onDoubleClick={() => {
          if (activePath === null || isEditing) return
          if (isMarkdownPath(activePath)) mdModes.set(activePath, 'source')
          setEditingPath(activePath)
        }}
      >
        {mdMode === 'preview' ? (
          <MarkdownPreview content={buffer?.content ?? ''} />
        ) : monacoReady && !monacoFailed ? (
          <div className={css.monacoHost} ref={hostRef} />
        ) : (
          <textarea
            ref={textareaRef}
            className={css.textarea}
            style={{
              fontSize: appearance.fontSize,
              ...(appearance.customBackground !== null
                ? { background: appearance.customBackground }
                : {}),
            }}
            value={buffer?.content ?? ''}
            onChange={(event) => buffers.setContent(activePath, event.target.value)}
            onBlur={() => { if (isEditing) void saveActive() }}
            readOnly={!isEditing}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}

interface OpenRequest {
  readonly path: string
  readonly line?: number
  readonly edit?: boolean
}

let pendingOpen: OpenRequest | null = null

/** Consume a request queued before the editor mounted (e.g. a cross-view jump). */
function takePendingOpen(): OpenRequest | null {
  const request = pendingOpen
  pendingOpen = null
  return request
}

/** Dispatch a cross-component open request, remembered until a view handles it. */
export function requestOpenPath(path: string, line?: number, edit?: boolean): void {
  pendingOpen = { path, line, edit }
  window.dispatchEvent(new CustomEvent('file-explorer:open', { detail: { path, line, edit } }))
}
