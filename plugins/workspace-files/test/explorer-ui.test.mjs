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
globalThis.CustomEvent = dom.window.CustomEvent
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(0), 0)

const { ExplorerPanel } = await import('../lib/client/explorer/ExplorerPanel.js')
const { TabsStore } = await import('../lib/client/state/tabs.js')

const flush = async (ms = 30) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) }) }

function createHarness() {
  dom.window.localStorage.clear()
  const opened = []
  const list = async (path) => ({
    ok: true,
    value: {
      entries: path === ''
        ? [
          { name: '.git', path: '.git', kind: 'dir' },
          { name: '.env', path: '.env', kind: 'file' },
          { name: 'docs', path: 'docs', kind: 'dir' },
          { name: 'readme.md', path: 'readme.md', kind: 'file' },
        ]
        : [{ name: 'guide.md', path: `${path}/guide.md`, kind: 'file' }],
    },
  })
  const api = {
    list,
    getRoot: async () => ({ ok: true, value: { root: '/workspace/demo' } }),
    search: async () => ({ ok: true, value: { results: [
      { path: 'docs/guide.md', line: 7, snippet: 'needle in docs' },
      { path: 'readme.md', line: 2, snippet: 'needle here' },
    ] } }),
    quickOpen: async () => ({ ok: true, value: { results: ['docs/guide.md', 'readme.md'] } }),
    read: async () => ({ ok: true, value: { content: '', version: 'v1' } }),
    write: async () => ({ ok: true, value: { version: 'v2' } }),
  }
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const tabs = new TabsStore()
  const root = createRoot(document.getElementById('app'))
  return { api, ctx, tabs, opened, root, onOpenFile: (path, line) => opened.push({ path, line }) }
}

test('renders the workspace tree and opens a file on click', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    const labels = [...document.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent)
    assert.deepEqual(labels, ['docs', 'readme.md'])
    await act(async () => document.querySelectorAll('[role="treeitem"]')[1].click())
    assert.deepEqual(harness.opened, [{ path: 'readme.md', line: undefined }])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('global search dropdown lists matches and opens the chosen line', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    const input = document.querySelector('[role="searchbox"]')
    await act(async () => Simulate.change(input, { target: { value: 'needle' } }))
    await flush(400)
    const options = [...document.querySelectorAll('#workspace-search-results [role="option"]')]
    assert.equal(options.length, 2)
    const filterButtons = [...document.querySelectorAll('#workspace-search-results button')]
      .filter((item) => item.getAttribute('role') !== 'option')
    assert.deepEqual(filterButtons.map((item) => item.textContent), [], 'the dropdown has no search-filter row')
    assert.match(options[0].textContent, /docs\/guide\.md:7/u)
    await act(async () => options[0].click())
    assert.deepEqual(harness.opened, [{ path: 'docs/guide.md', line: 7 }])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('quick open lists paths and opens the selected file with Ctrl+P', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    const quickInput = () => document.querySelector('[role="combobox"]')
    await act(async () => {
      document.querySelector('[role="searchbox"]').dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }),
      )
    })
    await flush()
    assert.ok(quickInput(), 'Ctrl+P should open Quick Open')
    await act(async () => Simulate.change(quickInput(), { target: { value: 'guide' } }))
    await flush(200)
    const results = [...document.querySelectorAll('#workspace-quick-open-results [role="option"]')]
    assert.deepEqual(results.map((row) => row.textContent), ['docs/guide.md', 'readme.md'])
    await act(async () => results[0].click())
    assert.deepEqual(harness.opened, [{ path: 'docs/guide.md', line: undefined }])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('hides dot entries by default and reveals them from the toolbar toggle', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    const labels = () => [...document.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent)
    assert.deepEqual(labels(), ['docs', 'readme.md'])

    const toggle = document.querySelector('button[aria-pressed]')
    assert.ok(toggle, 'hidden-files toggle should exist')
    assert.equal(toggle.getAttribute('aria-pressed'), 'false')
    await act(async () => toggle.click())
    await flush()
    assert.equal(toggle.getAttribute('aria-pressed'), 'true')
    assert.deepEqual(labels(), ['.git', '.env', 'docs', 'readme.md'])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('omits dot paths from Quick Open unless they are revealed', async () => {
  const harness = createHarness()
  harness.api.quickOpen = async () => ({ ok: true, value: { results: ['.env', 'docs/guide.md'] } })
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => {
      document.querySelector('[role="searchbox"]').dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }),
      )
    })
    await flush()
    await act(async () => Simulate.change(document.querySelector('[role="combobox"]'), { target: { value: 'env' } }))
    await flush(200)
    const results = [...document.querySelectorAll('#workspace-quick-open-results [role="option"]')]
    assert.deepEqual(results.map((row) => row.textContent), ['docs/guide.md'])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})
