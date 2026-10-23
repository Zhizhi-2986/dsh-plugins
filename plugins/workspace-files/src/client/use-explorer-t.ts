/** Subscribe to active locale and return an explorer translate function. */

import { useMemo, useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { explorerT, type ExplorerTranslate } from './locales.ts'

/**
 * Reactive `t` for file-explorer copy.
 *
 * The result is memoized per locale: callers put `t` in effect and callback
 * dependency lists, so a fresh closure every render would rebuild editors.
 */
export function useExplorerT(ctx: ClientContext): ExplorerTranslate {
  const locale = useSyncExternalStore(
    (listener) => ctx.locale.subscribe(listener),
    () => ctx.locale.getSnapshot().active,
  )
  return useMemo(() => explorerT(locale), [locale])
}
