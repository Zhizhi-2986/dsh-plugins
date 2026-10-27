import test from 'node:test'
import assert from 'node:assert/strict'
import { fileAddressFor, parseSessionFileAddress } from '../lib/client/workspace-address.js'

test('addresses workspace search results to the bound Session resource', () => {
  assert.equal(
    fileAddressFor('session/id', '/workspace/demo', 'docs/guide one.md'),
    'dsh-resource://file/session/session%2Fid/docs/guide%20one.md',
  )
})

test('preserves an absolute path outside the workspace in its Session address', () => {
  assert.equal(
    fileAddressFor('s-1', '/workspace/demo', '/tmp/readme.md'),
    'dsh-resource://file/session/s-1//tmp/readme.md',
  )
})

test('parses only valid Session file addresses and decodes path segments', () => {
  assert.deepEqual(
    parseSessionFileAddress('dsh-resource://file/session/s-1/docs/guide%20one.md?line=7'),
    { sessionId: 's-1', path: 'docs/guide one.md' },
  )
  assert.equal(parseSessionFileAddress('dsh-resource://file/absolute/workspace/readme.md'), null)
  assert.equal(parseSessionFileAddress('https://example.test/readme.md'), null)
  assert.equal(parseSessionFileAddress('dsh-resource://file/session/s-1/bad%ZZ.md'), null)
})
