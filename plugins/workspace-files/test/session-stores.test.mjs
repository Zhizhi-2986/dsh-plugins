import test from 'node:test'
import assert from 'node:assert/strict'
import { editorStoresForSession } from '../src/client/state/session-stores.ts'

test('keeps unsaved workspace buffers isolated by Session identity', () => {
  const first = editorStoresForSession('first-session')
  const second = editorStoresForSession('second-session')
  first.tabs.open('same.txt')
  first.buffers.load('same.txt', 'private first text', 'v1')
  first.buffers.setContent('same.txt', 'unsaved first draft')
  assert.notEqual(first, second)
  assert.deepEqual(second.tabs.getSnapshot().open, [])
  assert.equal(second.buffers.get('same.txt'), undefined)
  assert.equal(editorStoresForSession('first-session').buffers.get('same.txt').content, 'unsaved first draft')
})
