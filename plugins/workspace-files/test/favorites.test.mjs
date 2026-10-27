import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_FAVORITE_FILES_TOTAL,
  normalizeWorkspaceRelativePath,
  normalizeWorkspaceRoot,
} from '../src/shared/settings-contract.ts'

const favorites = await import('../lib/client/favorites.js').catch(() => ({}))

test('normalizes only bounded absolute workspace-root identities', () => {
  assert.equal(normalizeWorkspaceRoot('/'), '/')
  assert.equal(normalizeWorkspaceRoot('/workspace/demo/'), '/workspace/demo')
  assert.equal(normalizeWorkspaceRoot('///workspace/demo'), '/workspace/demo')
  assert.equal(normalizeWorkspaceRoot('/workspace/demo/../demo'), '/workspace/demo')
  assert.equal(normalizeWorkspaceRoot('C:\\workspace\\demo\\'), 'C:/workspace/demo')
  assert.equal(normalizeWorkspaceRoot('C:\\workspace\\..\\demo'), 'C:/demo')
  assert.equal(normalizeWorkspaceRoot('C:\\'), 'C:/')
  for (const root of ['', '  ', 'relative/workspace', 'C:drive-relative', '/workspace/\0bad', `/${'x'.repeat(1024)}`]) {
    assert.equal(normalizeWorkspaceRoot(root), null)
  }
})

test('normalizes workspace-relative paths, preserves POSIX colon filenames, and rejects traversal or drive prefixes', () => {
  assert.equal(normalizeWorkspaceRelativePath('docs\\./readme.md'), 'docs/readme.md')
  assert.equal(normalizeWorkspaceRelativePath('docs/a:b.txt'), 'docs/a:b.txt')
  for (const path of ['/etc/passwd', 'D:relative', './C:/absolute', 'docs/../outside', 'bad\0name', '', 'x'.repeat(1025)]) {
    assert.equal(normalizeWorkspaceRelativePath(path), null)
  }
})

test('groups favorite paths by normalized workspace root', () => {
  assert.equal(typeof favorites.favoritesForWorkspace, 'function')
  const entries = [
    { workspaceRoot: '/workspace/demo/', path: 'docs/readme.md' },
    { workspaceRoot: '/workspace/other', path: 'README.md' },
    { workspaceRoot: '/workspace/demo', path: 'src/app.ts' },
  ]
  assert.deepEqual(favorites.favoritesForWorkspace(entries, '/workspace/demo'), [
    { workspaceRoot: '/workspace/demo', path: 'docs/readme.md' },
    { workspaceRoot: '/workspace/demo', path: 'src/app.ts' },
  ])
})

test('ignores malformed legacy Favorites before displaying or re-saving them', () => {
  assert.equal(typeof favorites.favoritesForWorkspace, 'function')
  const valid = { workspaceRoot: '/workspace/demo/', path: 'docs/readme.md' }
  const entries = [
    valid,
    { workspaceRoot: '/workspace/demo', path: '../outside.txt' },
    { workspaceRoot: 'relative/workspace', path: 'readme.md' },
  ]
  assert.deepEqual(favorites.favoritesForWorkspace(entries, '/workspace/demo'), [
    { workspaceRoot: '/workspace/demo', path: 'docs/readme.md' },
  ])
  assert.deepEqual(favorites.toggleWorkspaceFavorite(entries, '/workspace/demo', 'new.md'), {
    ok: true,
    isFavorite: true,
    favorites: [
      { workspaceRoot: '/workspace/demo', path: 'docs/readme.md' },
      { workspaceRoot: '/workspace/demo', path: 'new.md' },
    ],
  })
})

test('toggles one relative favorite without changing other workspace entries', () => {
  assert.equal(typeof favorites.toggleWorkspaceFavorite, 'function')
  const initial = [{ workspaceRoot: '/workspace/other', path: 'README.md' }]
  const added = favorites.toggleWorkspaceFavorite(initial, '/workspace/demo/', 'docs\\readme.md')
  assert.deepEqual(added, {
    ok: true,
    isFavorite: true,
    favorites: [
      { workspaceRoot: '/workspace/other', path: 'README.md' },
      { workspaceRoot: '/workspace/demo', path: 'docs/readme.md' },
    ],
  })
  const removed = favorites.toggleWorkspaceFavorite(added.favorites, '/workspace/demo', 'docs/readme.md')
  assert.deepEqual(removed, {
    ok: true,
    isFavorite: false,
    favorites: [{ workspaceRoot: '/workspace/other', path: 'README.md' }],
  })
})

test('rejects absolute, escaping, NUL-containing, or empty favorite paths', () => {
  assert.equal(typeof favorites.toggleWorkspaceFavorite, 'function')
  for (const path of ['/etc/passwd', 'D:secret.txt', './D:secret.txt', './C:/foo', '../outside.txt', 'docs/../../outside.txt', 'bad\0name', '']) {
    assert.deepEqual(favorites.toggleWorkspaceFavorite([], '/workspace/demo', path), {
      ok: false,
      reason: 'invalid-path',
    })
  }
})

test('caps favorites per workspace while allowing a different workspace list', () => {
  assert.equal(typeof favorites.MAX_FAVORITES_PER_WORKSPACE, 'number')
  const root = '/workspace/demo'
  const initial = Array.from({ length: favorites.MAX_FAVORITES_PER_WORKSPACE }, (_, index) => ({
    workspaceRoot: root,
    path: `file-${index}.txt`,
  }))
  assert.deepEqual(favorites.toggleWorkspaceFavorite(initial, root, 'overflow.txt'), {
    ok: false,
    reason: 'limit',
  })
  assert.equal(favorites.toggleWorkspaceFavorite(initial, '/workspace/other', 'allowed.txt').ok, true)
})

test('accepts the 1024-character path boundary and rejects 1025 characters', () => {
  const segment = 'x'.repeat(204)
  const boundaryPath = Array.from({ length: 5 }, () => segment).join('/')
  assert.equal(boundaryPath.length, 1024)
  assert.equal(favorites.normalizeFavoritePath(boundaryPath), boundaryPath)
  assert.equal(favorites.normalizeFavoritePath(`${boundaryPath}x`), null)
  assert.equal(favorites.toggleWorkspaceFavorite([], '/workspace/demo', boundaryPath).ok, true)
  assert.deepEqual(favorites.toggleWorkspaceFavorite([], '/workspace/demo', `${boundaryPath}x`), {
    ok: false,
    reason: 'invalid-path',
  })
})

test('caps the total number of Favorites in the profile', () => {
  const entries = Array.from({ length: MAX_FAVORITE_FILES_TOTAL }, (_, index) => ({
    workspaceRoot: `/workspace/${index}`,
    path: 'favorite.txt',
  }))
  assert.deepEqual(favorites.toggleWorkspaceFavorite(entries, '/workspace/new', 'favorite.txt'), {
    ok: false,
    reason: 'limit',
  })
})
