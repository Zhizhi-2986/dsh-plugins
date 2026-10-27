import test from 'node:test'
import assert from 'node:assert/strict'
import z from '@deepseek-ai/schemastery'
import { volatileForm } from '../node_modules/@deepseek-ai/dsh-settings/lib/types/schema.js'
import { DEFAULT_FILE_EXPLORER_SETTINGS, FILE_EXPLORER_SETTINGS_NS, MAX_FAVORITE_FILES_TOTAL } from '../src/shared/settings-contract.ts'
import { Config, name } from '../lib/host/config.js'

test('Host volatile settings schema survives DSH form serialization and client rehydration', () => {
  const form = volatileForm(Config)
  assert.ok(form)
  const rehydrated = z(JSON.parse(JSON.stringify(form.toJSON())))
  const value = {
    openLinksInEditor: true,
    reorderViewTabs: false,
    viewTabOrder: [],
    favoriteFiles: [{ workspaceRoot: '/workspace/demo', path: 'docs/readme.md' }],
  }
  assert.deepEqual(rehydrated(value), value)

  const longEntry = { workspaceRoot: '/workspace/demo', path: 'x'.repeat(1025) }
  assert.throws(() => rehydrated({ ...value, favoriteFiles: [longEntry] }))
  const tooMany = Array.from({ length: MAX_FAVORITE_FILES_TOTAL + 1 }, (_, index) => ({
    workspaceRoot: `/workspace/${index}`,
    path: 'favorite.md',
  }))
  assert.throws(() => rehydrated({ ...value, favoriteFiles: tooMany }))
})

test('bounds persisted Favorite fields and total count', () => {
  const segment = 'x'.repeat(204)
  const path = Array.from({ length: 5 }, () => segment).join('/')
  const workspaceRoot = `/${'r'.repeat(1023)}`
  const entry = { workspaceRoot, path }
  assert.equal(path.length, 1024)
  assert.equal(workspaceRoot.length, 1024)
  assert.doesNotThrow(() => Config({ favoriteFiles: [entry] }))
  assert.throws(() => Config({ favoriteFiles: [{ ...entry, path: `${path}x` }] }))
  assert.throws(() => Config({ favoriteFiles: [{ ...entry, workspaceRoot: `${workspaceRoot}x` }] }))
  assert.throws(() => Config({ favoriteFiles: Array.from({ length: MAX_FAVORITE_FILES_TOTAL + 1 }, () => entry) }))
  assert.throws(() => Config({ favoriteFiles: [{ workspaceRoot: '/workspace/demo', path: 42 }] }))
})

test('intercepts conversation file links by default', () => {
  assert.equal(name, FILE_EXPLORER_SETTINGS_NS)
  assert.equal(DEFAULT_FILE_EXPLORER_SETTINGS.openLinksInEditor, true)
  assert.equal(DEFAULT_FILE_EXPLORER_SETTINGS.reorderViewTabs, false)
  assert.deepEqual(DEFAULT_FILE_EXPLORER_SETTINGS.viewTabOrder, [])
  assert.deepEqual(DEFAULT_FILE_EXPLORER_SETTINGS.favoriteFiles, [])
  assert.deepEqual(Object.keys(Config.dict ?? {}).sort(), ['favoriteFiles', 'openLinksInEditor', 'reorderViewTabs', 'viewTabOrder'])
})
