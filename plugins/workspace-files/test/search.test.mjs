import test from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyPathScore, quickOpenWorkspace, searchWorkspace } from '../src/search.mts'

function createFiles(fileMap) {
  return {
    async list(_scope, path) {
      const prefix = path ? `${path}/` : ''
      const entries = Object.keys(fileMap)
        .filter((name) => name.startsWith(prefix) && !name.slice(prefix.length).includes('/'))
        .map((name) => ({ name: name.slice(prefix.length), type: 'file' }))
      const directories = [...new Set(Object.keys(fileMap)
        .filter((name) => name.startsWith(prefix) && name.slice(prefix.length).includes('/'))
        .map((name) => name.slice(prefix.length).split('/')[0]))]
        .map((name) => ({ name, type: 'directory' }))
      return { ok: true, value: { path, entries: [...directories, ...entries], truncated: false } }
    },
    async read(_scope, path) {
      return { ok: true, value: { text: fileMap[path], offset: 1, lines: fileMap[path].split('\n').length, eof: true } }
    }
  }
}

const scope = 'session-1'

test('returns case-insensitive matches with relative path, line, and snippet', async () => {
  const files = createFiles({ 'src/a.ts': 'first\nNeedle here\nlast' })
  const result = await searchWorkspace(files, scope, '', 'needle')
  assert.deepEqual(result, [{ path: 'src/a.ts', line: 2, snippet: 'Needle here' }])
})

test('skips binary and ignored directories', async () => {
  const files = createFiles({
    'node_modules/pkg/index.js': 'needle',
    '.git/config': 'needle',
    'assets/icon.png': '\u0000needle',
    'README.md': 'needle'
  })
  const result = await searchWorkspace(files, scope, '', 'needle')
  assert.deepEqual(result.map((match) => match.path), ['README.md'])
})

test('returns no matches for an empty query', async () => {
  const result = await searchWorkspace(createFiles({ 'a.md': 'text' }), scope, '', '  ')
  assert.deepEqual(result, [])
})

test('reports truncation instead of failing when the file limit is reached', async () => {
  const reasons = []
  const results = await searchWorkspace(createFiles({ 'a.md': 'needle', 'b.md': 'needle' }), scope, '', 'needle', {
    maxFiles: 1,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.equal(results.length, 1)
  assert.deepEqual(reasons, ['files'])
})

test('counts glob-filtered files toward the search work limit', async () => {
  const reasons = []
  const results = await searchWorkspace(createFiles({
    'skip-1.tmp': 'irrelevant',
    'skip-2.tmp': 'irrelevant',
    'match.md': 'needle',
  }), scope, '', 'needle', {
    maxFiles: 1,
    exclude: ['*.tmp'],
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.deepEqual(results, [])
  assert.deepEqual(reasons, ['files'])
})

test('rejects glob filters whose total pattern work exceeds the bounded budget', async () => {
  const pattern = 'a'.repeat(256)
  await assert.rejects(
    searchWorkspace(createFiles({ 'a.md': 'needle' }), scope, '', 'needle', {
      include: [pattern, pattern, pattern],
    }),
    /Glob filter limit/u,
  )
})

test('flags files skipped by the per-file byte cap as incomplete search results', async () => {
  const reasons = []
  const files = {
    async list() {
      return { ok: true, value: { entries: [{ name: 'large.md', type: 'file', size: 2 * 1024 * 1024 }] } }
    },
    async read() { throw new Error('oversized file should be skipped before reading') },
  }
  const results = await searchWorkspace(files, scope, '', 'needle', {
    maxFileBytes: 1024 * 1024,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.deepEqual(results, [])
  assert.deepEqual(reasons, ['files'])
})

test('reports truncation when a read exceeds the per-file byte cap despite missing metadata', async () => {
  const reasons = []
  const files = {
    async list() { return { ok: true, value: { entries: [{ name: 'large.md', type: 'file' }] } } },
    async read() { return { ok: true, value: { text: `needle${'x'.repeat(1024 * 1024)}` } } },
  }
  const results = await searchWorkspace(files, scope, '', 'needle', {
    maxFileBytes: 1024 * 1024,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.deepEqual(results, [])
  assert.deepEqual(reasons, ['files'])
})

test('scans oversized text files up to the line cap and flags partial results', async () => {
  const reasons = []
  const results = await searchWorkspace(createFiles({ 'long.md': 'first\nsecond\nthird' }), scope, '', 'third', {
    maxLines: 2,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.deepEqual(results, [])
  assert.deepEqual(reasons, ['lines'])
})

test('reports truncation instead of failing when the directory limit is reached', async () => {
  const reasons = []
  await searchWorkspace(createFiles({ 'a/one.txt': 'x', 'b/two.txt': 'x' }), scope, '', 'x', {
    maxDirectories: 1,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.deepEqual(reasons, ['directories'])
})

test('charges conservative read bytes when a document is truncated or undecodable', async () => {
  const reasons = []
  const files = {
    async list() { return { ok: true, value: { entries: [{ name: 'unknown.txt', type: 'file' }] } } },
    async read() { return { ok: true, value: { content: '', offset: 1, bytesRead: 2000 } } },
  }
  await searchWorkspace(files, scope, '', 'needle', {
    maxTotalBytes: 1000,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.deepEqual(reasons, ['bytes'])
})

test('counts oversized read content toward the aggregate scan byte budget', async () => {
  const reasons = []
  const reads = []
  const directories = ['a', 'b', 'c', 'd', 'e']
  const files = {
    async list(_scope, path) {
      return { ok: true, value: { entries: path === ''
        ? directories.map((name) => ({ name, type: 'directory' }))
        : [{ name: 'file.md', type: 'file' }] } }
    },
    async read(_scope, path) {
      reads.push(path)
      return { ok: true, value: { text: 'x'.repeat(1500) } }
    },
  }
  await searchWorkspace(files, scope, '', 'needle', {
    maxFileBytes: 1024,
    maxTotalBytes: 2500,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.equal(reads.length, 2, 'oversized per-file reads still consume aggregate budget')
  assert.deepEqual(reasons, ['files', 'bytes'])
})

test('bounds the queued directory frontier and flags skipped subdirectories', async () => {
  const reasons = []
  let listCalls = 0
  const directories = Array.from({ length: 3000 }, (_, index) => `dir-${index}`)
  const files = {
    async list(_scope, path) {
      listCalls += 1
      return { ok: true, value: { entries: path === ''
        ? directories.map((name) => ({ name, type: 'directory' }))
        : [] } }
    },
    async read() { return { ok: true, value: { text: '' } } },
  }
  await searchWorkspace(files, scope, '', 'needle', {
    maxDirectories: 2500,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.equal(listCalls, 2001, 'the root plus at most 2,000 queued directory paths are visited')
  assert.deepEqual(reasons, ['directories'])
})

test('bounds the Quick Open directory frontier and reports partial results', async () => {
  let listCalls = 0
  let truncated = false
  const directories = Array.from({ length: 3000 }, (_, index) => `dir-${index}`)
  const files = {
    async list(_scope, path) {
      listCalls += 1
      return { ok: true, value: { entries: path === ''
        ? directories.map((name) => ({ name, type: 'directory' }))
        : [] } }
    },
    async read() { return { ok: true, value: { text: '' } } },
  }
  await quickOpenWorkspace(files, scope, 'needle', {
    maxDirectories: 2000,
    onTruncated: () => { truncated = true },
  })
  assert.equal(listCalls, 2000)
  assert.equal(truncated, true)
})

test('stops the whole traversal after one file crosses the total byte budget', async () => {
  const reasons = []
  const reads = []
  const directories = ['a', 'b', 'c', 'd', 'e']
  const files = {
    async list(_scope, path) {
      return { ok: true, value: { entries: path === ''
        ? directories.map((name) => ({ name, type: 'directory' }))
        : [{ name: 'file.md', type: 'file', size: 1 }] } }
    },
    async read(_scope, path) {
      reads.push(path)
      return { ok: true, value: { text: 'x' } }
    },
  }
  await searchWorkspace(files, scope, '', 'needle', {
    maxTotalBytes: 1,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.equal(reads.length, 2, 'only the file crossing the byte budget may be read beyond it')
  assert.deepEqual(reasons, ['bytes'])
})

test('reports incomplete results when the result limit stops the search', async () => {
  const reasons = []
  const files = createFiles({ 'a.md': 'hit\nhit', 'b.md': 'hit' })
  const result = await searchWorkspace(files, scope, '', 'hit', {
    maxResults: 2,
    onTruncated: (reason) => reasons.push(reason),
  })
  assert.equal(result.length, 2)
  assert.deepEqual(reasons, ['results'])
})

test('honors an already-aborted signal', async () => {
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await assert.rejects(
    searchWorkspace(createFiles({ 'a.md': 'hit' }), scope, '', 'hit', { signal: controller.signal }),
    /cancelled/
  )
})

test('supports case sensitivity, regular expressions, and whole-word matching', async () => {
  const files = createFiles({ 'src/words.ts': 'Cat cat cats\nNeedle42 needleX' })
  assert.deepEqual(await searchWorkspace(files, scope, '', 'Cat', { caseSensitive: true }), [
    { path: 'src/words.ts', line: 1, snippet: 'Cat cat cats' },
  ])
  assert.deepEqual(await searchWorkspace(files, scope, '', 'needle\\d', { regex: true }), [
    { path: 'src/words.ts', line: 2, snippet: 'Needle42 needleX' },
  ])
  assert.deepEqual(await searchWorkspace(files, scope, '', 'cat', { wholeWord: true }), [
    { path: 'src/words.ts', line: 1, snippet: 'Cat cat cats' },
  ])
})

test('rejects quantified regex groups that can cause catastrophic backtracking', async () => {
  const files = createFiles({ 'src/large.txt': 'a!' })
  await assert.rejects(
    searchWorkspace(files, scope, '', '(a|aa)+$', { regex: true }),
    /quantified regex groups are not supported/i,
  )
})

test('rejects repeated optional atoms before matching any file', async () => {
  const files = createFiles({ 'src/large.txt': 'aa!' })
  await assert.rejects(
    searchWorkspace(files, scope, '', `${'a?'.repeat(50)}b`, { regex: true }),
    /quantifier|unsupported/i,
  )
})

test('rejects single unbounded quantifier that could cause quadratic scans', async () => {
  await assert.rejects(
    searchWorkspace(createFiles({ 'a.txt': 'aaa!' }), scope, '', 'a+z', { regex: true }),
    /quantifier|unsupported/i,
  )
})

test('matches repeated wildcard filters without exponential backtracking', async () => {
  const start = performance.now()
  const results = await searchWorkspace(
    createFiles({ [`${'a'.repeat(48)}.txt`]: 'needle' }), scope, '', 'needle',
    { include: [`${'*'.repeat(14)}Z`] },
  )
  assert.deepEqual(results, [])
  assert.ok(performance.now() - start < 150, 'glob matching should not block the Host event loop')
})

test('applies include and exclude globs before reading files', async () => {
  const files = createFiles({ 'src/a.ts': 'needle', 'docs/a.md': 'needle', 'src/vendor/a.ts': 'needle' })
  assert.deepEqual(
    (await searchWorkspace(files, scope, '', 'needle', { include: ['src/**/*.ts'], exclude: ['**/vendor/**'] }))
      .map((match) => match.path),
    ['src/a.ts'],
  )
})

test('preserves globstar directory filters without regex backtracking', async () => {
  const files = createFiles({
    'src/note.ts': 'needle',
    'src/deep/note.ts': 'needle',
    'other/note.ts': 'needle',
  })
  const results = await searchWorkspace(files, scope, '', 'needle', { include: ['src/**/note.ts'] })
  assert.deepEqual(results.map((match) => match.path).sort(), ['src/deep/note.ts', 'src/note.ts'])
})

test('scores file paths by subsequence with stronger contiguous matches', () => {
  assert.equal(fuzzyPathScore('src/ExplorerPanel.tsx', 'exq'), null)
  assert.ok(fuzzyPathScore('src/ExplorerPanel.tsx', 'expa') !== null)
  assert.ok(fuzzyPathScore('src/explorer.tsx', 'explorer') < fuzzyPathScore('docs/explorer-guide.md', 'explorer'))
})

test('quick-open traverses bounded workspace listings and ignores generated directories', async () => {
  const files = createFiles({
    'src/ExplorerPanel.tsx': '',
    'docs/explorer-guide.md': '',
    'node_modules/pkg/ExplorerPanel.tsx': '',
  })
  assert.deepEqual(await quickOpenWorkspace(files, scope, 'expa'), ['src/ExplorerPanel.tsx'])
})

test('supports the workspace plugin list and read DTOs', async () => {
  const files = {
    async list(_scope, path) {
      if (path === '') return { ok: true, value: { entries: [{ name: 'src', path: 'src', kind: 'dir' }] } }
      return { ok: true, value: { entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }] } }
    },
    async read(_scope, path) {
      assert.equal(path, 'src/app.ts')
      return { ok: true, value: { content: 'const target = true' } }
    }
  }
  assert.deepEqual(
    await searchWorkspace(files, scope, '', 'target'),
    [{ path: 'src/app.ts', line: 1, snippet: 'const target = true' }]
  )
})
