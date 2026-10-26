import test from 'node:test'
import assert from 'node:assert/strict'
import { guardPath, normalizeRelativeInput } from '../src/host/path-guard.ts'

test('normalizes workspace-relative paths and rejects traversal or absolute paths', () => {
  assert.equal(normalizeRelativeInput('.'), '')
  assert.equal(normalizeRelativeInput('src\\app.ts'), 'src/app.ts')
  assert.equal(normalizeRelativeInput('docs\\..\\docs\\new.md'), 'docs/new.md')
  assert.equal(normalizeRelativeInput('\\\\workspace\\secret'), null)
  assert.equal(normalizeRelativeInput('../secret'), null)
  assert.equal(normalizeRelativeInput('/etc/passwd'), null)
  assert.equal(normalizeRelativeInput(`${'a/'.repeat(2048)}file`), null)
  assert.deepEqual(guardPath('/workspace', 'src/app.ts'), {
    ok: true,
    absolute: '/workspace/src/app.ts',
    relative: 'src/app.ts',
  })
})

test('rejects a target whose resolved symlink escapes the workspace', () => {
  const result = guardPath('/workspace', 'link/secret.txt', (path) => (
    path.endsWith('/link/secret.txt') ? '/outside/secret.txt' : path
  ))
  assert.deepEqual(result, { ok: false, reason: 'OUT_OF_ROOT' })
})
