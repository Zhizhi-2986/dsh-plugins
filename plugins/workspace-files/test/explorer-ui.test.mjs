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
const { BuffersStore } = await import('../lib/client/state/buffers.js')

const flush = async (ms = 30) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) }) }

function createHarness() {
  dom.window.localStorage.clear()
  const opened = []
  const created = []
  const writes = []
  const contents = new Map([
    ['docs/guide.md', 'needle at docs\\nneedle again'],
    ['readme.md', 'needle here'],
  ])
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
        : path === 'docs'
          ? [{ name: 'sub', path: 'docs/sub', kind: 'dir' }]
          : path === 'docs/sub'
            ? [{ name: 'guide.md', path: 'docs/sub/guide.md', kind: 'file' }]
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
    read: async (path) => ({ ok: true, value: { content: contents.get(path) ?? '', version: 'v1' } }),
    write: async (...args) => { writes.push(args); return { ok: true, value: { version: 'v2' } } },
    createFile: async (path, content) => { created.push({ path, content }); return { ok: true, value: { path, version: 'v1' } } },
  }
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const tabs = new TabsStore()
  const buffers = new BuffersStore()
  const root = createRoot(document.getElementById('app'))
  return { api, ctx, tabs, buffers, opened, created, writes, root, onOpenFile: (path, line, edit) => opened.push({ path, line, ...(edit === undefined ? {} : { edit }) }) }
}

test('renders the workspace tree, opens on click, and never edits on double-click', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    const labels = [...document.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent)
    assert.deepEqual(labels, ['docs', 'readme.md'])
    const fileRow = document.querySelectorAll('[role="treeitem"]')[1]
    await act(async () => fileRow.click())
    assert.deepEqual(harness.opened, [{ path: 'readme.md', line: undefined }])
    await act(async () => Simulate.doubleClick(fileRow))
    assert.deepEqual(harness.opened, [{ path: 'readme.md', line: undefined }])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('global search dropdown lists matches and opens the chosen line', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
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
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    harness.api.quickOpen = async () => ({
      ok: true,
      value: { results: ['docs/guide.md', 'readme.md'], truncated: true },
    })
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
    assert.match(document.querySelector('#workspace-quick-open-results [role="status"]').textContent, /may be incomplete/u)
    await act(async () => results[0].click())
    assert.deepEqual(harness.opened, [{ path: 'docs/guide.md', line: undefined }])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('hides dot entries by default and reveals them from the toolbar toggle', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
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

test('creates a workspace-relative file, refreshes the explorer, and opens it for editing', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => document.querySelector('[data-file-explorer-create-file]').click())
    const dialog = document.querySelector('[role="dialog"]')
    const input = dialog.querySelector('[aria-label="File path from workspace root"]')
    await act(async () => Simulate.change(input, { target: { value: 'docs/new.md' } }))
    await act(async () => dialog.querySelector('button[type="submit"]').click())
    await flush()
    assert.deepEqual(harness.created, [{ path: 'docs/new.md', content: '' }])
    assert.deepEqual(harness.opened.at(-1), { path: 'docs/new.md', line: undefined, edit: true })
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('previews global literal replacement before applying and writes reviewed versions', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => Simulate.change(document.querySelector('[role="searchbox"]'), { target: { value: 'needle' } }))
    await act(async () => document.querySelector('[data-file-explorer-replace]').click())
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    await act(async () => Simulate.change(dialog.querySelector('[aria-label="Replace with"]'), { target: { value: 'acorn' } }))
    await act(async () => dialog.querySelector('[data-file-explorer-preview-replace]').click())
    await flush()
    assert.equal(dialog.textContent.includes('3 occurrences'), true)
    assert.equal(harness.writes.length, 0)
    await act(async () => dialog.querySelector('[data-file-explorer-apply-replace]').click())
    await flush()
    assert.deepEqual(harness.writes, [
      ['docs/guide.md', 'acorn at docs\\nacorn again', 'v1'],
      ['readme.md', 'acorn here', 'v1'],
    ])
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('expand all bounds directory loads and tells the user when manual expansion remains', async () => {
  const harness = createHarness()
  const directories = Array.from({ length: 120 }, (_, index) => `dir-${index}`)
  const loaded = []
  harness.api.list = async (path) => {
    if (path === '') return { ok: true, value: { entries: directories.map((name) => ({ name, path: name, kind: 'dir' })) } }
    loaded.push(path)
    return { ok: true, value: { entries: [] } }
  }
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    loaded.length = 0
    await act(async () => document.querySelector('[aria-label="Expand All"]').click())
    await flush(90)
    assert.equal(loaded.length, 10)
    assert.match(document.querySelector('[role="status"]').textContent, /folder or entry limit/u)
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('Expand All caps rendered entries and manual expansion reveals the remaining folder contents', async () => {
  const harness = createHarness()
  const directories = Array.from({ length: 20 }, (_, index) => `dir-${index}`)
  harness.api.list = async (path) => ({
    ok: true,
    value: {
      entries: path === ''
        ? directories.map((name) => ({ name, path: name, kind: 'dir' }))
        : Array.from({ length: 300 }, (_, index) => ({
          name: `file-${index}.txt`, path: `${path}/file-${index}.txt`, kind: 'file',
        })),
    },
  })
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => document.querySelector('[aria-label="Expand All"]').click())
    await flush(90)
    assert.equal(document.querySelectorAll('[role="treeitem"]').length, 2020)
    assert.match(document.querySelector('[role="status"]').textContent, /entry limit/u)
    await act(async () => document.querySelector('[aria-label="Refresh"]').click())
    await flush(90)
    assert.equal(document.querySelectorAll('[role="treeitem"]').length, 2020)

    const cappedDirectory = [...document.querySelectorAll('[role="treeitem"]')]
      .find((element) => element.getAttribute('title') === 'dir-6')
    await act(async () => cappedDirectory.click())
    await act(async () => cappedDirectory.click())
    await flush()
    assert.ok([...document.querySelectorAll('[role="treeitem"]')]
      .some((element) => element.getAttribute('title') === 'dir-6/file-299.txt'))
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('replacement preview excerpts stay at the matched location for collisions and deletions', async () => {
  const harness = createHarness()
  const content = `acorn appears earlier ${'x'.repeat(180)}TARGET needle after-marker`
  harness.api.read = async (path) => ({ ok: true, value: { content: path === 'docs/guide.md' ? content : 'needle elsewhere', version: 'v1' } })
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => Simulate.change(document.querySelector('[role="searchbox"]'), { target: { value: 'needle' } }))
    await flush()
    await act(async () => document.querySelector('[data-file-explorer-replace]').click())
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    const replacementInput = dialog.querySelector('[aria-label="Replace with"]')
    await act(async () => Simulate.change(replacementInput, { target: { value: 'acorn' } }))
    await act(async () => dialog.querySelector('[data-file-explorer-preview-replace]').click())
    await flush()
    const after = () => dialog.querySelector('[data-file-explorer-replace-after]').textContent
    assert.match(after(), /TARGET acorn after-marker/u)
    assert.equal(after().includes('acorn appears earlier'), false)

    await act(async () => Simulate.change(replacementInput, { target: { value: '' } }))
    await act(async () => dialog.querySelector('[data-file-explorer-preview-replace]').click())
    await flush()
    assert.match(after(), /TARGET  after-marker/u)
    assert.equal(after().includes('acorn appears earlier'), false)
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('folder expand/collapse control exposes its state and toggles the tree', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    const toggle = document.querySelector('[data-file-explorer-tree-toggle]')
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    await act(async () => toggle.click())
    await flush()
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('clears the loading state and reports a rejected directory-list request', async () => {
  const harness = createHarness()
  const list = harness.api.list
  harness.api.list = async (path) => {
    if (path === 'docs') throw new Error('transport unavailable')
    return list(path)
  }
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => document.querySelector('[data-file-explorer-tree-toggle]').click())
    await flush()
    assert.equal(document.querySelector('[role="alert"]').textContent, 'Could not load this directory.')
    assert.equal(document.querySelector('[role="treeitem"]').textContent.includes('…'), false)
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('expand all recursively expands folders mounted after a prior collapse command', async () => {
  const harness = createHarness()
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
    })))
    await flush()
    await act(async () => document.querySelector('[aria-label="Collapse All"]').click())
    await flush()
    await act(async () => document.querySelector('[aria-label="Expand All"]').click())
    await flush(90)
    const labels = () => [...document.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent)
    assert.deepEqual(labels(), ['docs', 'sub', 'guide.md', 'readme.md'])
    await act(async () => document.querySelector('[data-file-explorer-tree-toggle]').click())
    await flush()
    assert.deepEqual(labels(), ['docs', 'readme.md'])
    await act(async () => document.querySelector('[data-file-explorer-tree-toggle]').click())
    await flush(90)
    assert.deepEqual(labels(), ['docs', 'sub', 'readme.md'], 'manual reopening does not replay the old expand-all cascade')
  } finally { await act(async () => harness.root.unmount()); document.getElementById('app').replaceChildren() }
})

test('omits dot paths from Quick Open unless they are revealed', async () => {
  const harness = createHarness()
  harness.api.quickOpen = async () => ({ ok: true, value: { results: ['.env', 'docs/guide.md'] } })
  try {
    await act(async () => harness.root.render(React.createElement(ExplorerPanel, {
      ctx: harness.ctx, api: harness.api, tabs: harness.tabs, buffers: harness.buffers, onOpenFile: harness.onOpenFile,
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
