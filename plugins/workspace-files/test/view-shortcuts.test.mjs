import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
window.dshDesktop = { protocolVersion: 1 }

const { installDesktopViewShortcuts } = await import('../lib/client/view-shortcuts.js')

function mountTabs(labels, activeIndex) {
  document.body.innerHTML = `
    <div data-conversation-tabs="" role="tablist">
      ${labels.map((label, index) => `<button type="button" role="tab" aria-selected="${index === activeIndex}" data-label="${label}">${label}</button>`).join('')}
    </div>
  `
  const clicks = []
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener('click', () => {
      clicks.push(tab.dataset.label)
      for (const other of document.querySelectorAll('[role="tab"]')) {
        other.setAttribute('aria-selected', String(other === tab))
      }
    })
  }
  return clicks
}

function createInput(code, overrides = {}) {
  let consumed = false
  const event = {
    type: 'keydown',
    gesture: {
      code, alt: true, shift: true, control: false, meta: false,
      composing: false, defaultPrevented: false, repeat: false,
      ...overrides.gesture,
    },
    context: { region: 'page', modal: null, target: null, ...overrides.context },
    consume: () => { consumed = true },
  }
  return { event, wasConsumed: () => consumed }
}

function mountShortcutListener() {
  let listener
  let registrations = 0
  const ctx = {
    shortcuts: {
      runtime: 'web',
      register() { registrations += 1; throw new Error('view actions must not be registered in settings') },
      observeFixedInput(callback) {
        listener = callback
        return () => { listener = undefined }
      },
    },
  }
  const dispose = installDesktopViewShortcuts(ctx)
  return {
    dispatch: (input) => listener?.(input),
    dispose,
    get registrations() { return registrations },
  }
}

test('Option+Shift+1…9 switch to the matching conversation view tab', () => {
  const clicks = mountTabs(['对话', '上下文', 'Git Plus', '行情', '文件', '视图6', '视图7', '视图8', '视图9'], 0)
  const shortcut = mountShortcutListener()
  try {
    for (let position = 1; position <= 9; position += 1) {
      const input = createInput(`Digit${position}`)
      shortcut.dispatch(input.event)
      assert.equal(input.wasConsumed(), true)
    }
    assert.deepEqual(clicks, ['上下文', 'Git Plus', '行情', '文件', '视图6', '视图7', '视图8', '视图9'])
    const repeated = createInput('Digit2', { gesture: { repeat: true } })
    shortcut.dispatch(repeated.event)
    assert.equal(repeated.wasConsumed(), true)
    assert.equal(clicks.length, 8)
    assert.equal(shortcut.registrations, 0)
  } finally { shortcut.dispose() }
})

test('numbers tabs by CSS visual order without moving React-owned buttons', () => {
  const clicks = mountTabs(['对话', '文件', 'Git Plus'], 0)
  const shortcut = mountShortcutListener()
  try {
    const tabs = document.querySelectorAll('[data-conversation-tabs] [role="tab"]')
    tabs[0].style.order = '2'
    tabs[1].style.order = '0'
    tabs[2].style.order = '1'

    const pointerInput = createInput('Digit2')
    pointerInput.event.type = 'pointerdown'
    shortcut.dispatch(pointerInput.event)
    assert.equal(pointerInput.wasConsumed(), false)
    assert.deepEqual(clicks, [])

    const firstTab = createInput('Digit1')
    shortcut.dispatch(firstTab.event)
    assert.equal(firstTab.wasConsumed(), true)
    assert.deepEqual(clicks, ['文件'])
  } finally { shortcut.dispose() }
})

test('ignores keys with extra modifiers, non-digits, missing views, modals, or terminal focus', () => {
  mountTabs(['对话', '文件'], 0)
  const shortcut = mountShortcutListener()
  try {
    for (const input of [
      createInput('Digit2', { gesture: { meta: true } }),
      createInput('Digit2', { gesture: { control: true } }),
      createInput('Digit2', { context: { modal: 'approval' } }),
      createInput('Digit2', { context: { region: 'terminal' } }),
      createInput('Digit2', { gesture: { composing: true } }),
      createInput('Digit2', { gesture: { defaultPrevented: true } }),
      createInput('Digit0'),
      createInput('KeyA'),
    ]) {
      shortcut.dispatch(input.event)
      assert.equal(input.wasConsumed(), false)
    }
    const missing = createInput('Digit9', { context: { region: 'editable' } })
    shortcut.dispatch(missing.event)
    assert.equal(missing.wasConsumed(), false)
    assert.equal(shortcut.registrations, 0)
  } finally { shortcut.dispose() }
})
