import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

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

const stats = { creates: 0, disposals: 0 }
let modelValue = ''
let changeListener = () => {}

dom.window.monaco = {
  editor: {
    create: (_host, options) => {
      stats.creates += 1
      modelValue = options.value
      return {
        getValue: () => modelValue,
        getModel: () => ({ getLineCount: () => 1 }),
        setValue: (next) => { modelValue = next },
        onDidChangeModelContent: (listener) => {
          changeListener = () => listener()
          return { dispose: () => {} }
        },
        onDidBlurEditorWidget: () => ({ dispose: () => {} }),
        dispose: () => { stats.disposals += 1 },
        layout: () => {},
        updateOptions: () => {},
        revealLineInCenter: () => {},
        revealRangeInCenter: () => {},
        setSelection: () => {},
        setPosition: () => {},
        focus: () => {},
      }
    },
    setTheme: () => {},
    defineTheme: () => {},
  },
}

const { EditorSurface, requestOpenPath } = await import('../lib/client/editor/EditorSurface.js')
const { TabsStore } = await import('../lib/client/state/tabs.js')
const { BuffersStore } = await import('../lib/client/state/buffers.js')
const { MdModeStore } = await import('../lib/client/state/md-mode.js')

const flush = async (ms = 25) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) }) }

test('keeps one Monaco instance while the user types', async () => {
  const tabs = new TabsStore()
  const buffers = new BuffersStore()
  const mdModes = new MdModeStore()
  const api = {
    read: async () => ({ ok: true, value: { content: 'start', version: 'v1' } }),
    write: async () => ({ ok: true, value: { version: 'v2' } }),
  }
  const ctx = { locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'en-US' }) } }
  const root = createRoot(document.getElementById('app'))
  try {
    await act(async () => root.render(React.createElement(EditorSurface, { ctx, api, tabs, buffers, mdModes })))
    await act(async () => requestOpenPath('typing.txt', undefined, true))
    await flush(60)
    assert.equal(stats.creates, 1, 'one Monaco editor after opening the file')

    modelValue = 'start a'
    await act(async () => { changeListener() })
    modelValue = 'start ab'
    await act(async () => { changeListener() })
    await flush()

    assert.equal(buffers.get('typing.txt')?.content, 'start ab')
    assert.equal(stats.creates, 1, 'typing must not recreate the Monaco editor')
    assert.equal(stats.disposals, 0, 'typing must not dispose the focused editor')
  } finally {
    await act(async () => root.unmount())
    document.getElementById('app').replaceChildren()
  }
})
