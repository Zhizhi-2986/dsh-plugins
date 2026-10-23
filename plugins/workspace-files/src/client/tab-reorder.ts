/** Desktop-only experiment: visually reorder the host's tabs without moving React nodes. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FileExplorerSettings } from '../shared/settings-contract.ts'

const TABLIST = '[data-conversation-tabs]'
const TAB = ':scope > [role="tab"]'
const MAX_SAVED_IDS = 100
const CLICK_GUARD_MS = 150

type NativeTab = { readonly id: string; readonly element: HTMLElement }
type OriginalStyle = { readonly order: string; readonly cursor: string; readonly draggable: boolean }

function visibleTabs(ctx: ClientContext): NativeTab[] | null {
  const lists = document.querySelectorAll(TABLIST)
  if (lists.length !== 1) return null
  const list = lists[0]!
  const buttons = [...list.querySelectorAll<HTMLElement>(TAB)]
  const showTrajectory = ctx.configForms.developerTools.enabled.getSnapshot()
  const entries = ctx.slots.entries('conversation.view')
    .filter(entry => entry.options.id !== undefined && (showTrajectory || entry.options.id !== 'trajectory'))
  if (entries.length !== buttons.length || new Set(entries.map(entry => entry.options.id)).size !== entries.length) return null
  const tabs: NativeTab[] = []
  for (const [index, entry] of entries.entries()) {
    const id = entry.options.id
    const button = buttons[index]
    if (id === undefined || button === undefined) return null
    let label: string
    try {
      label = typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label ?? id
    } catch {
      return null
    }
    // The host does not render data-view-id; never guess from localized/duplicate text.
    if (button.textContent?.trim() !== label.trim()) return null
    tabs.push({ id, element: button })
  }
  return tabs
}

function savedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200)
  return [...new Set(ids)].slice(0, MAX_SAVED_IDS)
}

function ordered(tabs: readonly NativeTab[], ids: readonly string[]): NativeTab[] {
  const ranks = new Map(ids.map((id, index) => [id, index]))
  return [...tabs].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity))
}

function retainHidden(saved: readonly string[], visible: readonly string[]): string[] {
  const present = new Set(visible)
  const alreadySaved = new Set(saved)
  let next = 0
  return [...saved.map(id => present.has(id) ? visible[next++]! : id), ...visible.filter(id => !alreadySaved.has(id))]
}

function nativeTab(position: number): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`${TABLIST} [role="tab"]`)][position - 1]
}

export interface TabReorderController {
  readonly resolveTab: (position: number) => HTMLElement | null | undefined
  readonly dispose: () => void
}

/** Enable only when the installed Desktop marker and plugin setting both allow it. */
export function installDesktopTabReorder(
  ctx: ClientContext,
  settings: ConfigForm<FileExplorerSettings>,
): TabReorderController {
  const bridge = (window as Window & { dshDesktop?: { protocolVersion?: number } }).dshDesktop
  if (bridge?.protocolVersion !== 1) {
    return { resolveTab: nativeTab, dispose: () => {} }
  }

  const changed = new Map<HTMLElement, OriginalStyle>()
  let current: NativeTab[] | null = null
  let optimistic: string[] | null = null
  let dragging: string | null = null
  const suppressedClickIds = new Set<string>()
  let suppressUntil = 0
  let pendingWrite = false
  let disposed = false
  let observing = false

  const enabled = (): boolean => settings.getSnapshot().status === 'ready'
    && settings.getSnapshot().value?.reorderViewTabs === true

  const clear = (): void => {
    for (const [button, original] of changed) {
      button.style.order = original.order
      button.style.cursor = original.cursor
      button.draggable = original.draggable
    }
    changed.clear()
    current = null
  }

  const refresh = (): void => {
    if (disposed || !enabled()) {
      if (observing) { observer.disconnect(); observing = false }
      clear()
      return
    }
    if (!observing) {
      observer.observe(document.body, { childList: true, characterData: true, subtree: true })
      observing = true
    }
    const tabs = visibleTabs(ctx)
    if (tabs === null) { clear(); return }
    const live = new Set(tabs.map(tab => tab.element))
    for (const [button, original] of changed) {
      if (live.has(button)) continue
      button.style.order = original.order
      button.style.cursor = original.cursor
      button.draggable = original.draggable
      changed.delete(button)
    }
    const order = ordered(tabs, optimistic ?? savedIds(settings.getSnapshot().value?.viewTabOrder))
    for (const [rank, { element }] of order.entries()) {
      if (!changed.has(element)) changed.set(element, {
        order: element.style.order,
        cursor: element.style.cursor,
        draggable: element.draggable,
      })
      element.style.order = String(rank)
      element.style.cursor = 'grab'
      element.draggable = settings.getSnapshot().writable
    }
    current = tabs
  }

  const tabForEvent = (event: Event): NativeTab | undefined => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return undefined
    const element = target.closest<HTMLElement>(`${TABLIST} [role="tab"]`)
    return current?.find(tab => tab.element === element)
  }

  const onDragStart = (event: DragEvent): void => {
    refresh()
    const source = tabForEvent(event)
    if (pendingWrite || !settings.getSnapshot().writable || source === undefined) return
    dragging = source.id
    source.element.style.cursor = 'grabbing'
    suppressUntil = 0
    suppressedClickIds.clear()
    suppressedClickIds.add(source.id)
    event.dataTransfer?.setData('text/plain', source.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (event: DragEvent): void => {
    const target = tabForEvent(event)
    if (dragging === null || target === undefined || target.id === dragging) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (event: DragEvent): void => {
    const target = tabForEvent(event)
    if (dragging === null || target === undefined || target.id === dragging || current === null) return
    event.preventDefault()
    event.stopPropagation()
    suppressedClickIds.add(target.id)
    const visible = ordered(current, optimistic ?? savedIds(settings.getSnapshot().value?.viewTabOrder)).map(tab => tab.id)
    const moved = visible.filter(id => id !== dragging)
    const bounds = target.element.getBoundingClientRect()
    const insertAfter = bounds.width > 0 && event.clientX >= bounds.left + bounds.width / 2
    moved.splice(moved.indexOf(target.id) + Number(insertAfter), 0, dragging)
    const next = retainHidden(savedIds(settings.getSnapshot().value?.viewTabOrder), moved)
    if (next.length > MAX_SAVED_IDS) return
    optimistic = next
    pendingWrite = true
    refresh()
    void settings.set('viewTabOrder', next).then((accepted) => {
      if (!accepted) console.warn('[file-explorer] tab order was not saved')
    }).catch((error: unknown) => {
      console.error('[file-explorer] tab order save failed', error)
    }).finally(() => {
      pendingWrite = false
      optimistic = null
      refresh()
    })
  }

  const onDragEnd = (): void => {
    if (dragging !== null) suppressUntil = Date.now() + CLICK_GUARD_MS
    dragging = null
  }

  const onPointerDown = (): void => {
    if (dragging !== null) return
    suppressedClickIds.clear()
    suppressUntil = 0
  }

  const onClick = (event: MouseEvent): void => {
    if (event.detail === 0) return
    const tab = tabForEvent(event)
    if (tab === undefined) return
    const isRecentDragClick = Date.now() <= suppressUntil && suppressedClickIds.has(tab.id)
    if (dragging === null && !isRecentDragClick) return
    if (!suppressedClickIds.has(tab.id)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    suppressedClickIds.clear()
    suppressUntil = 0
  }

  const unsubscribeSettings = settings.subscribe(refresh)
  const unsubscribeSlots = ctx.slots.subscribe('conversation.view', refresh)
  const unsubscribeDeveloperTools = ctx.configForms.developerTools.enabled.subscribe(refresh)
  const unsubscribeLocale = ctx.locale.subscribe(refresh)
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('dragstart', onDragStart, true)
  document.addEventListener('dragover', onDragOver, true)
  document.addEventListener('drop', onDrop, true)
  document.addEventListener('dragend', onDragEnd, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('click', onClick, true)
  refresh()

  return {
    resolveTab(position) {
      if (!enabled()) return nativeTab(position)
      refresh()
      if (current === null) return null
      return ordered(current, optimistic ?? savedIds(settings.getSnapshot().value?.viewTabOrder))[position - 1]?.element
    },
    dispose() {
      disposed = true
      observer.disconnect()
      unsubscribeSettings()
      unsubscribeSlots()
      unsubscribeDeveloperTools()
      unsubscribeLocale()
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('dragend', onDragEnd, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      clear()
    },
  }
}
