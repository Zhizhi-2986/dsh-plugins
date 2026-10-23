import test from 'node:test'
import assert from 'node:assert/strict'
import { TabsStore } from '../src/client/state/tabs.ts'
import { MdModeStore } from '../src/client/state/md-mode.ts'

test('opens, activates, and closes tabs without duplicating paths', () => {
  const tabs = new TabsStore()
  assert.equal(tabs.open('a/b.ts'), true)
  assert.equal(tabs.open('a/b.ts'), false)
  assert.deepEqual(tabs.getSnapshot(), { open: [{ path: 'a/b.ts', title: 'b.ts' }], activePath: 'a/b.ts' })
  assert.equal(tabs.open('c.md'), true)
  assert.equal(tabs.getSnapshot().activePath, 'c.md')
  tabs.activate('a/b.ts')
  assert.equal(tabs.getSnapshot().activePath, 'a/b.ts')
  assert.equal(tabs.close('a/b.ts'), true)
  assert.deepEqual(tabs.getSnapshot(), { open: [{ path: 'c.md', title: 'c.md' }], activePath: 'c.md' })
  assert.equal(tabs.close('missing'), false)
})

test('closing the last tab clears the active path and renames keep the tab focused', () => {
  const tabs = new TabsStore()
  tabs.open('one.txt')
  tabs.open('two.txt')
  tabs.close('two.txt')
  assert.equal(tabs.getSnapshot().activePath, 'one.txt')
  tabs.rename('one.txt', 'renamed/dir/three.txt')
  assert.deepEqual(tabs.getSnapshot(), {
    open: [{ path: 'renamed/dir/three.txt', title: 'three.txt' }],
    activePath: 'renamed/dir/three.txt',
  })
  tabs.close('renamed/dir/three.txt')
  assert.deepEqual(tabs.getSnapshot(), { open: [], activePath: null })
})

test('keeps snapshots referentially stable between mutations for useSyncExternalStore', () => {
  const tabs = new TabsStore()
  tabs.open('stable.txt')
  const snapshot = tabs.getSnapshot()
  assert.equal(tabs.getSnapshot(), snapshot)
  let notifications = 0
  const unsubscribe = tabs.subscribe(() => { notifications += 1 })
  tabs.open('other.txt')
  unsubscribe()
  tabs.close('other.txt')
  assert.equal(notifications, 1)
})

test('tracks Markdown preview mode per path and drops it with the tab', () => {
  const modes = new MdModeStore()
  assert.equal(modes.get('doc.md'), 'source')
  assert.equal(modes.toggle('doc.md'), 'preview')
  assert.equal(modes.get('doc.md'), 'preview')
  modes.rename('doc.md', 'renamed.md')
  assert.equal(modes.get('doc.md'), 'source')
  assert.equal(modes.get('renamed.md'), 'preview')
  modes.drop('renamed.md')
  assert.equal(modes.get('renamed.md'), 'source')
})
