import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { registerWorkspaceFilesEnhancements, WORKSPACE_CREATE_FILE_ACTION_ID } from '../lib/client/sidebar-files-tab.js'

test('adds native Files actions and a Preview Edit action without replacing native owners', async () => {
  const slots = new SlotCore()
  const disposeRoot = slots.register({
    name: 'root',
    children: { 'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' } },
  }, () => null)
  const nativeFilesBody = () => null
  const nativeTextBody = () => null
  const nativeMarkdownBody = () => null
  const nativeCodeBody = () => null
  const nativePlainTextBody = () => null
  const searchAction = () => null
  const quickOpenAction = () => null
  const favoritesAction = () => null
  const createFileAction = () => null
  const documentEditAction = () => null
  const enhancedMarkdownBody = () => null
  const enhancedCodeBody = () => null
  const enhancedPlainTextBody = () => null
  const disposeFiles = slots.register({
    name: 'sidebar.right.pane.tab',
    key: '@deepseek-ai/dsh-client-ui-sidebar-files',
    children: { 'sidebar.right.tab.files.actions': { kind: 'list', scope: 'session' } },
  }, nativeFilesBody)
  const disposeTextPreview = slots.register({
    name: 'sidebar.right.pane.tab',
    key: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview',
    children: {
      'sidebar.right.tab.document': { kind: 'keyed', scope: 'session' },
      'sidebar.right.tab.document.action': {
        kind: 'keyed',
        scope: 'session',
        inject: { hooks: { tabInfo: (_standard, useTabInfo) => useTabInfo } },
      },
    },
  }, nativeTextBody)
  const nativeMarkdownId = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown'
  const nativeCodeId = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code'
  const disposeNativeMarkdown = slots.register({
    name: 'sidebar.right.tab.document',
    key: nativeMarkdownId,
  }, nativeMarkdownBody)
  const disposeNativeCode = slots.register({
    name: 'sidebar.right.tab.document',
    key: nativeCodeId,
  }, nativeCodeBody)
  const nativePlainTextId = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text'
  const disposeNativePlainText = slots.register({
    name: 'sidebar.right.tab.document',
    key: nativePlainTextId,
  }, nativePlainTextBody)
  const context = {
    slots: {
      inject(name, factory) {
        return factory()
      },
      register: (...args) => slots.register(...args),
    },
  }

  const disposeExtensions = registerWorkspaceFilesEnhancements(context, {
    searchAction,
    quickOpenAction,
    favoritesAction,
    createFileAction,
    documentEditAction,
    markdownBody: enhancedMarkdownBody,
    codeBody: enhancedCodeBody,
    plainTextBody: enhancedPlainTextBody,
  })

  const sidebarEntries = slots.entriesOfSlot('sidebar.right.pane.tab')
  assert.deepEqual(sidebarEntries.map((entry) => entry.component), [nativeFilesBody, nativeTextBody])
  const actionEntries = slots.entries('sidebar.right.tab.files.actions')
  assert.deepEqual(actionEntries.map((entry) => entry.component), [searchAction, quickOpenAction, favoritesAction, createFileAction])
  assert.deepEqual(actionEntries.map((entry) => entry.options.id), [
    'dsh-workspace-enhanced/search',
    'dsh-workspace-enhanced/quick-open',
    'dsh-workspace-enhanced/favorites',
    WORKSPACE_CREATE_FILE_ACTION_ID,
  ])
  assert.equal(actionEntries.some((entry) => /global-replace/u.test(entry.options.id)), false)
  const documentActionEntries = slots.entriesOfSlot('sidebar.right.tab.document.action')
  assert.deepEqual(documentActionEntries.map((entry) => [entry.options.key, entry.component]), [
    [nativeMarkdownId, documentEditAction],
    [nativeCodeId, documentEditAction],
    [nativePlainTextId, documentEditAction],
  ])
  const documentEntries = slots.entriesOfSlot('sidebar.right.tab.document')
  assert.equal(documentEntries.find((entry) => entry.options.key === 'dsh-workspace-enhanced/markdown'), undefined)
  assert.equal(documentEntries.find((entry) => entry.options.key === nativeMarkdownId)?.component, enhancedMarkdownBody)
  assert.equal(documentEntries.find((entry) => entry.options.key === nativeCodeId)?.component, enhancedCodeBody)
  assert.equal(documentEntries.find((entry) => entry.options.key === nativeMarkdownId)?.options.priority, -1)
  assert.equal(documentEntries.find((entry) => entry.options.key === nativeCodeId)?.options.priority, -1)
  const plainTextEntry = documentEntries.find((entry) => entry.options.key === nativePlainTextId)
  assert.equal(plainTextEntry?.component, enhancedPlainTextBody)
  assert.equal(plainTextEntry?.options.priority, -1)

  disposeExtensions()
  disposeNativeMarkdown()
  disposeNativeCode()
  disposeNativePlainText()
  disposeTextPreview()
  disposeFiles()
  disposeRoot()

  const entrypoint = await readFile(fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)), 'utf8')
  assert.match(entrypoint, /registerWorkspaceFilesEnhancements/u)
  assert.doesNotMatch(entrypoint, /documentPreviews|presentation="dialog"/u)
  assert.doesNotMatch(entrypoint, /registerEnhancedWorkspaceFilesTab|FilesView\s*\(/u)
  assert.doesNotMatch(entrypoint, /name:\s*'conversation\.view'/u)
  assert.match(entrypoint, /installDesktopViewShortcuts/u)
  assert.match(entrypoint, /installDesktopTabReorder/u)
})

test('declares native sidebar package dependencies and optional peer metadata', async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const inject = manifest.dsh.client.inject
  const required = [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-api-workspace-files',
    '@deepseek-ai/dsh-client-resources',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-sidebar-right',
    '@deepseek-ai/dsh-client-ui-sidebar-files',
    '@deepseek-ai/dsh-client-ui-sidebar-documentpreview',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-shortcuts',
  ]
  for (const packageName of required) {
    assert.ok(inject.includes(packageName), `client inject must include ${packageName}`)
  }
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'], '*')
  for (const packageName of [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-resources',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-ui-sidebar-files',
    '@deepseek-ai/dsh-client-ui-sidebar-documentpreview',
    '@deepseek-ai/dsh-client-ui-sidebar-right',
  ]) {
    assert.equal(manifest.peerDependencies[packageName], '*')
    assert.deepEqual(manifest.peerDependenciesMeta[packageName], { optional: true })
  }
})
