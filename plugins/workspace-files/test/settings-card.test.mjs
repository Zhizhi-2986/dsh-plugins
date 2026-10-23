import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { ExplorerSettingsCard } = await import('../lib/client/settings/ExplorerSettingsCard.js')

/**
 * Mirrors the host ConfigForm shape: methods live on the class and read
 * `this.store`, so passing them around unbound throws.
 */
class ConfigFormLike {
  constructor(value) {
    this.snapshot = { status: 'ready', writable: true, value }
    this.store = {
      listeners: new Set(),
    }
  }
  getSnapshot() {
    return this.snapshot
  }
  subscribe(listener) {
    this.store.listeners.add(listener)
    return () => this.store.listeners.delete(listener)
  }
  async set(key, next) {
    this.snapshot = { ...this.snapshot, value: { ...this.snapshot.value, [key]: next } }
    for (const listener of this.store.listeners) listener()
  }
}

test('settings card survives ConfigForm loading to ready transition', async () => {
  const scope = new ConfigFormLike({ openLinksInEditor: true, reorderViewTabs: false, viewTabOrder: [] })
  const ready = scope.snapshot
  scope.snapshot = { status: 'loading', writable: false, value: undefined }
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const root = createRoot(document.getElementById('app'))
  try {
    await act(async () => root.render(React.createElement(ExplorerSettingsCard, {
      ctx, scope, view: 'body', t: key => key,
    })))
    await act(async () => {
      scope.snapshot = ready
      for (const listener of scope.store.listeners) listener()
    })
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 2)
  } finally {
    await act(async () => root.unmount())
    document.getElementById('app').replaceChildren()
  }
})

test('prototype tab reorder is opt-in and can be disabled from plugin settings', async () => {
  const scope = new ConfigFormLike({ openLinksInEditor: true, reorderViewTabs: false, viewTabOrder: [] })
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const root = createRoot(document.getElementById('app'))
  try {
    await act(async () => root.render(React.createElement(ExplorerSettingsCard, {
      ctx, scope, view: 'body', t: key => key,
    })))
    const toggles = document.querySelectorAll('input[type="checkbox"]')
    assert.equal(toggles.length, 2)
    assert.equal(toggles[1].checked, false)
    await act(async () => Simulate.change(toggles[1], { target: { checked: true } }))
    assert.equal(scope.getSnapshot().value.reorderViewTabs, true)
  } finally {
    await act(async () => root.unmount())
    document.getElementById('app').replaceChildren()
  }
})

test('subscribes to the ConfigForm without detaching its store methods', async () => {
  const scope = new ConfigFormLike({ openLinksInEditor: true })
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const root = createRoot(document.getElementById('app'))
  try {
    await act(async () => root.render(React.createElement(ExplorerSettingsCard, {
      ctx,
      scope,
      view: 'body',
      t: (key) => key,
    })))
    const checkbox = document.querySelector('input[type="checkbox"]')
    assert.ok(checkbox, 'the settings card renders instead of crashing')
    assert.ok(checkbox.closest('label').textContent.trim().length > 0, 'the row keeps its label')
    assert.equal(checkbox.disabled, false)
    assert.equal(checkbox.checked, true)

    await act(async () => Simulate.change(checkbox, { target: { checked: false } }))
    assert.equal(scope.getSnapshot().value.openLinksInEditor, false)
  } finally {
    await act(async () => root.unmount())
    document.getElementById('app').replaceChildren()
  }
})
