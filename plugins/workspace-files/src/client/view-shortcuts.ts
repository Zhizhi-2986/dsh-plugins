/** One configurable modifier plus the fixed 1–9 view-selection keys. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FileExplorerSettings } from '../shared/settings-contract.ts'

const TABS_SELECTOR = '[data-conversation-tabs] [role="tab"]'
const MAX_TABS = 9

export function installDesktopViewShortcuts(
  ctx: ClientContext,
  resolveTab: (position: number) => HTMLElement | null | undefined = position => tabButtons()[position - 1],
  settings?: ConfigForm<FileExplorerSettings>,
): () => void {
  const bridge = (window as Window & { dshDesktop?: { protocolVersion?: number } }).dshDesktop
  if (bridge?.protocolVersion !== 1
    || !/mac|win|linux/iu.test(navigator.platform)
    || (ctx.shortcuts.runtime !== 'web' && ctx.shortcuts.runtime !== 'desktop')) return () => {}
  return ctx.shortcuts.observeFixedInput((input) => {
    if (input.type !== 'keydown') return
    const { gesture, context } = input
    const modifier = settings?.getSnapshot().value?.viewTabModifier ?? 'alt-shift'
    const matches = modifier === 'alt-shift'
      ? gesture.alt && gesture.shift && !gesture.control && !gesture.meta
      : modifier === 'control-shift'
        ? gesture.control && gesture.shift && !gesture.alt && !gesture.meta
        : gesture.meta && gesture.shift && !gesture.alt && !gesture.control
    const position = Number(gesture.code.slice(-1))
    if (!matches || !/^Digit[1-9]$/u.test(gesture.code) || position > MAX_TABS
      || gesture.composing || gesture.defaultPrevented || context.modal !== null
      || (context.region !== 'page' && context.region !== 'editable')) return
    const tab = resolveTab(position)
    if (tab == null) return
    input.consume()
    if (!gesture.repeat && tab.getAttribute('aria-selected') !== 'true') tab.click()
  })
}

function tabButtons(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(TABS_SELECTOR)]
    .sort((left, right) => (Number.parseInt(left.style.order, 10) || 0) - (Number.parseInt(right.style.order, 10) || 0))
}
