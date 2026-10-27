import test from 'node:test'
import assert from 'node:assert/strict'
import { ExplorerFsService } from '../lib/host/fs-service.js'
import { MAX_FS_VERSION_TOKEN_CHARS } from '../src/shared/rpc-contract.ts'

const scope = { sessionId: 'session-1', workspaceRoot: '/workspace' }

function createService({ truncated = false, content: initialContent, entrySize = 5, unknownStatSize = false, readFailure, workspaceEntries, extraFiles = {}, beforeRead } = {}) {
  const files = new Map([
    ['/workspace/note.txt', { content: initialContent ?? 'first', version: 'v1' }],
    ...Object.entries(extraFiles).map(([path, content]) => [`/workspace/${path}`, { content, version: 'v1' }]),
  ])
  const directories = new Set(['/workspace', '/workspace/docs'])
  const calls = []
  const readByteLimits = []
  const fs = {
    sandboxMode: 'workspace-write',
    async resolve(path) { return { targetKey: path, displayPath: path } },
    contains(parent, child) {
      return child.targetKey === parent.targetKey || child.targetKey.startsWith(`${parent.targetKey}/`)
    },
    async lstat(path, options) {
      const absolute = options?.cwd ? `${options.cwd}/${path}` : path
      if (absolute === '/workspace/linked') return { type: 'symlink' }
      if (files.has(absolute)) return { type: 'file' }
      return directories.has(absolute) ? { type: 'directory' } : undefined
    },
    async stat(target) {
      const file = files.get(target.targetKey)
      if (file !== undefined) {
        return { type: 'file', ...(unknownStatSize ? {} : { size: new TextEncoder().encode(file.content).length }), version: file.version }
      }
      return directories.has(target.targetKey) ? { type: 'directory', version: 'root' } : undefined
    },
    async readBytes(target, _signal, maxBytes) {
      readByteLimits.push(maxBytes)
      if (readFailure !== undefined) throw Object.assign(new Error('mock read failure'), { code: readFailure })
      await beforeRead?.(target.targetKey, files)
      const bytes = new TextEncoder().encode(files.get(target.targetKey)?.content ?? '')
      if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
        throw Object.assign(new Error('too large'), { code: 'FS_TOO_LARGE' })
      }
      return bytes
    },
    async writeText(target, next, intent, signal, policy) {
      calls.push({ target, next, intent, signal, policy })
      if (intent?.kind === 'createIfAbsent') {
        if (files.has(target.targetKey)) throw Object.assign(new Error('exists'), { code: 'FS_NOT_OBSERVED' })
        files.set(target.targetKey, { content: next, version: 'v2' })
        return { version: 'v2' }
      }
      const existing = files.get(target.targetKey)
      if (existing === undefined || intent?.version !== existing.version) {
        throw Object.assign(new Error('stale'), { code: 'FS_STALE_VERSION' })
      }
      files.set(target.targetKey, { content: next, version: 'v2' })
      return { version: 'v2' }
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
        const entry = { name: 'note.txt', type: 'file' }
        const entries = workspaceEntries ?? [entrySize === null ? entry : { ...entry, size: entrySize }]
        return { path: path === '.' ? '' : path, truncated, entries }
      },
    },
  }
  return { service, calls, readByteLimits }
}

test('reads session-scoped text and saves only with an observed version', async () => {
  const { service, calls } = createService()
  assert.deepEqual(await service.read(scope, 'note.txt'), { ok: true, content: 'first', version: 'v1' })
  assert.deepEqual(await service.write(scope, 'note.txt', 'second', 'v1'), { ok: true, version: 'v2' })
  assert.equal(calls[0].intent.kind, 'replaceIfVersion')
  assert.equal(calls[0].policy.workspaceRoot, '/workspace')
  assert.deepEqual(await service.read(scope, 'note.txt'), { ok: true, content: 'second', version: 'v2' })
})

test('preserves the 2 MiB editor read limit above the 1 MiB search cap', async () => {
  const content = 'x'.repeat(1024 * 1024 + 1)
  const { service, readByteLimits } = createService({ content })
  const result = await service.read(scope, 'note.txt')
  assert.equal(result.ok, true)
  assert.equal(result.content.length, content.length)
  assert.equal(readByteLimits.at(-1), 2 * 1024 * 1024)
})

test('creates text files atomically only when the destination is absent in an existing directory', async () => {
  const { service, calls } = createService()
  assert.deepEqual(await service.createFile(scope, 'docs/new.md', '# New'), { ok: true, path: 'docs/new.md', version: 'v2' })
  assert.deepEqual(calls[0].intent, { kind: 'createIfAbsent' })
  assert.equal(calls[0].policy.workspaceRoot, '/workspace')
  assert.equal((await service.createFile(scope, 'docs/new.md', 'overwrite')).code, 'CONFLICT')
  assert.equal((await service.createFile(scope, 'docs', 'directory collision')).code, 'CONFLICT')
  assert.equal((await service.createFile(scope, 'linked/new.md', 'symlink parent')).code, 'OUT_OF_ROOT')
  assert.equal((await service.createFile(scope, 'missing/new.md', 'missing parent')).code, 'NOT_FOUND')
  assert.equal((await service.createFile(scope, '../outside.md', 'escape')).code, 'OUT_OF_ROOT')
  assert.equal((await service.createFile(scope, 'docs/invalid.txt', null)).code, 'IO')
  assert.equal((await service.createFile(scope, 'docs/large.txt', 'x'.repeat(2 * 1024 * 1024 + 1))).code, 'TOO_LARGE')
  assert.equal(calls.length, 1)
})

test('returns canonical workspace-relative paths after creating normalized aliases', async () => {
  const { service } = createService()
  assert.deepEqual(await service.createFile(scope, 'docs/../docs/new.md', ''), {
    ok: true, path: 'docs/new.md', version: 'v2',
  })
  assert.deepEqual(await service.createFile(scope, 'docs\\..\\docs\\another.md', ''), {
    ok: true, path: 'docs/another.md', version: 'v2',
  })
})

test('fails closed when creation has no live session policy or sandbox filesystem', async () => {
  const noSession = createService()
  noSession.service.context.sessions.get = () => undefined
  assert.equal((await noSession.service.createFile(scope, 'docs/new.md', '')).code, 'NO_SESSION')
  assert.equal(noSession.calls.length, 0)

  const noSandbox = createService()
  noSandbox.service.context.fs.sandboxMode = undefined
  assert.equal((await noSandbox.service.createFile(scope, 'docs/new.md', '')).code, 'SANDBOX_DENIED')
  assert.equal(noSandbox.calls.length, 0)
})

test('does not expose unknown local filesystem error details to the Client', async () => {
  const { service } = createService()
  service.context.fs.writeText = async () => { throw new Error('permission denied: /Users/alice/private/workspace') }
  const result = await service.createFile(scope, 'docs/new.md', '')
  assert.equal(result.code, 'IO')
  assert.equal(result.message.includes('/Users/alice'), false)
  assert.equal(result.message.includes('private/workspace'), false)
})

test('routes Quick Open and workspace search through the session-scoped Host', async () => {
  const { service } = createService()
  const quick = await service.quickOpen(scope, 'note')
  assert.equal(quick.ok, true)
  assert.equal(quick.results[0], 'note.txt')
  const search = await service.search(scope, 'first', {})
  assert.deepEqual(search, { ok: true, results: [{ path: 'note.txt', line: 1, snippet: 'first' }] })
})

test('Quick Open omits files hidden behind a static workspace symlink', async () => {
  const { service } = createService({
    workspaceEntries: [
      { name: 'linked', type: 'directory' },
      { name: 'inside.txt', type: 'file', size: 5 },
    ],
  })
  assert.deepEqual(await service.quickOpen(scope, 'linked/secret.txt'), { ok: true, results: [] })
})

test('accounts small opaque files by their observed size so later text matches remain searchable', async () => {
  const opaquePaths = Array.from({ length: 17 }, (_, index) => `opaque-${index}.txt`)
  const workspaceEntries = [
    ...opaquePaths.map((name) => ({ name, type: 'file', size: 1 })),
    { name: 'match.txt', type: 'file', size: 6 },
  ]
  const extraFiles = Object.fromEntries([
    ...opaquePaths.map((path) => [path, '\0']),
    ['match.txt', 'needle'],
  ])
  const { service } = createService({ workspaceEntries, extraFiles })
  assert.deepEqual(await service.search(scope, 'needle', {}), {
    ok: true,
    results: [{ path: 'match.txt', line: 1, snippet: 'needle' }],
  })
})

test('charges bytes actually read when opaque files grow after the directory listing', async () => {
  const opaquePaths = Array.from({ length: 33 }, (_, index) => `opaque-${index}.txt`)
  const workspaceEntries = [
    ...opaquePaths.map((name) => ({ name, type: 'file', size: 1 })),
    { name: 'match.txt', type: 'file', size: 6 },
  ]
  const grownBinary = `\0${'x'.repeat(1024 * 1024 - 1)}`
  const extraFiles = Object.fromEntries([
    ...opaquePaths.map((path) => [path, grownBinary]),
    ['match.txt', 'needle'],
  ])
  const { service } = createService({ workspaceEntries, extraFiles })
  assert.deepEqual(await service.search(scope, 'needle', {}), {
    ok: true,
    results: [],
    truncated: true,
  })
})

test('caps Host reads at the search per-file limit when a file grows after stat', async () => {
  const { service, readByteLimits } = createService({
    beforeRead: async (path, files) => {
      if (path === '/workspace/note.txt') files.set(path, { content: 'x'.repeat(1024 * 1024 + 1), version: 'v2' })
    },
  })
  const result = await service.search(scope, 'needle', {})
  assert.deepEqual(result, { ok: true, results: [], truncated: true })
  assert.equal(readByteLimits.at(-1), 1024 * 1024)
})

test('charges stale-growing files by the search cap and reaches later matches', async () => {
  const growingPaths = Array.from({ length: 17 }, (_, index) => `growing-${index}.txt`)
  const workspaceEntries = [
    ...growingPaths.map((name) => ({ name, type: 'file', size: 1 })),
    { name: 'match.txt', type: 'file', size: 6 },
  ]
  const extraFiles = Object.fromEntries([
    ...growingPaths.map((path) => [path, 'x']),
    ['match.txt', 'needle'],
  ])
  const { service } = createService({
    workspaceEntries,
    extraFiles,
    beforeRead: async (path, files) => {
      if (path.startsWith('/workspace/growing-')) {
        files.set(path, { content: 'x'.repeat(1024 * 1024 + 1), version: 'v2' })
      }
    },
  })
  assert.deepEqual(await service.search(scope, 'needle', {}), {
    ok: true,
    results: [{ path: 'match.txt', line: 1, snippet: 'needle' }],
    truncated: true,
  })
})

test('rejects workspace-search glob filters beyond the total character budget', async () => {
  const { service } = createService()
  const pattern = 'a'.repeat(256)
  assert.deepEqual(await service.search(scope, 'needle', { include: [pattern, pattern, pattern] }), {
    ok: false,
    code: 'IO',
    message: 'search request exceeds its input limits',
  })
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

test('propagates oversized-file skips as incomplete search metadata to Client', async () => {
  const { service } = createService({ entrySize: 2 * 1024 * 1024 })
  assert.deepEqual(await service.search(scope, 'first', {}), { ok: true, results: [], truncated: true })
})

test('flags files with missing size metadata when readBytes rejects them as too large', async () => {
  const { service, readByteLimits } = createService({
    content: 'needle',
    entrySize: null,
    unknownStatSize: true,
    readFailure: 'FS_TOO_LARGE',
  })
  assert.deepEqual(await service.search(scope, 'needle', {}), { ok: true, results: [], truncated: true })
  assert.equal(readByteLimits.at(-1), 1024 * 1024)
})

test('write reports a version conflict and preserves the current file', async () => {
  const { service, calls } = createService()
  assert.equal((await service.write(scope, 'note.txt', 'draft', 'old-version')).code, 'CONFLICT')
  assert.equal(calls.length, 1)
  assert.deepEqual(await service.read(scope, 'note.txt'), { ok: true, content: 'first', version: 'v1' })
})

test('read rejects empty or oversized version tokens before reading file content', async () => {
  for (const version of ['', 'v'.repeat(MAX_FS_VERSION_TOKEN_CHARS + 1)]) {
    const { service, readByteLimits } = createService()
    const stat = service.context.fs.stat
    service.context.fs.stat = async (...args) => {
      const info = await stat(...args)
      return info?.type === 'file' ? { ...info, version } : info
    }
    const result = await service.read(scope, 'note.txt')
    assert.equal(result.code, 'CONFLICT')
    assert.equal(readByteLimits.length, 0)
  }
})

test('create reports a conflict when the backend returns an invalid version token', async () => {
  for (const version of ['', 'v'.repeat(MAX_FS_VERSION_TOKEN_CHARS + 1)]) {
    const { service } = createService()
    service.context.fs.writeText = async () => ({ version })
    const result = await service.createFile(scope, 'docs/new.md', '')
    assert.equal(result.code, 'CONFLICT')
  }
})

test('write does not report empty or too-long post-write versions as usable success', async () => {
  const versions = ['', `missing:/workspace/${'x'.repeat(MAX_FS_VERSION_TOKEN_CHARS)}`]
  for (const version of versions) {
    const { service } = createService()
    service.context.fs.writeText = async () => ({ version })
    const result = await service.write(scope, 'note.txt', 'draft', 'v1')
    assert.equal(result.code, 'CONFLICT')
  }
})

test('write rejects oversized version tokens before filesystem access', async () => {
  const { service, calls } = createService()
  const resolve = service.context.fs.resolve
  let resolveCalls = 0
  service.context.fs.resolve = async (...args) => {
    resolveCalls += 1
    return resolve(...args)
  }
  const result = await service.write(scope, 'note.txt', 'draft', 'v'.repeat(MAX_FS_VERSION_TOKEN_CHARS + 1))
  assert.equal(result.code, 'CONFLICT')
  assert.equal(resolveCalls, 0)
  assert.equal(calls.length, 0)
})

test('write rejects missing versions, oversized content, unsafe paths, and unavailable sandbox contexts', async () => {
  const missingVersion = createService()
  assert.equal((await missingVersion.service.write(scope, 'note.txt', 'draft', '')).code, 'CONFLICT')
  assert.equal(missingVersion.calls.length, 0)

  const oversized = createService()
  assert.equal((await oversized.service.write(scope, 'note.txt', 'x'.repeat(2 * 1024 * 1024 + 1), 'v1')).code, 'TOO_LARGE')
  assert.equal(oversized.calls.length, 0)

  const directory = createService()
  assert.equal((await directory.service.write(scope, 'docs', 'draft', 'v1')).code, 'IS_DIR')

  const missingFile = createService()
  assert.equal((await missingFile.service.write(scope, 'missing.txt', 'draft', 'v1')).code, 'CONFLICT')

  const symlink = createService()
  assert.equal((await symlink.service.write(scope, 'linked', 'draft', 'v1')).code, 'OUT_OF_ROOT')

  const noSession = createService()
  noSession.service.context.sessions.get = () => undefined
  assert.equal((await noSession.service.write(scope, 'note.txt', 'draft', 'v1')).code, 'NO_SESSION')

  const noSandbox = createService()
  noSandbox.service.context.fs.sandboxMode = undefined
  assert.equal((await noSandbox.service.write(scope, 'note.txt', 'draft', 'v1')).code, 'SANDBOX_DENIED')
})

test('rejects static symlink paths and incomplete directory listings', async () => {
  const { service } = createService({ truncated: true })
  assert.equal((await service.read(scope, 'linked')).code, 'OUT_OF_ROOT')
  assert.equal((await service.list(scope, '')).code, 'TOO_LARGE')
})

test('rejects Favorite parent listings through symlinks or outside the workspace', async () => {
  const { service } = createService()
  assert.equal((await service.list(scope, 'linked')).code, 'OUT_OF_ROOT')
  assert.equal((await service.list(scope, '../outside')).code, 'OUT_OF_ROOT')
})

test('rejects absolute paths and session root mismatch for reads and writes', async () => {
  const { service, calls } = createService()
  assert.equal((await service.read(scope, '/etc/passwd')).code, 'OUT_OF_ROOT')
  assert.equal((await service.write(scope, '../outside.txt', 'draft', 'v1')).code, 'OUT_OF_ROOT')
  assert.equal((await service.read({ ...scope, workspaceRoot: '/outside' }, 'note.txt')).code, 'OUT_OF_ROOT')
  assert.equal(calls.length, 0)
})
