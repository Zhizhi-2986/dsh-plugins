import test from 'node:test'
import assert from 'node:assert/strict'
import { TYPERT } from '../src/typert.host.ts'
import { TYPERT_REMOTE } from '../src/client/rpc.ts'
import { MAX_FS_VERSION_TOKEN_CHARS } from '../src/shared/rpc-contract.ts'

test('declares Session-scoped read, write, and create endpoints', () => {
  const methods = TYPERT.invocations.map((item) => item.method).sort()
  assert.deepEqual(methods, ['createFile', 'getRoot', 'list', 'quickOpen', 'read', 'search', 'write'])
  for (const invocation of TYPERT.invocations) {
    assert.equal(invocation.parameters[0].source, 'lookup')
    assert.equal(invocation.parameters[0].lookup, 'workspaceFileScope')
    assert.equal(invocation.parameters[0].wire, 'workspaceFileScopeId')
  }
})

test('keeps Host and Client invocation descriptors in exact parity', () => {
  for (const host of TYPERT.invocations) {
    const client = TYPERT_REMOTE.descriptors.find((item) => item.method === host.method)
    assert.ok(client, `missing client descriptor for ${host.method}`)
    assert.deepEqual(client.cancellation, host.cancellation)
    assert.deepEqual(client.parameters.map((parameter) => [parameter.name, parameter.wire, parameter.lookup, parameter.codec.typeSymbol]),
      host.parameters.map((parameter) => [parameter.name, parameter.wire, parameter.lookup, parameter.codec.typeSymbol]))
    assert.equal(client.result.typeSymbol, host.result.typeSymbol)
  }
})

test('enforces the same filesystem path length boundary in Client and Host codecs', () => {
  const hostList = TYPERT.invocations.find((item) => item.method === 'list')
  const clientList = TYPERT_REMOTE.descriptors.find((item) => item.method === 'list')
  for (const [label, parameter] of [
    ['Host', hostList.parameters.find((item) => item.name === 'path')],
    ['Client', clientList.parameters.find((item) => item.name === 'path')],
  ]) {
    const schema = parameter.codec.create()
    assert.equal(schema.safeParse('x'.repeat(1024)).success, true, `${label} should allow the exact path limit`)
    assert.equal(schema.safeParse('x'.repeat(1025)).success, false, `${label} should reject paths over the limit`)
  }
})

test('bounds opaque file-version token length in Host and Client codecs', () => {
  const hostWrite = TYPERT.invocations.find((item) => item.method === 'write')
  const clientWrite = TYPERT_REMOTE.descriptors.find((item) => item.method === 'write')
  for (const [label, invocation] of [['Host', hostWrite], ['Client', clientWrite]]) {
    const schema = invocation.parameters.find((item) => item.name === 'expectedVersion').codec.create()
    assert.equal(schema.safeParse('').success, false, `${label} should reject empty version tokens`)
    assert.equal(schema.safeParse('v'.repeat(MAX_FS_VERSION_TOKEN_CHARS)).success, true, `${label} should allow the exact version-token limit`)
    assert.equal(schema.safeParse('v'.repeat(MAX_FS_VERSION_TOKEN_CHARS + 1)).success, false, `${label} should reject version tokens over the limit`)
  }
})

test('bounds version tokens returned by Client and Host result codecs', () => {
  const cases = [
    ['read', { ok: true, content: '', version: '' }],
    ['write', { ok: true, version: '' }],
    ['createFile', { ok: true, path: 'new.txt', version: '' }],
  ]
  for (const [method, validResult] of cases) {
    const host = TYPERT.invocations.find((item) => item.method === method)
    const client = TYPERT_REMOTE.descriptors.find((item) => item.method === method)
    for (const [label, invocation] of [['Host', host], ['Client', client]]) {
      const schema = invocation.result.create()
      assert.equal(schema.safeParse({ ...validResult, version: '' }).success, false,
        `${label} ${method} result should reject an empty version token`)
      assert.equal(schema.safeParse({ ...validResult, version: 'v'.repeat(MAX_FS_VERSION_TOKEN_CHARS) }).success, true,
        `${label} ${method} result should allow the exact version-token limit`)
      assert.equal(schema.safeParse({ ...validResult, version: 'v'.repeat(MAX_FS_VERSION_TOKEN_CHARS + 1) }).success, false,
        `${label} ${method} result should reject version tokens over the limit`)
    }
  }
})

test('preserves workspace-search completeness metadata in the Host result schema', () => {
  const schema = TYPERT.invocations.find((item) => item.method === 'search').result.create()
  assert.deepEqual(schema.parse({ ok: true, results: [], truncated: true }), { ok: true, results: [], truncated: true })
})

test('keeps READ_ONLY in the mutation failure codec for compatibility', () => {
  const readOnlyFailure = {
    ok: false,
    code: 'READ_ONLY',
    message: 'File changes are disabled in this release.',
  }
  for (const method of ['createFile', 'write']) {
    const host = TYPERT.invocations.find((item) => item.method === method)
    const client = TYPERT_REMOTE.descriptors.find((item) => item.method === method)
    assert.deepEqual(host.result.create().parse(readOnlyFailure), readOnlyFailure)
    assert.deepEqual(client.result.create().parse(readOnlyFailure), readOnlyFailure)
  }
})

test('declares transport cancellation for all filesystem operations that accept signals', () => {
  for (const method of ['createFile', 'list', 'read', 'quickOpen', 'search', 'write']) {
    const invocation = TYPERT.invocations.find((item) => item.method === method)
    assert.deepEqual(invocation.cancellation, { parameter: 'signal' })
  }
  assert.equal(TYPERT.invocations.find((item) => item.method === 'getRoot').cancellation, undefined)
})
