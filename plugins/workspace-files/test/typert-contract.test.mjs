import test from 'node:test'
import assert from 'node:assert/strict'
import { TYPERT } from '../src/typert.host.ts'
import { TYPERT_REMOTE } from '../src/client/rpc.ts'

test('exposes only session-scoped read, search, and versioned-write operations', () => {
  const methods = TYPERT.invocations.map((item) => item.method).sort()
  assert.deepEqual(methods, ['getRoot', 'list', 'quickOpen', 'read', 'search', 'write'])
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

test('declares transport cancellation for all filesystem operations that accept signals', () => {
  for (const method of ['list', 'read', 'quickOpen', 'search', 'write']) {
    const invocation = TYPERT.invocations.find((item) => item.method === method)
    assert.deepEqual(invocation.cancellation, { parameter: 'signal' })
  }
  assert.equal(TYPERT.invocations.find((item) => item.method === 'getRoot').cancellation, undefined)
})
