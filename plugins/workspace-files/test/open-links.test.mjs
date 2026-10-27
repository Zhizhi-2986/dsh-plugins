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

function mountConversationTabs() {
  document.body.innerHTML = `
    <div data-conversation-tabs="" role="tablist">
      <button type="button" role="tab" data-view="chat">Chat</button>
      <button type="button" role="tab" data-view="other">Other</button>
    </div>
    <p><a href="docs/guide.md">docs/guide.md</a></p>
  `
  return document.querySelector('a')
}

test('clicking a conversation file link opens its native Session-scoped resource preview', () => {
  const link = mountConversationTabs()
  const opened = []
  const dispose = installOpenLinksInterceptor(settingsScope(true), () => 'session-1', (address) => opened.push(address))
  try {
    link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.equal(document.querySelector('[data-view="other"]').getAttribute('aria-selected'), null)
    assert.deepEqual(opened, ['dsh-resource://file/session/session-1/docs/guide.md'])
  } finally {
    dispose()
  }
})

test('leaves links alone when interception is disabled', () => {
  const link = mountConversationTabs()
  const opened = []
  const dispose = installOpenLinksInterceptor(settingsScope(false), () => 'session-1', (address) => opened.push(address))
  try {
    link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.equal(link.getAttribute('href'), 'docs/guide.md')
    assert.deepEqual(opened, [])
  } finally {
    dispose()
  }
})

test('does not intercept a file link when there is no active Session target', () => {
  for (const sessionId of [undefined, null]) {
    const link = mountConversationTabs()
    const dispose = installOpenLinksInterceptor(settingsScope(true), () => sessionId, () => {})
    try {
      const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
      link.dispatchEvent(event)
      assert.equal(event.defaultPrevented, false)
    } finally {
      dispose()
    }
  }
})
