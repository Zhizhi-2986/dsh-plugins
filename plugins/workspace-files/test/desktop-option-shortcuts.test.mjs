import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })

const { installDesktopViewShortcuts } = await import('../lib/client/view-shortcuts.js')

function mountTabs() {
  document.body.innerHTML = '<div data-conversation-tabs><button role="tab" aria-selected="true">对话</button><button role="tab" aria-selected="false">文件</button></div>'
  const fileTab = document.querySelectorAll('[role="tab"]')[1]
  let clicks = 0
  fileTab.addEventListener('click', () => { clicks += 1 })
  return () => clicks
}

function input(code, overrides = {}) {
  let consumed = 0
  return {
    event: {
      type: 'keydown',
      gesture: {
        code, alt: true, shift: true, control: false, meta: false,
        composing: false, defaultPrevented: false, repeat: false,
        ...overrides.gesture,
      },
      context: { region: 'editable', modal: null, target: null, ...overrides.context },
      consume: () => { consumed += 1 },
    },
    consumed: () => consumed,
  }
}

test('Desktop-marked macOS Web transport handles Option+Shift+digit from editable input', () => {
  window.dshDesktop = { protocolVersion: 1 }
  const clicks = mountTabs()
  let listener
  let disposed = false
  const ctx = { shortcuts: { runtime: 'web', observeFixedInput(callback) {
    listener = callback
    return () => { disposed = true }
  } } }
  const dispose = installDesktopViewShortcuts(ctx)
  try {
    assert.equal(typeof listener, 'function')
    const shortcut = input('Digit2')
    listener(shortcut.event)
    assert.equal(clicks(), 1)
    assert.equal(shortcut.consumed(), 1)
    for (const event of [
      input('Digit2', { gesture: { alt: true, shift: true, meta: true } }),
      input('Digit2', { gesture: { meta: true, alt: false, shift: false } }),
      input('Digit2', { gesture: { composing: true } }),
      input('Digit2', { gesture: { defaultPrevented: true } }),
      input('Digit2', { context: { modal: 'approval' } }),
      input('Digit2', { context: { region: 'terminal' } }),
      input('Digit0'),
    ]) {
      listener(event.event)
      assert.equal(event.consumed(), 0)
    }
    assert.equal(clicks(), 1)
    const missing = input('Digit5')
    listener(missing.event)
    assert.equal(missing.consumed(), 0)
    assert.equal(clicks(), 1)
  } finally {
    dispose()
    delete window.dshDesktop
  }
  assert.equal(disposed, true)
})

test('does not install local bindings outside the installed macOS Desktop Web transport', () => {
  let registrations = 0
  const ctx = { shortcuts: { runtime: 'web', observeFixedInput() { registrations += 1; return () => {} } } }
  for (const [bridge, platform, runtime] of [
    [undefined, 'MacIntel', 'web'],
    [{ protocolVersion: 1 }, 'Win32', 'web'],
    [{ protocolVersion: 1 }, 'MacIntel', 'desktop'],
  ]) {
    if (bridge === undefined) delete window.dshDesktop
    else window.dshDesktop = bridge
    Object.defineProperty(navigator, 'platform', { configurable: true, value: platform })
    ctx.shortcuts.runtime = runtime
    installDesktopViewShortcuts(ctx)()
  }
  assert.equal(registrations, 0)
  delete window.dshDesktop
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
})
