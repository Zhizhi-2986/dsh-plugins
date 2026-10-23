/** Refresh the tree when the active Session workspace changes. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { notifyRootPinned } from './root-events.ts'
import type { ExplorerModeStore } from './state/mode.ts'

/** Session identity, not a client-selected path, scopes every workspace RPC. */
export function installSessionRootPin(ctx: Context, mode: ExplorerModeStore): () => void {
  const uiSession = ctx.get('uiSession')
  if (uiSession === undefined) return () => {}

  let lastSessionId: string | undefined
  const sync = (): void => {
    const current = uiSession.adapter.current.getSnapshot().key as SessionId | undefined
    if (current === undefined || current === lastSessionId) return
    lastSessionId = current
    if (mode.getSnapshot()) notifyRootPinned()
  }

  sync()
  const unsubBinding = uiSession.adapter.current.subscribe(sync)
  const unsubMode = mode.subscribe(() => {
    if (mode.getSnapshot()) sync()
  })
  return () => {
    unsubBinding()
    unsubMode()
  }
}
