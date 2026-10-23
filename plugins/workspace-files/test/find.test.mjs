import test from 'node:test'
import assert from 'node:assert/strict'
import { findOffsets, nextFindOffset, offsetToLineColumn } from '../src/client/editor/find.ts'

test('finds literal matches with optional case sensitivity', () => {
  assert.deepEqual(findOffsets('One one ONE', 'one'), [0, 4, 8])
  assert.deepEqual(findOffsets('One one ONE', 'one', true), [4])
  assert.deepEqual(findOffsets('İx', 'x'), [1])
  assert.deepEqual(findOffsets('text', ''), [])
  assert.equal(findOffsets('x'.repeat(12_000), 'x').length, 10_000)
})

test('moves through find matches and wraps in either direction', () => {
  const offsets = [3, 9, 18]
  assert.equal(nextFindOffset(offsets, null, 1), 3)
  assert.equal(nextFindOffset(offsets, 3, 1), 9)
  assert.equal(nextFindOffset(offsets, 18, 1), 3)
  assert.equal(nextFindOffset(offsets, null, -1), 18)
  assert.equal(nextFindOffset(offsets, 9, -1), 3)
  assert.equal(nextFindOffset(offsets, 3, -1), 18)
})

test('converts match offsets to Monaco line and column coordinates', () => {
  assert.deepEqual(offsetToLineColumn('first\r\nsecond\nthird', 8), { lineNumber: 2, column: 2 })
})
