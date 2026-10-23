import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.CustomEvent = dom.window.CustomEvent
globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement

const { installOpenLinksInterceptor } = await import('../lib/client/open-links.js')

function settingsScope(openLinksInEditor) {
  return {
    getSnapshot: () => ({ status: 'ready', value: { openLinksInEditor } }),
    subscribe: () => () => {},
  }
}

function mountConversationTabs(label, clicked) {
  document.body.innerHTML = `
    <div data-conversation-tabs="" role="tablist">
      <button type="button" role="tab" data-view="chat">Chat</button>
      <button type="button" role="tab" data-view="files">${label}</button>
    </div>
    <p><a href="docs/guide.md">docs/guide.md</a></p>
  `
  document.querySelector('[data-view="files"]').addEventListener('click', () => clicked.push('files'))
  return document.querySelector('a')
}

test('clicking a conversation file link switches to the Files tab and queues the path', () => {
  const clicked = []
  const link = mountConversationTabs('Files', clicked)
  const opened = []
  const onOpen = (event) => opened.push(event.detail)
  window.addEventListener('file-explorer:open', onOpen)
  const dispose = installOpenLinksInterceptor(settingsScope(true), () => 'Files')
  try {
    link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.deepEqual(clicked, ['files'], 'the Files tab is activated first')
    assert.deepEqual(opened.map((detail) => detail.path), ['docs/guide.md'])
  } finally {
    dispose()
    window.removeEventListener('file-explorer:open', onOpen)
  }
})

test('leaves links alone when interception is disabled', () => {
  const clicked = []
  const link = mountConversationTabs('文件', clicked)
  const opened = []
  const onOpen = (event) => opened.push(event.detail)
  window.addEventListener('file-explorer:open', onOpen)
  const dispose = installOpenLinksInterceptor(settingsScope(false), () => '文件')
  try {
    link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.deepEqual(clicked, [])
    assert.deepEqual(opened, [])
  } finally {
    dispose()
    window.removeEventListener('file-explorer:open', onOpen)
  }
})

test('matches the localized Files tab label', () => {
  const clicked = []
  const link = mountConversationTabs('文件', clicked)
  const dispose = installOpenLinksInterceptor(settingsScope(true), () => '文件')
  try {
    link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.deepEqual(clicked, ['files'])
  } finally {
    dispose()
  }
})
