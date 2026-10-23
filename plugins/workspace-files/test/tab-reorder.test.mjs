import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.HTMLElement = dom.window.HTMLElement
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
window.dshDesktop = { protocolVersion: 1 }

const { installDesktopTabReorder } = await import('../lib/client/tab-reorder.js')
const { installDesktopViewShortcuts } = await import('../lib/client/view-shortcuts.js')

const VIEWS = [
  { id: 'chat', label: 'Chat' },
  { id: 'git', label: 'Git' },
  { id: 'workspace-files', label: 'Files' },
]

function mountTabs(labels = VIEWS.map(view => view.label)) {
  document.body.innerHTML = `<div data-conversation-tabs role="tablist">${labels.map((label, index) =>
    `<button role="tab" aria-selected="${index === 0}">${label}</button>`).join('')}</div>`
  const clicks = []
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener('click', () => {
      clicks.push(tab.textContent)
      for (const other of document.querySelectorAll('[role="tab"]')) {
        other.setAttribute('aria-selected', String(other === tab))
      }
    })
  }
  return { tabs: [...document.querySelectorAll('[role="tab"]')], clicks }
}

function fixture({ enabled = true, order = [], views = VIEWS, writable = true, acceptWrites = true } = {}) {
  let value = { reorderViewTabs: enabled, viewTabOrder: [...order], openLinksInEditor: true }
  const listeners = new Set()
  const writes = []
  const settings = {
    getSnapshot: () => ({ status: 'ready', writable, value }),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async set(field, next) {
      writes.push([field, next])
      if (!writable || !acceptWrites) return false
      value = { ...value, [field]: next }
      for (const listener of listeners) listener()
      return true
    },
  }
  const ctx = {
    slots: {
      entries: () => views.map(({ id, label }) => ({ options: { id, label } })),
      subscribe: () => () => {},
    },
    configForms: { developerTools: { enabled: { getSnapshot: () => false, subscribe: () => () => {} } } },
    locale: { subscribe: () => () => {} },
    shortcuts: { runtime: 'web', observeFixedInput: () => () => {} },
  }
  return {
    settings, ctx, writes,
    setEnabled(next) {
      value = { ...value, reorderViewTabs: next }
      for (const listener of listeners) listener()
    },
  }
}

function drag(source, target, x = 0) {
  const transfer = { setData() {}, effectAllowed: '', dropEffect: '' }
  const event = (type, element) => {
    const result = new window.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(result, { dataTransfer: { value: transfer }, clientX: { value: x } })
    element.dispatchEvent(result)
    return result
  }
  event('dragstart', source)
  event('dragover', target)
  event('drop', target)
  event('dragend', source)
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test('disabled prototype leaves native tab buttons untouched and can be enabled or disabled', () => {
  const { tabs } = mountTabs()
  const f = fixture({ enabled: false, order: ['workspace-files', 'chat', 'git'] })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    assert.deepEqual(tabs.map(tab => tab.style.order), ['', '', ''])
    assert.deepEqual(tabs.map(tab => tab.draggable), [false, false, false])
    f.setEnabled(true)
    assert.deepEqual(tabs.map(tab => tab.style.order), ['1', '2', '0'])
    assert.deepEqual(tabs.map(tab => tab.draggable), [true, true, true])
    assert.deepEqual(tabs.map(tab => tab.style.cursor), ['grab', 'grab', 'grab'])
    f.setEnabled(false)
    assert.deepEqual(tabs.map(tab => tab.style.order), ['', '', ''])
    assert.deepEqual(tabs.map(tab => tab.draggable), [false, false, false])
    assert.deepEqual(tabs.map(tab => tab.style.cursor), ['', '', ''])
  } finally { controller.dispose() }
})

test('drag changes visual order and persisted ids without changing selected view or DOM order', async () => {
  const { tabs, clicks } = mountTabs()
  const f = fixture()
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    drag(tabs[2], tabs[0])
    await settle()
    assert.deepEqual(tabs.map(tab => tab.textContent), ['Chat', 'Git', 'Files'])
    assert.deepEqual(tabs.map(tab => tab.style.order), ['1', '2', '0'])
    assert.deepEqual(f.writes, [['viewTabOrder', ['workspace-files', 'chat', 'git']]])
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true')
    assert.deepEqual(clicks, [])
    assert.equal(controller.resolveTab(1), tabs[2])
  } finally { controller.dispose() }
})

test('suppresses the browser click generated on the drag source after drop', async () => {
  const { tabs, clicks } = mountTabs()
  const f = fixture()
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    drag(tabs[2], tabs[0])
    await settle()
    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    tabs[2].dispatchEvent(click)
    assert.equal(click.defaultPrevented, true)
    assert.deepEqual(clicks, [])
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true')
    tabs[0].dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
    const nextClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    tabs[0].dispatchEvent(nextClick)
    assert.deepEqual(clicks, ['Chat'])
  } finally { controller.dispose() }
})

test('ordinary user click still selects a tab when reordering is enabled', () => {
  const { tabs, clicks } = mountTabs()
  const f = fixture()
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    tabs[2].dispatchEvent(click)
    assert.deepEqual(clicks, ['Files'])
    assert.equal(tabs[2].getAttribute('aria-selected'), 'true')
  } finally { controller.dispose() }
})

test('keeps a hidden Trajectory view in persisted rank when visible tabs move', async () => {
  const { tabs } = mountTabs()
  const views = [VIEWS[0], { id: 'trajectory', label: 'Trajectory' }, ...VIEWS.slice(1)]
  const f = fixture({ views, order: ['chat', 'trajectory', 'git', 'workspace-files'] })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    drag(tabs[2], tabs[0])
    await settle()
    assert.deepEqual(f.writes, [['viewTabOrder', ['workspace-files', 'trajectory', 'chat', 'git']]])
  } finally { controller.dispose() }
})

test('restores saved order after the native tablist is replaced', async () => {
  mountTabs()
  const f = fixture({ order: ['git', 'workspace-files', 'chat'] })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    const next = mountTabs()
    await settle()
    assert.deepEqual(next.tabs.map(tab => tab.style.order), ['2', '0', '1'])
    assert.equal(controller.resolveTab(1), next.tabs[1])
  } finally { controller.dispose() }
})

test('does not attach dragging or route shortcuts when registered labels disagree with the native tabs', () => {
  const { tabs } = mountTabs(['Chat', 'Other', 'Files'])
  const f = fixture({ order: ['workspace-files', 'chat', 'git'] })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    assert.deepEqual(tabs.map(tab => tab.draggable), [false, false, false])
    assert.deepEqual(tabs.map(tab => tab.style.order), ['', '', ''])
    assert.equal(controller.resolveTab(1), null)
    drag(tabs[2], tabs[0])
    assert.deepEqual(f.writes, [])
  } finally { controller.dispose() }
})

test('multiple native tablists fail closed instead of selecting an arbitrary session', () => {
  const { tabs } = mountTabs()
  document.body.insertAdjacentHTML('beforeend', '<div data-conversation-tabs role="tablist"><button role="tab">Chat</button><button role="tab">Git</button><button role="tab">Files</button></div>')
  const f = fixture({ order: ['workspace-files', 'chat', 'git'] })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    assert.equal(controller.resolveTab(1), null)
    assert.deepEqual(tabs.map(tab => tab.draggable), [false, false, false])
  } finally { controller.dispose() }
})

test('shortcut follows a dragged visual order through the installed fixed-input stream', async () => {
  const { tabs, clicks } = mountTabs()
  const f = fixture()
  let dispatch
  f.ctx.shortcuts.observeFixedInput = listener => { dispatch = listener; return () => { dispatch = undefined } }
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  const disposeShortcut = installDesktopViewShortcuts(f.ctx, controller.resolveTab)
  try {
    drag(tabs[2], tabs[0])
    await settle()
    let consumed = false
    dispatch({
      type: 'keydown',
      gesture: { code: 'Digit1', alt: true, shift: true, control: false, meta: false, composing: false, defaultPrevented: false, repeat: false },
      context: { modal: null, region: 'page' },
      consume: () => { consumed = true },
    })
    assert.equal(consumed, true)
    assert.deepEqual(clicks, ['Files'])
  } finally { disposeShortcut(); controller.dispose() }
})

test('persists the same order when a fresh controller mounts after reload', async () => {
  const { tabs } = mountTabs()
  const f = fixture()
  const first = installDesktopTabReorder(f.ctx, f.settings)
  drag(tabs[2], tabs[0])
  await settle()
  first.dispose()
  const second = installDesktopTabReorder(f.ctx, f.settings)
  try {
    assert.deepEqual(tabs.map(tab => tab.style.order), ['1', '2', '0'])
    assert.equal(second.resolveTab(1), tabs[2])
  } finally { second.dispose() }
})

test('read-only settings do not advertise drag capability', () => {
  const { tabs } = mountTabs()
  const f = fixture({ writable: false })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    assert.deepEqual(tabs.map(tab => tab.draggable), [false, false, false])
    assert.equal(controller.resolveTab(1), tabs[0])
  } finally { controller.dispose() }
})

test('rejected settings write restores prior visual order and disposal restores native attributes', async () => {
  const { tabs } = mountTabs()
  const f = fixture({ acceptWrites: false })
  const controller = installDesktopTabReorder(f.ctx, f.settings)
  try {
    drag(tabs[2], tabs[0])
    await settle()
    assert.deepEqual(tabs.map(tab => tab.style.order), ['0', '1', '2'])
  } finally { controller.dispose() }
  assert.deepEqual(tabs.map(tab => tab.style.order), ['', '', ''])
  assert.deepEqual(tabs.map(tab => tab.draggable), [false, false, false])
})
