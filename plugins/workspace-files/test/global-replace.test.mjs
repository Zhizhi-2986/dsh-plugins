import test from 'node:test'
import assert from 'node:assert/strict'
import { BuffersStore } from '../lib/client/state/buffers.js'
import { applyReplacementPreview, createReplacementPreview, replacementExcerpt, replaceLiteralBounded } from '../lib/client/explorer/replace-preview.js'

function result(value) { return { ok: true, value } }

test('bounds literal expansion and chunks dense-match output parts', () => {
  const source = 'a'.repeat(100_000)
  assert.throws(() => replaceLiteralBounded(source, 'a', 'x'.repeat(20_000), 2 * 1024 * 1024), /limit/u)
  assert.deepEqual(replaceLiteralBounded('a'.repeat(3000), 'a', 'b', 3000), {
    content: 'b'.repeat(3000),
    byteLength: 3000,
  })
})

function createApi({ results = [{ path: 'a.txt', line: 1, snippet: 'token' }], truncated = false, files = {}, writes = [] } = {}) {
  return {
    search: async (query, options) => {
      assert.equal(options.caseSensitive, true)
      return result({ results, truncated })
    },
    read: async (path) => result(files[path] ?? { content: 'token token', version: 'v1' }),
    write: async (...args) => {
      writes.push(args)
      return result({ version: 'v2' })
    },
  }
}

test('anchors before/after excerpts at the original match for replacement and deletion', () => {
  const before = `original done marker ${'x'.repeat(170)} intended token context near the end`
  const offset = before.indexOf('token')
  const replaced = before.slice(0, offset) + 'done' + before.slice(offset + 'token'.length)
  const removed = before.slice(0, offset) + before.slice(offset + 'token'.length)
  const replacedExcerpt = replacementExcerpt(replaced, offset, 'done'.length)
  const removedExcerpt = replacementExcerpt(removed, offset, 0)
  assert.match(replacedExcerpt, /intended done context/u)
  assert.equal(replacedExcerpt.includes('original done marker'), false)
  assert.match(removedExcerpt, /intended  context/u)
})

test('previews exact literal occurrences once per file without writing', async () => {
  const writes = []
  const api = createApi({
    results: [
      { path: 'a.txt', line: 1, snippet: 'token token' },
      { path: 'a.txt', line: 2, snippet: 'token' },
    ],
    files: { 'a.txt': { content: 'token token\ntoken', version: 'v7' } },
    writes,
  })
  const preview = await createReplacementPreview(api, new BuffersStore(), 'token', '$&')
  assert.equal(preview.totalOccurrences, 3)
  assert.deepEqual(preview.files.map(({ path, count, version, after }) => ({ path, count, version, after })), [
    { path: 'a.txt', count: 3, version: 'v7', after: '$& $&\n$&' },
  ])
  assert.equal(writes.length, 0)
})

test('refuses empty, truncated, result-capped, oversized, and dirty-buffer previews', async () => {
  const api = createApi({ truncated: true })
  await assert.rejects(() => createReplacementPreview(api, new BuffersStore(), '', 'x'), /non-whitespace/u)
  await assert.rejects(() => createReplacementPreview(api, new BuffersStore(), 'token\ntext', 'x'), /single-line/u)
  await assert.rejects(() => createReplacementPreview(api, new BuffersStore(), 'token', 'x'), /incomplete/u)
  const largeReplacement = createApi({ files: { 'a.txt': { content: 'token', version: 'v1' } } })
  await assert.rejects(() => createReplacementPreview(largeReplacement, new BuffersStore(), 'token', 'x'.repeat(2 * 1024 * 1024 + 1)), /2 MiB/u)
  const manyFiles = Array.from({ length: 17 }, (_, index) => `${index}.txt`)
  const oversizedPreview = createApi({
    results: manyFiles.map((path) => ({ path, line: 1, snippet: 'token' })),
    files: Object.fromEntries(manyFiles.map((path) => [path, { content: 'token', version: 'v1' }])),
  })
  await assert.rejects(() => createReplacementPreview(oversizedPreview, new BuffersStore(), 'token', 'x'.repeat(1_000_000)), /16 MiB/u)
  const capped = createApi({ results: Array.from({ length: 100 }, (_, index) => ({ path: `${index}.txt`, line: 1, snippet: 'token' })) })
  await assert.rejects(() => createReplacementPreview(capped, new BuffersStore(), 'token', 'x'), /narrow/u)
  const dirtyBuffers = new BuffersStore()
  dirtyBuffers.load('a.txt', 'token', 'v1')
  dirtyBuffers.setContent('a.txt', 'draft token')
  await assert.rejects(() => createReplacementPreview(createApi(), dirtyBuffers, 'token', 'x'), /unsaved/u)
})

test('does not overwrite editor drafts created while a multi-file replacement is running', async () => {
  const buffers = new BuffersStore()
  buffers.load('a.txt', 'token', 'v1')
  buffers.load('b.txt', 'token', 'v1')
  const writes = []
  const api = createApi({
    results: [
      { path: 'a.txt', line: 1, snippet: 'token' },
      { path: 'b.txt', line: 1, snippet: 'token' },
    ],
    files: {
      'a.txt': { content: 'token', version: 'v1' },
      'b.txt': { content: 'token', version: 'v1' },
    },
    writes,
  })
  const preview = await createReplacementPreview(api, buffers, 'token', 'done')
  api.write = async (...args) => {
    writes.push(args)
    buffers.setContent('a.txt', 'draft typed during write')
    buffers.setContent('b.txt', 'draft before its write')
    return result({ version: 'v2' })
  }
  const outcomes = await applyReplacementPreview(api, buffers, preview)
  assert.deepEqual(writes.map(([path]) => path), ['a.txt'])
  assert.equal(buffers.get('a.txt').content, 'draft typed during write')
  assert.equal(buffers.get('a.txt').savedContent, 'done')
  assert.equal(buffers.get('a.txt').version, 'v2')
  assert.equal(buffers.isDirty('a.txt'), true)
  assert.equal(buffers.get('b.txt').content, 'draft before its write')
  assert.equal(outcomes[0].ok, true)
  assert.equal(outcomes[0].message.includes('draft'), true)
  assert.equal(outcomes[1].ok, false)
})

test('reports partial writes and version conflicts without retrying stale files', async () => {
  const writes = []
  const api = createApi({
    results: [
      { path: 'a.txt', line: 1, snippet: 'token' },
      { path: 'b.txt', line: 1, snippet: 'token' },
    ],
    files: {
      'a.txt': { content: 'token', version: 'v1' },
      'b.txt': { content: 'token', version: 'v4' },
    },
    writes,
  })
  api.write = async (...args) => {
    writes.push(args)
    return args[0] === 'a.txt'
      ? result({ version: 'v2' })
      : { ok: false, error: { message: 'file version changed' } }
  }
  const preview = await createReplacementPreview(api, new BuffersStore(), 'token', 'done')
  const outcomes = await applyReplacementPreview(api, new BuffersStore(), preview)
  assert.deepEqual(outcomes, [
    { path: 'a.txt', ok: true },
    { path: 'b.txt', ok: false, message: 'file version changed' },
  ])
  assert.deepEqual(writes.map(([path, , version]) => [path, version]), [['a.txt', 'v1'], ['b.txt', 'v4']])
})

test('applies each reviewed version once and refuses files dirtied after preview', async () => {
  const buffers = new BuffersStore()
  buffers.load('a.txt', 'token token', 'v1')
  const writes = []
  const api = createApi({ files: { 'a.txt': { content: 'token token', version: 'v1' } }, writes })
  const preview = await createReplacementPreview(api, buffers, 'token', 'done')
  const applied = await applyReplacementPreview(api, buffers, preview)
  assert.deepEqual(writes, [['a.txt', 'done done', 'v1']])
  assert.deepEqual(applied, [{ path: 'a.txt', ok: true }])
  assert.deepEqual(buffers.get('a.txt'), { path: 'a.txt', content: 'done done', savedContent: 'done done', version: 'v2' })

  buffers.setContent('a.txt', 'new unsaved draft')
  const before = writes.length
  await assert.rejects(() => applyReplacementPreview(api, buffers, preview), /unsaved/u)
  assert.equal(writes.length, before)
})
