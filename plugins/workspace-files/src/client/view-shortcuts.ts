/** Default Option+Shift+1…9 navigation across the conversation view tabs. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

const TABS_SELECTOR = '[data-conversation-tabs] [role="tab"]'
const MAX_TABS = 9

// The Desktop shell marks <html data-platform> with the host platform, so the
// shortcuts service reports `runtime: "desktop"` there and `"web"` in other
// Web transports. Either way installKeyboard feeds the DOM-backed fixed-input
// stream before its native early-return, and the shell's main process only
// intercepts registered catalog chords, so Option+Shift+digit reaches this
// observer. The combination has no configurable catalog row, so it cannot be
// handled through the settings catalog; observe the fixed stream directly.
export function installDesktopViewShortcuts(
  ctx: ClientContext,
  resolveTab: (position: number) => HTMLElement | null | undefined = position => tabButtons()[position - 1],
): () => void {
  const bridge = (window as Window & { dshDesktop?: { protocolVersion?: number } }).dshDesktop
  if (bridge?.protocolVersion !== 1 || !/mac|iphone|ipad/iu.test(navigator.platform)
    || (ctx.shortcuts.runtime !== 'web' && ctx.shortcuts.runtime !== 'desktop')) {
    return () => {}
  }
  return ctx.shortcuts.observeFixedInput((input) => {
    if (input.type !== 'keydown') return
    const { gesture, context } = input
    const isOptionShift = gesture.alt && gesture.shift && !gesture.control && !gesture.meta
    const position = Number(gesture.code.slice(-1))
    if (!/^Digit[0-9]$/u.test(gesture.code) || position < 1 || position > MAX_TABS || !isOptionShift
      || gesture.composing || gesture.defaultPrevented || context.modal !== null
      || (context.region !== 'page' && context.region !== 'editable')) return
    const tab = resolveTab(position)
    // A null result means mapping is unproven; undefined means that slot is empty.
    if (tab == null) return
    input.consume()
    if (!gesture.repeat && tab.getAttribute('aria-selected') !== 'true') tab.click()
  })
}

function tabButtons(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(TABS_SELECTOR)]
    .sort((left, right) => (Number.parseInt(left.style.order, 10) || 0) - (Number.parseInt(right.style.order, 10) || 0))
}
