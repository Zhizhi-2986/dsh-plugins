import test from 'node:test'
import assert from 'node:assert/strict'
import { ExplorerFsService } from '../lib/host/fs-service.js'

const scope = { sessionId: 'session-1', workspaceRoot: '/workspace' }

function createService({ truncated = false, content: initialContent } = {}) {
  let content = initialContent ?? 'first'
  let version = 'v1'
  const calls = []
  const fs = {
    sandboxMode: 'workspace-write',
    async resolve(path) { return { targetKey: path, displayPath: path } },
    contains(parent, child) {
      return child.targetKey === parent.targetKey || child.targetKey.startsWith(`${parent.targetKey}/`)
    },
    async lstat(path, options) {
      const absolute = options?.cwd ? `${options.cwd}/${path}` : path
      if (absolute === '/workspace/linked') return { type: 'symlink' }
      return absolute === '/workspace/note.txt' ? { type: 'file' } : undefined
    },
    async stat(target) {
      return target.targetKey === '/workspace/note.txt'
        ? { type: 'file', size: new TextEncoder().encode(content).length, version }
        : { type: 'directory', version: 'root' }
    },
    async readBytes() { return new TextEncoder().encode(content) },
    async writeText(target, next, intent, signal, policy) {
      calls.push({ target, next, intent, signal, policy })
      if (intent.version !== version) throw Object.assign(new Error('stale'), { code: 'FS_STALE_VERSION' })
      content = next
      version = 'v2'
      return { version }
    },
  }
  const service = Object.create(ExplorerFsService.prototype)
  service.context = {
    fs,
    sessions: { get: () => ({ header: { cwd: '/workspace' } }) },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/workspace' }) },
    workspaceFiles: {
      async list(_scope, path) {
        if (path === '') throw Object.assign(new Error('path is required'), { code: 'gateway/bad-request' })
        return { path: path === '.' ? '' : path, truncated, entries: [{ name: 'note.txt', type: 'file', size: 5 }] }
      },
    },
  }
  return { service, calls }
}

test('reads session-scoped text and saves only with an observed version', async () => {
  const { service, calls } = createService()
  assert.deepEqual(await service.read(scope, 'note.txt'), { ok: true, content: 'first', version: 'v1' })
  assert.deepEqual(await service.write(scope, 'note.txt', 'second', 'v1'), { ok: true, version: 'v2' })
  assert.equal(calls[0].intent.kind, 'replaceIfVersion')
  assert.equal(calls[0].policy.workspaceRoot, '/workspace')
  assert.deepEqual(await service.read(scope, 'note.txt'), { ok: true, content: 'second', version: 'v2' })
})

test('routes Quick Open and workspace search through the session-scoped Host', async () => {
  const { service } = createService()
  const quick = await service.quickOpen(scope, 'note')
  assert.equal(quick.ok, true)
  assert.equal(quick.results[0], 'note.txt')
  const search = await service.search(scope, 'first', {})
  assert.deepEqual(search, { ok: true, results: [{ path: 'note.txt', line: 1, snippet: 'first' }] })
})

test('lists the workspace root using the non-empty path the Host API requires', async () => {
  const { service } = createService()
  const listed = await service.list(scope, '')
  assert.deepEqual(listed, { ok: true, entries: [{ name: 'note.txt', path: 'note.txt', kind: 'file', size: 5 }] })
})

test('flags a large workspace file as partial instead of failing the search', async () => {
  const bigFile = `${'filler\n'.repeat(5200)}needle at the end`
  const { service } = createService({ content: bigFile })
  const search = await service.search(scope, 'needle', {})
  assert.equal(search.ok, true)
  assert.equal(search.truncated, true)
  assert.deepEqual(search.results, [])
})

test('rejects stale saves without overwriting the unsaved buffer', async () => {
  const { service, calls } = createService()
  const result = await service.write(scope, 'note.txt', 'draft', 'old-version')
  assert.deepEqual(result.ok, false)
  assert.equal(result.code, 'CONFLICT')
  assert.equal(calls.length, 1)
  assert.deepEqual(await service.read(scope, 'note.txt'), { ok: true, content: 'first', version: 'v1' })
})

test('rejects static symlink paths and incomplete directory listings', async () => {
  const { service } = createService({ truncated: true })
  assert.equal((await service.read(scope, 'linked')).code, 'OUT_OF_ROOT')
  assert.equal((await service.list(scope, '')).code, 'TOO_LARGE')
})

test('rejects absolute paths, missing version, and session root mismatch', async () => {
  const { service } = createService()
  assert.equal((await service.read(scope, '/etc/passwd')).code, 'OUT_OF_ROOT')
  assert.equal((await service.write(scope, 'note.txt', 'draft', '')).code, 'CONFLICT')
  assert.equal((await service.read({ ...scope, workspaceRoot: '/outside' }, 'note.txt')).code, 'OUT_OF_ROOT')
})
