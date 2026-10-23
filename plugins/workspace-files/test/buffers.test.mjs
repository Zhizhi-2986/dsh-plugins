import test from 'node:test'
import assert from 'node:assert/strict'
import { BuffersStore } from '../src/client/state/buffers.ts'

test('keeps a draft dirty when edits arrive during an in-flight save', () => {
  const buffers = new BuffersStore()
  buffers.load('note.txt', 'initial', 'v1')
  buffers.setContent('note.txt', 'submitted')
  buffers.setContent('note.txt', 'latest draft')
  buffers.markSaved('note.txt', 'submitted', 'v2')
  assert.deepEqual(buffers.get('note.txt'), {
    path: 'note.txt', content: 'latest draft', savedContent: 'submitted', version: 'v2',
  })
  assert.equal(buffers.isDirty('note.txt'), true)
})

test('does not replace a stale draft with external content before conflict resolution', () => {
  const buffers = new BuffersStore()
  buffers.load('note.txt', 'original', 'v1')
  buffers.setContent('note.txt', 'unsaved draft')
  assert.equal(buffers.get('note.txt').content, 'unsaved draft')
  assert.equal(buffers.isDirty('note.txt'), true)
})
