import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FILE_EXPLORER_SETTINGS, FILE_EXPLORER_SETTINGS_NS } from '../src/shared/settings-contract.ts'
import { Config, name } from '../lib/host/config.js'

test('intercepts conversation file links by default', () => {
  assert.equal(name, FILE_EXPLORER_SETTINGS_NS)
  assert.equal(DEFAULT_FILE_EXPLORER_SETTINGS.openLinksInEditor, true)
  assert.equal(DEFAULT_FILE_EXPLORER_SETTINGS.reorderViewTabs, false)
  assert.deepEqual(DEFAULT_FILE_EXPLORER_SETTINGS.viewTabOrder, [])
  assert.deepEqual(Object.keys(Config.dict ?? {}).sort(), ['openLinksInEditor', 'reorderViewTabs', 'viewTabOrder'])
})
