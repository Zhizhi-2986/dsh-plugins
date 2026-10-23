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
  return [...document.querySelectorAll('button')].find((item) => item.textContent === label)
}

async function mountEditor({ path = 'note.md', content = 'Hello **world**' } = {}) {
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
  await act(async () => root.render(React.createElement(EditorSurface, { ctx, api, tabs, buffers, mdModes })))
  await act(async () => requestOpenPath(path, undefined, false))
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

test('preview renders sanitized Markdown, double-click edits, Save button persists', async () => {
  const view = await mountEditor()
  try {
    await act(async () => button('Preview').click())
    assert.match(document.querySelector('[data-file-explorer-preview]').innerHTML, /<strong>world<\/strong>/u)
    await act(async () => fire(document.querySelector('[data-file-explorer-editor] strong'), 'dblclick'))
    assert.equal(view.mdModes.get(view.path), 'source')
    await typeIntoTextarea('changed **markdown**')
    await act(async () => button('Save').click())
    assert.deepEqual(view.writes[0]?.slice(0, 3), ['note.md', 'changed **markdown**', 'v1'])
    assert.equal(view.buffers.isDirty('note.md'), false)
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

test('closing a dirty tab saves it before the tab closes', async () => {
  const view = await mountEditor({ path: 'close.txt', content: 'x' })
  try {
    await act(async () => button('Edit file').click())
    await typeIntoTextarea('y')
    const closeButton = document.querySelector('[data-file-explorer-editor] [role="tab"] [role="button"]')
    assert.ok(closeButton, 'tab close control should exist')
    await act(async () => closeButton.click())
    await flush()
    assert.deepEqual(view.writes[0]?.slice(0, 3), ['close.txt', 'y', 'v1'])
    assert.deepEqual(view.tabs.getSnapshot().open, [])
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
