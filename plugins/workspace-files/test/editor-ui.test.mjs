import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { Simulate } from 'react-dom/test-utils'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.CustomEvent = dom.window.CustomEvent
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Monaco cannot load in jsdom; force the textarea fallback instead of waiting out the CDN timeout.
dom.window.require = undefined
const { EditorSurface, requestOpenPath } = await import('../lib/client/editor/EditorSurface.js')
const { TabsStore } = await import('../lib/client/state/tabs.js')
const { BuffersStore } = await import('../lib/client/state/buffers.js')
const { MdModeStore } = await import('../lib/client/state/md-mode.js')

const flush = async (ms = 20) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) }) }

function fire(element, type, init = {}) {
  const EventCtor = type.startsWith('key') ? dom.window.KeyboardEvent : type.startsWith('mouse') || type === 'dblclick' ? dom.window.MouseEvent : dom.window.Event
  element.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function button(label) {
  return [...document.querySelectorAll('button')].find((item) => item.textContent === label || item.getAttribute('aria-label') === label)
}

async function mountEditor({ path = 'note.md', content = 'Hello **world**', sessionId, request = true } = {}) {
  dom.window.require = undefined
  const tabs = new TabsStore()
  const buffers = new BuffersStore()
  const mdModes = new MdModeStore()
  const writes = []
  const api = {
    read: async () => ({ ok: true, value: { content, version: 'v1' } }),
    write: async (...args) => {
      writes.push(args)
      return { ok: true, value: { version: `v${writes.length + 1}` } }
    },
  }
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const root = createRoot(document.getElementById('app'))
  await act(async () => root.render(React.createElement(EditorSurface, { ctx, api, tabs, buffers, mdModes, sessionId })))
  if (request) await act(async () => requestOpenPath(path, undefined, false, sessionId))
  await flush()
  return {
    path, root, tabs, buffers, mdModes, writes,
    cleanup: async () => { await act(async () => root.unmount()); document.getElementById('app').replaceChildren() },
  }
}

async function typeIntoTextarea(value) {
  const textarea = document.querySelector('textarea')
  assert.ok(textarea, 'editor should render a textarea when Monaco is unavailable')
  await act(async () => Simulate.change(textarea, { target: { value } }))
  return textarea
}

test('opens a path that was requested before the editor mounted', async () => {
  dom.window.localStorage.clear()
  const tabs = new TabsStore()
  const buffers = new BuffersStore()
  const mdModes = new MdModeStore()
  const api = {
    read: async () => ({ ok: true, value: { content: 'queued content', version: 'v1' } }),
    write: async () => ({ ok: true, value: { version: 'v2' } }),
  }
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  await act(async () => requestOpenPath('queued.txt'))
  const root = createRoot(document.getElementById('app'))
  try {
    await act(async () => root.render(React.createElement(EditorSurface, { ctx, api, tabs, buffers, mdModes })))
    await flush(40)
    assert.deepEqual(tabs.getSnapshot().open.map((tab) => tab.path), ['queued.txt'])
    assert.equal(buffers.get('queued.txt')?.content, 'queued content')
  } finally {
    await act(async () => root.unmount())
    document.getElementById('app').replaceChildren()
  }
})

test('keeps queued file-open requests scoped to their originating Session', async () => {
  await act(async () => requestOpenPath('session-a.md', undefined, false, 'session-a'))
  const otherSession = await mountEditor({ sessionId: 'session-b', request: false })
  try {
    assert.deepEqual(otherSession.tabs.getSnapshot().open, [])
  } finally { await otherSession.cleanup() }

  const targetSession = await mountEditor({ sessionId: 'session-a', request: false })
  try {
    await flush()
    assert.deepEqual(targetSession.tabs.getSnapshot().open.map((tab) => tab.path), ['session-a.md'])
  } finally { await targetSession.cleanup() }
})

test('editor shows one current file without mode/theme controls and Save exits edit mode', async () => {
  const view = await mountEditor()
  try {
    assert.equal(document.querySelector('[role="tablist"]'), null)
    assert.equal(button('Source'), undefined)
    assert.equal(button('Preview'), undefined)
    assert.equal(button('Appearance'), undefined)
    await act(async () => button('Edit file').click())
    await typeIntoTextarea('changed **markdown**')
    await act(async () => button('Save').click())
    assert.deepEqual(view.writes[0]?.slice(0, 3), ['note.md', 'changed **markdown**', 'v1'])
    assert.equal(view.buffers.isDirty('note.md'), false)
    assert.ok(button('Edit file'), 'successful save returns to read mode')
    assert.equal(document.querySelector('textarea').readOnly, true)
  } finally { await view.cleanup() }
})

test('editor chrome exposes a primary action and bottom status strip', async () => {
  const view = await mountEditor()
  try {
    assert.ok(document.querySelector('[data-editor-primary-action]'))
    const canvas = document.querySelector('[data-editor-canvas]')
    const status = document.querySelector('[data-editor-status-bar]')
    assert.ok(canvas)
    assert.ok(status)
    assert.equal((canvas.compareDocumentPosition(status) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0, true)
    await act(async () => button('Edit file').click())
    assert.equal(document.querySelector('[data-editor-primary-action]')?.textContent.trim(), 'Save')
  } finally { await view.cleanup() }
})

test('double-clicking the editor canvas does not enter edit mode', async () => {
  const view = await mountEditor({ path: 'canvas.txt', content: 'read only' })
  try {
    const textarea = document.querySelector('textarea')
    assert.ok(textarea)
    assert.equal(textarea.readOnly, true)
    await act(async () => fire(document.querySelector('[data-editor-canvas]'), 'dblclick'))
    assert.equal(textarea.readOnly, true)
    assert.ok(button('Edit file'))
    assert.equal(view.writes.length, 0)
  } finally { await view.cleanup() }
})

test('editor textarea follows the Desktop color scheme', async () => {
  const previous = document.documentElement.style.colorScheme
  document.documentElement.style.colorScheme = 'light'
  const view = await mountEditor({ path: 'theme.txt' })
  try {
    assert.equal(document.querySelector('textarea').style.colorScheme, 'light')
  } finally {
    await view.cleanup()
    document.documentElement.style.colorScheme = previous
  }
})

test('editor infers a light Desktop theme from the page background when color-scheme is unset', async () => {
  const previousScheme = document.documentElement.style.colorScheme
  const previousBackground = document.body.style.backgroundColor
  document.documentElement.style.colorScheme = ''
  document.body.style.backgroundColor = 'rgb(255, 255, 255)'
  const view = await mountEditor({ path: 'background-theme.txt' })
  try {
    assert.equal(document.querySelector('textarea').style.colorScheme, 'light')
  } finally {
    await view.cleanup()
    document.documentElement.style.colorScheme = previousScheme
    document.body.style.backgroundColor = previousBackground
  }
})

test('editor infers a dark Desktop theme from the page background when color-scheme is unset', async () => {
  const previousScheme = document.documentElement.style.colorScheme
  const previousBackground = document.body.style.backgroundColor
  document.documentElement.style.colorScheme = ''
  document.body.style.backgroundColor = 'rgb(20, 20, 20)'
  const view = await mountEditor({ path: 'dark-background-theme.txt' })
  try {
    assert.equal(document.querySelector('textarea').style.colorScheme, 'dark')
  } finally {
    await view.cleanup()
    document.documentElement.style.colorScheme = previousScheme
    document.body.style.backgroundColor = previousBackground
  }
})

test('Find action is an icon button with an accessible label', async () => {
  const view = await mountEditor({ path: 'find-icon.txt', content: 'needle' })
  try {
    const find = button('Find')
    assert.ok(find)
    assert.ok(find.querySelector('svg'), 'find control should use an icon')
    assert.equal(find.getAttribute('aria-label'), 'Find')
  } finally { await view.cleanup() }
})

test('Save answers a click even when nothing changed', async () => {
  const view = await mountEditor({ path: 'clean.txt', content: 'unchanged' })
  try {
    await act(async () => button('Edit file').click())
    const save = button('Save')
    assert.ok(save, 'Save button should exist in edit mode')
    assert.equal(save.disabled, false, 'Save stays clickable so a click always answers')
    await act(async () => save.click())
    await flush()
    assert.equal(view.writes.length, 0)
    assert.match(document.querySelector('[data-file-explorer-editor]').textContent, /没有需要保存的改动|No changes to save/u)
    assert.ok(button('Edit file'), 'saving a clean buffer also exits edit mode')
  } finally { await view.cleanup() }
})

test('Ctrl/Cmd+S saves the dirty buffer', async () => {
  const view = await mountEditor({ path: 'note.txt', content: 'alpha' })
  try {
    await act(async () => button('Edit file').click())
    await typeIntoTextarea('beta')
    await act(async () => fire(document.querySelector('textarea'), 'keydown', { key: 's', ctrlKey: true }))
    assert.deepEqual(view.writes[0]?.slice(0, 3), ['note.txt', 'beta', 'v1'])
  } finally { await view.cleanup() }
})

test('blurring the editor saves unsaved changes', async () => {
  const view = await mountEditor({ path: 'blur.txt', content: 'one' })
  try {
    await act(async () => button('Edit file').click())
    const textarea = await typeIntoTextarea('two')
    // React delegates onBlur through the bubbling focusout event.
    await act(async () => fire(textarea, 'focusout'))
    assert.deepEqual(view.writes[0]?.slice(0, 3), ['blur.txt', 'two', 'v1'])
  } finally { await view.cleanup() }
})

test('single-file editor does not expose tab activation or close controls', async () => {
  const view = await mountEditor({ path: 'single.txt', content: 'x' })
  try {
    assert.equal(document.querySelector('[role="tab"]'), null)
    assert.equal(document.querySelector('[role="tablist"]'), null)
    assert.equal(document.querySelector('[data-file-explorer-editor] [aria-label="Close tab"]'), null)
    assert.equal(view.tabs.getSnapshot().activePath, 'single.txt')
  } finally { await view.cleanup() }
})

test('in-file find reports the match count for the current buffer', async () => {
  await mountEditor({ path: 'find.txt', content: 'alpha beta alpha' })
  try {
    await act(async () => button('Find').click())
    const input = document.querySelector('[data-file-explorer-editor] input[type="search"]')
    assert.ok(input, 'find bar input should exist')
    await act(async () => Simulate.change(input, { target: { value: 'alpha' } }))
    const count = document.querySelector('[data-file-explorer-editor] [aria-live="polite"]')
    assert.equal(count.textContent, '0/2')
  } finally {
    await act(async () => document.getElementById('app').replaceChildren())
  }
})
