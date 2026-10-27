import test from 'node:test'
import assert from 'node:assert/strict'
import { guardPath, normalizeRelativeInput } from '../src/host/path-guard.ts'

test('normalizes workspace-relative paths and rejects traversal or absolute paths', () => {
  assert.equal(normalizeRelativeInput('.'), '')
  assert.equal(normalizeRelativeInput('src\\app.ts'), 'src/app.ts')
  assert.equal(normalizeRelativeInput('docs\\..\\docs\\new.md'), 'docs/new.md')
  assert.equal(normalizeRelativeInput('docs/a:b.txt'), 'docs/a:b.txt')
  assert.equal(normalizeRelativeInput('\\\\workspace\\secret'), null)
  assert.equal(normalizeRelativeInput('C:/foo'), null)
  assert.equal(normalizeRelativeInput('D:relative'), null)
  assert.equal(normalizeRelativeInput('../secret'), null)
  assert.equal(normalizeRelativeInput('/etc/passwd'), null)
  assert.equal(normalizeRelativeInput(`${'a/'.repeat(2048)}file`), null)
  assert.deepEqual(guardPath('/workspace', 'src/app.ts'), {
    ok: true,
    absolute: '/workspace/src/app.ts',
    relative: 'src/app.ts',
  })
  assert.deepEqual(guardPath('/workspace', 'docs/a:b.txt'), {
    ok: true,
    absolute: '/workspace/docs/a:b.txt',
    relative: 'docs/a:b.txt',
  })
  assert.deepEqual(guardPath('/workspace', 'C:/foo'), { ok: false, reason: 'INVALID' })
  assert.deepEqual(guardPath('/workspace', 'D:relative'), { ok: false, reason: 'INVALID' })
})

test('rejects a target whose resolved symlink escapes the workspace', () => {
  const result = guardPath('/workspace', 'link/secret.txt', (path) => (
    path.endsWith('/link/secret.txt') ? '/outside/secret.txt' : path
  ))
  assert.deepEqual(result, { ok: false, reason: 'OUT_OF_ROOT' })
})
