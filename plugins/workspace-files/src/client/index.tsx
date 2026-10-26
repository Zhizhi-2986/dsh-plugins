/**
 * Client half: Files tab fills the conversation viewArea (composer-overlay
 * contract) with a center tree | editor split. Left sidebar stays the
 * official workspace / conversation list (no sidebar.workspaces shadow).
 */

import {
  Component,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FILE_EXPLORER_SETTINGS_NS, type FileExplorerSettings } from '../shared/settings-contract.ts'
import { createExplorerApi, TYPERT_REMOTE } from './rpc.ts'
import { editorStoresForSession } from './state/session-stores.ts'
import { ExplorerModeStore } from './state/mode.ts'
import { ExplorerPanel } from './explorer/ExplorerPanel.tsx'
import { EditorSurface, requestOpenPath } from './editor/EditorSurface.tsx'
import { ExplorerSettingsCard } from './settings/ExplorerSettingsCard.tsx'
import type {} from './settings/slot-contract.ts'
import { dictionaries, explorerT, NS } from './locales.ts'
import { useExplorerT } from './use-explorer-t.ts'
import { installOpenLinksInterceptor } from './open-links.ts'
import { installSessionRootPin } from './session-pin.ts'
import { installDesktopViewShortcuts } from './view-shortcuts.ts'
import { installDesktopTabReorder } from './tab-reorder.ts'
import css from './files-view.module.css'

const PACKAGE = 'dsh-workspace-enhanced'
export const VIEW_ID = 'workspace-files'

/** Required client services before apply runs. */
export const inject = [
  'slots',
  'remote',
  'locale',
  'connection',
  'configForms',
  'shortcuts',
]

/**
 * Mount remotes and register UI slots.
 * @param ctx - Client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  ctx.effect(() => disposeRemote, 'dsh-workspace-enhanced: remote')

  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-workspace-enhanced: dictionaries')

  const settings = ctx.configForms.get<FileExplorerSettings>(FILE_EXPLORER_SETTINGS_NS)
  ctx.effect(() => {
    const reorder = installDesktopTabReorder(ctx, settings)
    const disposeShortcuts = installDesktopViewShortcuts(ctx, reorder.resolveTab)
    return () => {
      disposeShortcuts()
      reorder.dispose()
    }
  }, 'dsh-workspace-enhanced: desktop-view-tabs')

  const mode = new ExplorerModeStore()

  ctx.inject(['remote.explorerFs'], (remoteCtx) => {
    remoteCtx.effect(
      () => installOpenLinksInterceptor(
        settings,
        () => explorerT(remoteCtx.locale.getSnapshot().active)('viewLabel'),
      ),
      'dsh-workspace-enhanced: open-links',
    )

    remoteCtx.inject(['sessions', 'uiSession'], (sessionCtx) => {
      sessionCtx.effect(
        () => installSessionRootPin(sessionCtx, mode),
        'dsh-workspace-enhanced: session-pin',
      )
    })

    // Files view owns the full column — hide the resident InputBar via the
    // conversation.composer chain (overlay keeps the draft mounted off-screen).
    // Priority 50: after approval/questions/subagent takeovers so those still win.
    remoteCtx.effect(() => {
      let disposeComposer: (() => void) | undefined

      const syncComposer = (): void => {
        const enabled = mode.getSnapshot()
        if (disposeComposer !== undefined) {
          try {
            disposeComposer()
          } catch (error) {
            console.error('[file-explorer] composer dispose failed', error)
          }
          disposeComposer = undefined
        }
        if (!enabled) return
        try {
          disposeComposer = remoteCtx.effect(() => remoteCtx.slots.register({
            name: 'conversation.composer',
            priority: 50,
            registrant: PACKAGE,
            select: () => ({ hide: true as const }),
          }, () => null), 'dsh-workspace-enhanced: composer-hide')
        } catch (error) {
          console.error('[file-explorer] conversation.composer register failed', error)
        }
      }

      syncComposer()
      const unsub = mode.subscribe(syncComposer)
      return () => {
        unsub()
        if (disposeComposer !== undefined) {
          try {
            disposeComposer()
          } catch {
            // ignore
          }
          disposeComposer = undefined
        }
      }
    }, 'dsh-workspace-enhanced: mode→composer')

    remoteCtx.slots.inject('conversation.view', () => remoteCtx.slots.register({
      name: 'conversation.view',
      id: VIEW_ID,
      order: 40,
      locale: NS,
      label: () => explorerT(remoteCtx.locale.getSnapshot().active)('viewLabel'),
      registrant: PACKAGE,
    }, () => (
      <FilesView
        ctx={remoteCtx}
        mode={mode}
      />
    )))

    const t = remoteCtx.locale.bind(NS)
    remoteCtx.effect(() => remoteCtx.configForms.whileServed([FILE_EXPLORER_SETTINGS_NS], () => remoteCtx.slots.inject('plugins.item', () => remoteCtx.slots.register({
      name: 'plugins.item',
      id: 'workspace-files',
      order: 45,
      label: () => t('settingsTitle'),
      locale: NS,
      registrant: PACKAGE,
    }, (props) => (
      <ExplorerSettingsCard
        ctx={remoteCtx}
        scope={settings as ConfigForm<FileExplorerSettings>}
        {...props}
      />
    )))), 'dsh-workspace-enhanced: plugins.item')
  })
}

class FilesViewBoundary extends Component<
  { readonly children: ReactNode },
  { readonly message: string | null }
> {
  override state: { readonly message: string | null } = { message: null }

  static getDerivedStateFromError(error: Error): { readonly message: string } {
    return { message: error.message }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[file-explorer] FilesView crash', error, info)
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <div
          className={css.shell}
          data-file-explorer-view=""
          data-conversation-composer-overlay=""
        >
          <div className={css.crash}>{this.state.message}</div>
        </div>
      )
    }
    return this.props.children
  }
}

const TREE_WIDTH_KEY = 'dsh-workspace-enhanced:tree-width'
const TREE_WIDTH_DEFAULT = 280
const TREE_WIDTH_MIN = 160
const TREE_WIDTH_MAX = 720

function readTreeWidth(): number {
  try {
    const raw = window.localStorage.getItem(TREE_WIDTH_KEY)
    if (raw === null) return TREE_WIDTH_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return TREE_WIDTH_DEFAULT
    return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(n)))
  } catch {
    return TREE_WIDTH_DEFAULT
  }
}

/**
 * Files conversation view. The root MUST carry
 * `data-conversation-composer-overlay` so ConversationRoot stretches
 * `.viewArea`; without it the pane collapses to zero height.
 */
function FilesView(props: {
  readonly ctx: ClientContext
  readonly mode: ExplorerModeStore
}): ReactElement {
  const { ctx, mode } = props
  const uiSession = ctx.get('uiSession')
  const subscribeSession = useCallback((listener: () => void) => (
    uiSession?.adapter.current.subscribe(listener) ?? (() => {})
  ), [uiSession])
  const getSessionId = useCallback(() => (
    uiSession?.adapter.current.getSnapshot().key as string | null | undefined ?? null
  ), [uiSession])
  const sessionId = useSyncExternalStore(subscribeSession, getSessionId)
  const api = useMemo(() => createExplorerApi(ctx, sessionId), [ctx, sessionId])
  const { tabs, buffers, mdModes } = editorStoresForSession(sessionId)
  const t = useExplorerT(ctx)
  const [treeWidth, setTreeWidth] = useState(TREE_WIDTH_DEFAULT)
  const dragRef = useRef<{ readonly startX: number; readonly startWidth: number } | null>(null)

  useLayoutEffect(() => {
    setTreeWidth(readTreeWidth())
  }, [])

  useLayoutEffect(() => {
    mode.setEnabled(true)
    return () => {
      mode.setEnabled(false)
    }
  }, [mode])

  const onResizePointerDown = useCallback((event: {
    preventDefault: () => void
    currentTarget: HTMLDivElement
    pointerId: number
    clientX: number
  }): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: treeWidth }
  }, [treeWidth])

  const onResizePointerMove = useCallback((event: { clientX: number }): void => {
    const drag = dragRef.current
    if (drag === null) return
    const next = Math.min(
      TREE_WIDTH_MAX,
      Math.max(TREE_WIDTH_MIN, drag.startWidth + (event.clientX - drag.startX)),
    )
    setTreeWidth(next)
  }, [])

  const onResizePointerUp = useCallback((event: {
    currentTarget: HTMLDivElement
    pointerId: number
  }): void => {
    if (dragRef.current === null) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
    setTreeWidth((width) => {
      try {
        window.localStorage.setItem(TREE_WIDTH_KEY, String(width))
      } catch {
        // ignore
      }
      return width
    })
  }, [])

  return (
    <FilesViewBoundary>
      <div
        className={css.shell}
        data-file-explorer-view=""
        data-conversation-composer-overlay=""
      >
        <div className={css.filesView}>
          <aside
            className={css.treeCol}
            style={{ width: treeWidth }}
            aria-label={t('treeAriaLabel')}
          >
            <ExplorerPanel
              key={sessionId ?? 'no-session'}
              ctx={ctx}
              api={api}
              tabs={tabs}
              buffers={buffers}
              onOpenFile={(path, line, edit) => {
                requestOpenPath(path, line, edit)
              }}
            />
            <div
              className={css.treeResize}
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={treeWidth}
              aria-valuemin={TREE_WIDTH_MIN}
              aria-valuemax={TREE_WIDTH_MAX}
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
          </aside>
          <div className={css.editorCol}>
            <EditorSurface key={sessionId ?? 'no-session'} ctx={ctx} api={api} tabs={tabs} buffers={buffers} mdModes={mdModes} />
          </div>
        </div>
      </div>
    </FilesViewBoundary>
  )
}
