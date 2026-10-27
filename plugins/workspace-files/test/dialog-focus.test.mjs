import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreDialogTrigger, trapDialogTab } from '../lib/client/dialog-focus.js'

function keyboardEvent(key, shiftKey = false) {
  let prevented = false
  return {
    event: { key, shiftKey, preventDefault: () => { prevented = true } },
    wasPrevented: () => prevented,
  }
}

function withDocumentActiveElement(activeElement, run) {
  const previous = globalThis.document
  globalThis.document = { activeElement }
  try {
    run()
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
}

test('ignores non-Tab keys and a missing dialog', () => {
  const key = keyboardEvent('Escape')
  trapDialogTab(key.event, null)
  assert.equal(key.wasPrevented(), false)
})

test('keeps focus on an empty dialog when no controls exist', () => {
  let focused = false
  const dialog = { querySelectorAll: () => [], focus: () => { focused = true } }
  const key = keyboardEvent('Tab')
  trapDialogTab(key.event, dialog)
  assert.equal(key.wasPrevented(), true)
  assert.equal(focused, true)
})

test('moves escaped focus into the dialog in the Tab direction', () => {
  for (const shiftKey of [false, true]) {
    let focused = ''
    const first = { focus: () => { focused = 'first' } }
    const last = { focus: () => { focused = 'last' } }
    const outside = {}
    const dialog = {
      querySelectorAll: () => [first, last],
      contains: (target) => target === first || target === last,
    }
    const key = keyboardEvent('Tab', shiftKey)
    withDocumentActiveElement(outside, () => trapDialogTab(key.event, dialog))
    assert.equal(key.wasPrevented(), true)
    assert.equal(focused, shiftKey ? 'last' : 'first')
  }
})

test('restores focus only to connected action triggers', () => {
  let restored = false
  restoreDialogTrigger(null)
  restoreDialogTrigger({ isConnected: false, focus: () => { restored = true } })
  assert.equal(restored, false)
  restoreDialogTrigger({ isConnected: true, focus: () => { restored = true } })
  assert.equal(restored, true)
})
