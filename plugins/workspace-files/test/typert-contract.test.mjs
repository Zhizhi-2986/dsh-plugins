import test from 'node:test'
import assert from 'node:assert/strict'
import { TYPERT } from '../src/typert.host.ts'
import { TYPERT_REMOTE } from '../src/client/rpc.ts'

test('exposes session-scoped filesystem operations with create and versioned-write semantics', () => {
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

test('preserves workspace-search completeness metadata in the Host result schema', () => {
  const schema = TYPERT.invocations.find((item) => item.method === 'search').result.create()
  assert.deepEqual(schema.parse({ ok: true, results: [], truncated: true }), { ok: true, results: [], truncated: true })
})

test('declares transport cancellation for all filesystem operations that accept signals', () => {
  for (const method of ['createFile', 'list', 'read', 'quickOpen', 'search', 'write']) {
    const invocation = TYPERT.invocations.find((item) => item.method === method)
    assert.deepEqual(invocation.cancellation, { parameter: 'signal' })
  }
  assert.equal(TYPERT.invocations.find((item) => item.method === 'getRoot').cancellation, undefined)
})
