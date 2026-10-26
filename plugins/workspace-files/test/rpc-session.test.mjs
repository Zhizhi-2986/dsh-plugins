import test from 'node:test'
import assert from 'node:assert/strict'
import { createExplorerApi } from '../src/client/rpc.ts'

test('binds delayed editor saves to their original Session, not the newly selected one', async () => {
  let activeSession = 'session-A'
  const calls = []
  const ctx = {
    get: () => ({ adapter: { current: { getSnapshot: () => ({ key: activeSession }) } } }),
    remote: { explorerFs: { write: async (...args) => {
      calls.push(args)
      return { ok: true, value: { ok: true, version: 'v2' } }
    } } },
  }
  const apiForA = createExplorerApi(ctx, 'session-A')
  activeSession = 'session-B'
  const outcome = await apiForA.write('shared.txt', 'draft from A', 'v1')
  assert.equal(outcome.ok, true)
  assert.equal(calls[0][0], 'session-A')
})

test('binds file creation to the originating Session', async () => {
  const calls = []
  const ctx = {
    get: () => ({ adapter: { current: { getSnapshot: () => ({ key: 'session-B' }) } } }),
    remote: { explorerFs: { createFile: async (...args) => {
      calls.push(args)
      return { ok: true, value: { ok: true, path: 'notes/new.md', version: 'v1' } }
    } } },
  }
  const apiForA = createExplorerApi(ctx, 'session-A')
  const outcome = await apiForA.createFile('notes/new.md', '')
  assert.equal(outcome.ok, true)
  assert.deepEqual(calls[0], ['session-A', 'notes/new.md', '', undefined])
})

test('keeps every sequential Close All save in its originating Session', async () => {
  let activeSession = 'session-A'
  const calls = []
  let finishFirst
  const firstSave = new Promise((resolve) => { finishFirst = resolve })
  const ctx = {
    get: () => ({ adapter: { current: { getSnapshot: () => ({ key: activeSession }) } } }),
    remote: { explorerFs: { write: async (...args) => {
      calls.push(args)
      if (calls.length === 1) await firstSave
      return { ok: true, value: { ok: true, version: 'v2' } }
    } } },
  }
  const apiForA = createExplorerApi(ctx, 'session-A')
  const closeAll = (async () => {
    await apiForA.write('one.txt', 'draft-A-one', 'v1')
    await apiForA.write('two.txt', 'draft-A-two', 'v1')
  })()
  activeSession = 'session-B'
  finishFirst()
  await closeAll
  assert.deepEqual(calls.map((args) => args[0]), ['session-A', 'session-A'])
})

test('never falls back to the selected Session when the bound view has no Session', async () => {
  const calls = []
  const ctx = {
    get: () => ({ adapter: { current: { getSnapshot: () => ({ key: 'session-B' }) } } }),
    remote: { explorerFs: { read: async (...args) => { calls.push(args); return { ok: true, value: { ok: true, content: '', version: 'v1' } } } } },
  }
  const noSessionApi = createExplorerApi(ctx, null)
  const outcome = await noSessionApi.read('shared.txt')
  assert.equal(outcome.ok, false)
  assert.equal(calls.length, 0)
})
