import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.CustomEvent = dom.window.CustomEvent
dom.window.HTMLElement.prototype.attachEvent = () => {}
dom.window.HTMLElement.prototype.detachEvent = () => {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(0), 0)

const {
  WorkspaceFilesSearchAction,
  WorkspaceMarkdownBody,
  WorkspaceCodeBody,
  WorkspacePlainTextBody,
  WorkspaceDocumentEditAction,
} = await import('../lib/client/native-files-enhancements.js')
const { WorkspaceQuickOpenAction, WorkspaceCreateFileAction, WorkspaceFavoritesAction } = await import('../lib/client/native-files-actions.js')
const { editorStoresForSession } = await import('../lib/client/state/session-stores.js')
const flush = async (ms = 240) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) }) }
const copy = {
  searchWorkspace: 'Search file contents',
  searching: 'Searching',
  searchEnterQuery: 'Enter a query',
  searchNoResults: 'No results',
  searchPartial: 'Partial results',
  quickOpenEmpty: 'Enter a file name or path to search',
  favoriteTitle: 'Favorites',
  favoriteLoading: 'Loading Favorites…',
  favoriteClose: 'Close Favorites',
  favoriteChecking: 'Checking file…',
  favoriteAddDeferred: 'Adding Favorites from file rows is waiting for a native context-menu API.',
  favoriteEmpty: 'No Favorites for this workspace yet.',
  favoriteOpen: 'Open favorite file',
  favoriteRemove: 'Remove favorite',
  favoriteLimitReached: 'This workspace has reached the favorite limit.',
  favoriteUnavailable: 'File is unavailable in this session; remove or retry this favorite.',
  favoriteSaveFailed: 'Could not save favorites.',
  tabClose: 'Close tab',
  editorEdit: 'Edit file',
  editorEditAction: 'Edit',
  editorReadFailed: 'Could not read this file for editing. Check the Session and retry.',
  editorFind: 'Find',
  codePreviewCopy: 'Copy',
  codePreviewCopied: 'Copied',
  codePreviewTitle: 'Code',
  codePreviewWrap: 'Wrap lines',
  codePreviewUnwrap: 'Unwrap lines',
  editorSave: 'Save',
  editorSaving: 'Saving',
  editorFindClose: 'Close find',
}
const t = (key) => copy[key] ?? key

test('exports native Quick Open, Favorites, Create File, Preview Edit action, and bodies but not Global Replace', async () => {
  for (const component of [
    WorkspaceMarkdownBody,
    WorkspaceCodeBody,
    WorkspacePlainTextBody,
    WorkspaceDocumentEditAction,
    WorkspaceQuickOpenAction,
    WorkspaceFavoritesAction,
    WorkspaceCreateFileAction,
  ]) {
    assert.equal(typeof component, 'function')
  }
  const actions = await import('../lib/client/native-files-actions.js')
  assert.equal('WorkspaceGlobalReplaceAction' in actions, false)
})

function createContext(searchResults = [], searchFails = false, quickOpenResults = [], quickOpenFails = false, workspaceEntries = []) {
  const calls = { searches: [], quickOpens: [], lists: [], roots: [], created: [], opened: [], read: [], writes: [] }
  const ctx = {
    remote: {
      explorerFs: {
        getRoot: async (sessionId) => {
          calls.roots.push(sessionId)
          return { ok: true, value: { ok: true, root: '/workspace/demo' } }
        },
        search: async (sessionId, query, options, signal) => {
          calls.searches.push({ sessionId, query, options, signal })
          return searchFails
            ? { ok: false, error: { message: 'Search unavailable' } }
            : { ok: true, value: { ok: true, results: searchResults, truncated: false } }
        },
        quickOpen: async (sessionId, query, signal) => {
          calls.quickOpens.push({ sessionId, query, signal })
          return quickOpenFails || query.length > 256
            ? { ok: true, value: { ok: false, code: 'IO', message: 'Quick Open unavailable' } }
            : { ok: true, value: { ok: true, results: quickOpenResults, truncated: false } }
        },
        list: async (sessionId, path, signal) => {
          calls.lists.push({ sessionId, path, signal })
          return { ok: true, value: { ok: true, entries: workspaceEntries } }
        },
        createFile: async (sessionId, path, content) => {
          calls.created.push({ sessionId, path, content })
          return { ok: true, value: { ok: true, path, version: 'v1' } }
        },
        read: async (sessionId, path) => {
          calls.read.push({ sessionId, path })
          return { ok: true, value: { ok: true, content: 'needle content', version: 'v1' } }
        },
        write: async (sessionId, path, content, expectedVersion) => {
          calls.writes.push({ sessionId, path, content, expectedVersion })
          return { ok: true, value: { ok: true, version: 'v2' } }
        },
      },
    },
    locale: {
      subscribe: () => () => {},
      getSnapshot: () => ({ active: 'en-US' }),
      bind: () => t,
    },
    get(name) {
      if (name === 'sidebarRight') return { openResource: (...args) => calls.opened.push(args) }
      return undefined
    },
  }
  return { ctx, calls }
}

function createSettingsScope(favoriteFiles = [], setResult = true) {
  const listeners = new Set()
  const writes = []
  const revisions = []
  let concurrentFavorites
  let snapshot = { status: 'ready', writable: true, revision: 1, value: { favoriteFiles } }
  const publish = (field, value) => {
    snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { ...snapshot.value, [field]: value } }
    for (const listener of listeners) listener()
  }
  return {
    writes,
    revisions,
    setNextConcurrentValue: (value) => { concurrentFavorites = value },
    getValue: () => snapshot.value,
    scope: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      async set(field, value) {
        writes.push([field, value])
        if (!setResult) return false
        publish(field, value)
        return true
      },
      async mutate(ops, expectedRevision) {
        const operation = ops[0]
        writes.push([operation.path[0], operation.value])
        revisions.push(expectedRevision)
        if (concurrentFavorites !== undefined) {
          const latest = concurrentFavorites
          concurrentFavorites = undefined
          publish('favoriteFiles', latest)
        }
        if (!setResult || expectedRevision !== snapshot.revision) return false
        publish(operation.path[0], operation.value)
        return true
      },
    },
  }
}

function mount(element) {
  const root = createRoot(document.getElementById('app'))
  return {
    root,
    render: (nextElement = element) => act(async () => root.render(nextElement)),
    unmount: () => act(async () => root.unmount()),
  }
}

async function assertModalFocusTrap(first, last) {
  last.focus()
  await act(async () => Simulate.keyDown(last, { key: 'Tab' }))
  assert.equal(document.activeElement, first)
  first.focus()
  await act(async () => Simulate.keyDown(first, { key: 'Tab', shiftKey: true }))
  assert.equal(document.activeElement, last)
}

test('native plain-text Preview opens the Session-bound editor and saves with its observed version', async () => {
  const sessionId = 'plain-text-session'
  const { ctx, calls } = createContext()
  const harness = mount(React.createElement(React.Fragment, null,
    React.createElement(WorkspaceDocumentEditAction, {
      ctx,
      sessionId,
      content: { kind: 'text', text: 'first\\nthird', eof: true },
      useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/session/plain-text-session/docs/notes.txt', navigation: { params: { line: 2 } } } }),
      t,
    }),
    React.createElement(WorkspacePlainTextBody, {
      ctx,
      sessionId,
      resourceAddress: 'dsh-resource://file/session/plain-text-session/docs/notes.txt',
      content: {
        kind: 'text',
        text: 'first\n<script>not markup</script>\nthird',
        eof: true,
        pages: [{ offset: 0, text: 'first\n<script>not markup</script>\nthird', lines: 3 }],
      },
      wrap: true,
      useTabInfo: () => ({ tab: { navigation: { params: { line: 2 } } } }),
      t,
    }),
  ))
  try {
    await harness.render()
    assert.equal(document.querySelector('[data-textpreview-target="2"]')?.textContent, 'third\n')
    assert.equal(document.querySelector('script'), null)
    await act(async () => Simulate.doubleClick(document.querySelector('[data-workspace-text-body]')))
    assert.equal(document.querySelector('[data-workspace-text-body]') !== null, true)
    assert.equal(document.querySelector('[data-workspace-text-editor]'), null)
    assert.deepEqual(calls.read, [])
    const actionButton = document.querySelector('[data-workspace-document-edit-action]')
    assert.ok(actionButton)
    assert.equal(actionButton.textContent.trim(), copy.editorEditAction)
    assert.equal(document.querySelector('[data-workspace-document-action-menu]'), null)
    await act(async () => actionButton.click())
    await flush(40)
    assert.ok(document.querySelector('[data-workspace-text-editor]'))
    assert.deepEqual(calls.roots, [])
    assert.deepEqual(calls.read, [{ sessionId, path: 'docs/notes.txt' }])
    const textarea = document.querySelector('[data-workspace-text-editor] textarea')
    assert.ok(textarea)
    assert.equal(textarea.readOnly, false)
    assert.equal(document.activeElement, textarea)
    assert.equal(document.querySelector('[data-editor-primary-action]'), null)
    assert.equal(document.querySelector('[aria-label="editorFilePath"]'), null)
    assert.equal(actionButton.textContent.trim(), copy.editorSave)
    const searchButton = document.querySelector('[data-workspace-document-find-action]')
    assert.ok(searchButton)
    assert.equal(actionButton.contains(searchButton), false)
    await act(async () => searchButton.click())
    assert.ok(document.querySelector('[data-file-explorer-editor] [role="search"]'))
    await act(async () => document.querySelector(`[data-file-explorer-editor] [aria-label="${copy.editorFindClose}"]`).click())
    await act(async () => Simulate.change(textarea, { target: { value: 'edited text' } }))
    await act(async () => actionButton.click())
    await flush(40)
    assert.deepEqual(calls.writes, [{ sessionId, path: 'docs/notes.txt', content: 'edited text', expectedVersion: 'v1' }])
    assert.equal(document.querySelector('[data-workspace-text-editor]'), null)
    assert.ok(document.querySelector('[data-workspace-text-body]'), 'successful save returns to the native text preview')
    assert.match(document.querySelector('[data-textpreview-plain]')?.textContent ?? '', /edited text/u)
    assert.equal(actionButton.textContent.trim(), copy.editorEditAction)
    assert.equal(document.querySelector('[data-editor-primary-action]'), null)
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('native Markdown and Code edit directly in the Preview body', async () => {
  for (const mode of ['markdown', 'code']) {
    const { ctx, calls } = createContext()
    const sessionId = `inline-${mode}-edit-session`
    const path = `docs/readme.${mode === 'markdown' ? 'md' : 'js'}`
    const resourceAddress = `dsh-resource://file/session/${sessionId}/${path}`
    const Body = mode === 'markdown' ? WorkspaceMarkdownBody : WorkspaceCodeBody
    const bodyProps = {
      ctx,
      sessionId,
      resourceAddress,
      content: { kind: 'text', text: 'initial source', eof: true },
      ...(mode === 'code' ? { wrap: true, scrollportRef: () => {} } : {}),
      t,
    }
    const harness = mount(React.createElement(React.Fragment, null,
      React.createElement(WorkspaceDocumentEditAction, {
        ctx,
        sessionId,
        content: { kind: 'text', text: 'initial source', eof: true },
        useTabInfo: () => ({ tab: { contentId: resourceAddress, navigation: { params: {} } } }),
        t,
      }),
      React.createElement(Body, bodyProps),
    ))
    try {
      await harness.render()
      const actionButton = document.querySelector('[data-workspace-document-edit-action]')
      assert.ok(actionButton)
      assert.equal(actionButton.textContent.trim(), copy.editorEditAction)
      assert.ok(document.querySelector(`[data-workspace-${mode}-body]`))

      await act(async () => actionButton.click())
      await flush(40)
      assert.equal(document.querySelector('[data-workspace-document-edit-dialog]'), null)
      assert.ok(document.querySelector(`[data-workspace-${mode}-editor]`))
      assert.equal(actionButton.textContent.trim(), copy.editorSave)
      const findButton = document.querySelector('[data-workspace-document-find-action]')
      assert.ok(findButton)
      await act(async () => findButton.click())
      assert.ok(document.querySelector('[data-file-explorer-editor] [role="search"]'))
      await act(async () => document.querySelector(`[data-file-explorer-editor] [aria-label="${copy.editorFindClose}"]`).click())

      const textarea = document.querySelector(`[data-workspace-${mode}-editor] textarea`)
      assert.ok(textarea)
      await act(async () => Simulate.change(textarea, { target: { value: `edited ${mode}` } }))
      await act(async () => actionButton.click())
      await flush(40)
      assert.deepEqual(calls.writes, [{ sessionId, path, content: `edited ${mode}`, expectedVersion: 'v1' }])
      assert.equal(document.querySelector(`[data-workspace-${mode}-editor]`), null)
      assert.ok(document.querySelector(`[data-workspace-${mode}-body]`))
      assert.match(document.querySelector(`[data-workspace-${mode}-body]`)?.textContent ?? '', new RegExp(`edited ${mode}`, 'u'))
      assert.equal(actionButton.textContent.trim(), copy.editorEditAction)
      assert.deepEqual(calls.read, [{ sessionId, path }])
    } finally {
      await harness.unmount()
      document.getElementById('app').replaceChildren()
    }
  }
})

test('native Markdown inline editor saves with version guards and preserves dirty drafts', async () => {
  const { ctx, calls } = createContext()
  const sessionId = 'native-markdown-save-session'
  const path = 'docs/readme.md'
  const resourceAddress = `dsh-resource://file/session/${sessionId}/${path}`
  let finishWrite
  ctx.remote.explorerFs.write = (...args) => {
    calls.writes.push({ sessionId: args[0], path: args[1], content: args[2], expectedVersion: args[3] })
    return new Promise((resolve) => {
      finishWrite = () => resolve({ ok: true, value: { ok: true, version: calls.writes.length === 1 ? 'v2' : 'v3' } })
    })
  }
  const harness = mount(React.createElement(React.Fragment, null,
    React.createElement(WorkspaceDocumentEditAction, {
      ctx,
      sessionId,
      content: { kind: 'text', text: '# Read me', eof: true },
      useTabInfo: () => ({ tab: { contentId: resourceAddress, navigation: { params: {} } } }),
      t,
    }),
    React.createElement(WorkspaceMarkdownBody, {
      ctx,
      sessionId,
      resourceAddress,
      content: { kind: 'text', text: '# Read me', eof: true },
      t,
    }),
  ))
  try {
    await harness.render()
    const actionButton = document.querySelector('[data-workspace-document-edit-action]')
    await act(async () => actionButton.click())
    await flush(40)
    const textarea = document.querySelector('[data-workspace-markdown-editor] textarea')
    assert.ok(textarea)
    assert.equal(document.querySelector('[data-workspace-document-edit-dialog]'), null)
    const savedMarkdown = '# Updated after save'
    await act(async () => Simulate.change(textarea, { target: { value: savedMarkdown } }))
    await act(async () => actionButton.click())
    assert.equal(actionButton.disabled, true)
    assert.equal(actionButton.getAttribute('aria-busy'), 'true')
    assert.equal(actionButton.textContent.trim(), copy.editorSaving)
    assert.equal(typeof finishWrite, 'function')
    await act(async () => finishWrite())
    await flush(40)

    assert.equal(document.querySelector('[data-workspace-markdown-editor]'), null)
    assert.match(document.querySelector('[data-workspace-markdown-body]')?.textContent ?? '', /Updated after save/u)
    assert.equal(actionButton.textContent.trim(), copy.editorEditAction)
    await act(async () => editorStoresForSession(sessionId).buffers.setContent(path, '# Local unsaved draft'))

    await act(async () => actionButton.click())
    await flush(40)
    const reopenedTextarea = document.querySelector('[data-workspace-markdown-editor] textarea')
    assert.ok(reopenedTextarea)
    assert.equal(reopenedTextarea.readOnly, false, 're-editing the same file should reopen in edit mode')
    assert.equal(reopenedTextarea.value, '# Local unsaved draft', 're-opening should preserve an existing dirty draft')
    assert.equal(actionButton.textContent.trim(), copy.editorSave)
    const savedAgain = '# Edited a second time'
    await act(async () => Simulate.change(reopenedTextarea, { target: { value: savedAgain } }))
    await act(async () => actionButton.click())
    assert.equal(actionButton.disabled, true)
    await act(async () => finishWrite())
    await flush(40)
    assert.ok(document.querySelector('[data-workspace-markdown-body]'))
    assert.match(document.querySelector('[data-workspace-markdown-body]')?.textContent ?? '', /Edited a second time/u)
    assert.deepEqual(calls.writes, [
      { sessionId, path, content: savedMarkdown, expectedVersion: 'v1' },
      { sessionId, path, content: savedAgain, expectedVersion: 'v2' },
    ])
    assert.deepEqual(calls.read, [{ sessionId, path }])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('native Markdown inline save remains bound to its file after Preview retarget', async () => {
  const { ctx, calls } = createContext()
  const sessionId = 'native-preview-retarget-inline-save-session'
  let activePath = 'docs/first.md'
  let finishWrite
  ctx.remote.explorerFs.write = (...args) => {
    calls.writes.push({ sessionId: args[0], path: args[1], content: args[2], expectedVersion: args[3] })
    return new Promise((resolve) => {
      finishWrite = () => resolve({ ok: true, value: { ok: true, version: 'v2' } })
    })
  }
  const renderPreview = () => React.createElement(React.Fragment, null,
    React.createElement(WorkspaceDocumentEditAction, {
      ctx,
      sessionId,
      content: { kind: 'text', text: `# ${activePath}`, eof: true },
      useTabInfo: () => ({ tab: { contentId: `dsh-resource://file/session/${sessionId}/${activePath}`, navigation: { params: {} } } }),
      t,
    }),
    React.createElement(WorkspaceMarkdownBody, {
      ctx,
      sessionId,
      resourceAddress: `dsh-resource://file/session/${sessionId}/${activePath}`,
      content: { kind: 'text', text: `# ${activePath}`, eof: true },
      t,
    }),
  )
  const harness = mount(renderPreview())
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-document-edit-action]').click())
    await flush(40)
    const textarea = document.querySelector('[data-workspace-markdown-editor] textarea')
    assert.ok(textarea)
    await act(async () => Simulate.change(textarea, { target: { value: 'first file draft' } }))
    const saveButton = document.querySelector('[data-workspace-document-edit-action]')
    await act(async () => saveButton.click())
    await flush(1)
    assert.equal(saveButton.disabled, true)

    activePath = 'docs/second.md'
    await harness.render(renderPreview())
    await flush(20)
    assert.equal(document.querySelector('[data-workspace-markdown-editor]'), null)
    assert.match(document.querySelector('[data-workspace-markdown-body]')?.textContent ?? '', /docs\/second\.md/u)

    await act(async () => finishWrite())
    await flush(40)
    assert.deepEqual(calls.writes, [{
      sessionId,
      path: 'docs/first.md',
      content: 'first file draft',
      expectedVersion: 'v1',
    }])
    assert.deepEqual(calls.read, [{ sessionId, path: 'docs/first.md' }])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('stale Edit read failure is not shown for a retargeted Preview', async () => {
  const { ctx, calls } = createContext()
  const sessionId = 'native-preview-retarget-read-session'
  let activePath = 'docs/first.md'
  let finishRead
  ctx.remote.explorerFs.read = (actualSessionId, path) => {
    calls.read.push({ sessionId: actualSessionId, path })
    return new Promise((resolve) => {
      finishRead = () => resolve({ ok: true, value: { ok: false, code: 'IO', message: 'first file unavailable' } })
    })
  }
  const renderAction = () => React.createElement(WorkspaceDocumentEditAction, {
    ctx,
    sessionId,
    content: { kind: 'text', text: 'preview text', eof: true },
    useTabInfo: () => ({ tab: { contentId: `dsh-resource://file/session/${sessionId}/${activePath}`, navigation: { params: {} } } }),
    t,
  })
  const harness = mount(renderAction())
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-document-edit-action]').click())
    await flush(1)
    assert.equal(document.querySelector('[data-workspace-document-edit-action]')?.disabled, true)
    assert.equal(typeof finishRead, 'function')
    assert.deepEqual(calls.read, [{ sessionId, path: 'docs/first.md' }])

    activePath = 'docs/second.md'
    await harness.render(renderAction())
    await act(async () => finishRead())
    await flush(20)
    assert.equal(document.querySelector('[role="alert"]'), null)
    assert.equal(document.querySelector('[data-workspace-document-edit-dialog]'), null)
    assert.equal(document.querySelector('[data-workspace-document-edit-action]')?.textContent.trim(), copy.editorEditAction)
    assert.deepEqual(calls.read, [{ sessionId, path: 'docs/first.md' }])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('plaintext Preview rejects resource addresses from another Session', async () => {
  const { ctx, calls } = createContext()
  const harness = mount(React.createElement(WorkspacePlainTextBody, {
    ctx,
    sessionId: 'active-session',
    resourceAddress: 'dsh-resource://file/session/other-session/docs/notes.txt',
    content: { kind: 'text', text: 'read only', eof: true, pages: [{ offset: 0, text: 'read only', lines: 1 }] },
    wrap: false,
    useTabInfo: () => ({ tab: { navigation: { params: {} } } }),
    t,
  }))
  try {
    await harness.render()
    await act(async () => Simulate.doubleClick(document.querySelector('[data-workspace-text-body]')))
    await flush(20)
    assert.equal(document.querySelector('[data-workspace-text-editor]'), null)
    assert.deepEqual(calls.read, [])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Quick Open queries its bound Session and routes a selected line to native Preview', async () => {
  const sessionId = 'quick-open-session'
  const { ctx, calls } = createContext([], false, ['docs/readme.txt'])
  const { scope } = createSettingsScope()
  editorStoresForSession(sessionId).tabs.open('docs/previous-editor-tab.txt')
  const harness = mount(React.createElement(WorkspaceQuickOpenAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId,
    scope,
    t,
  }))
  try {
    await harness.render()
    const trigger = document.querySelector('[data-workspace-files-action="quick-open"]')
    await act(async () => trigger.click())
    let input = document.querySelector('[role="combobox"]')
    const dialog = document.querySelector('[role="dialog"]')
    const closeButton = dialog.querySelector('button[aria-label="quickOpenClose"]')
    await flush(1)
    assert.equal(document.querySelector('[role="option"]') !== null, false)
    assert.equal(dialog.textContent.includes(copy.quickOpenEmpty), true)
    assert.deepEqual(calls.quickOpens, [])
    await assertModalFocusTrap(closeButton, input)
    await act(async () => Simulate.keyDown(input, { key: 'Escape' }))
    await flush(1)
    assert.equal(document.activeElement, trigger)
    await act(async () => trigger.click())
    input = document.querySelector('[role="combobox"]')
    await act(async () => Simulate.change(input, { target: { value: 'readme.txt:12' } }))
    await flush()
    await act(async () => document.querySelector('[role="option"]').click())
    await flush(1)
    assert.equal(document.activeElement === trigger, true)
    assert.deepEqual(calls.quickOpens.map(({ sessionId: actualSession, query }) => ({ sessionId: actualSession, query })), [
      { sessionId, query: 'readme.txt' },
    ])
    assert.deepEqual(calls.opened, [[
      'dsh-resource://file/session/quick-open-session/docs/readme.txt',
      { params: { line: 12 } },
    ]])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Create File uses its bound Session and opens the new file in native Preview', async () => {
  const sessionId = 'create-file-session'
  const { ctx, calls } = createContext()
  const harness = mount(React.createElement(WorkspaceCreateFileAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId,
    t,
  }))
  try {
    await harness.render()
    const trigger = document.querySelector('[data-file-explorer-create-file]')
    assert.ok(trigger)
    await act(async () => trigger.click())
    const dialog = document.querySelector('[role="dialog"]')
    const input = dialog.querySelector('[aria-label="createFilePath"]')
    await act(async () => Simulate.change(input, { target: { value: 'docs/new.txt' } }))
    await act(async () => dialog.querySelector('button[type="submit"]').click())
    await flush(20)
    assert.deepEqual(calls.created, [{ sessionId, path: 'docs/new.txt', content: '' }])
    assert.deepEqual(calls.opened, [[
      'dsh-resource://file/session/create-file-session/docs/new.txt',
    ]])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Create File Escape closes the modal and restores trigger focus', async () => {
  const { ctx } = createContext()
  const harness = mount(React.createElement(WorkspaceCreateFileAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'create-cancel-session',
    t,
  }))
  try {
    await harness.render()
    const trigger = document.querySelector('[data-file-explorer-create-file]')
    await act(async () => trigger.click())
    const input = document.querySelector('[role="dialog"] [aria-label="createFilePath"]')
    await act(async () => Simulate.keyDown(input, { key: 'Escape' }))
    await flush(1)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement === trigger, true)
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Create File shows Host conflicts without navigating away', async () => {
  const { ctx, calls } = createContext()
  ctx.remote.explorerFs.createFile = async (sessionId, path, content) => {
    calls.created.push({ sessionId, path, content })
    return { ok: true, value: { ok: false, code: 'CONFLICT', message: 'file already exists' } }
  }
  const harness = mount(React.createElement(WorkspaceCreateFileAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'create-conflict-session',
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-file-explorer-create-file]').click())
    const dialog = document.querySelector('[role="dialog"]')
    const input = dialog.querySelector('[aria-label="createFilePath"]')
    await act(async () => Simulate.change(input, { target: { value: 'docs/new.txt' } }))
    await act(async () => dialog.querySelector('button[type="submit"]').click())
    await flush(20)
    assert.equal(document.querySelector('[role="alert"]')?.textContent, 'file already exists')
    assert.notEqual(document.querySelector('[role="dialog"]'), null)
    assert.deepEqual(calls.opened, [])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Create File reports transport failures and keeps the dialog open for retry', async () => {
  const { ctx, calls } = createContext()
  ctx.remote.explorerFs.createFile = async () => { throw new Error('transport unavailable') }
  const harness = mount(React.createElement(WorkspaceCreateFileAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'create-transport-session',
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-file-explorer-create-file]').click())
    const dialog = document.querySelector('[role="dialog"]')
    await act(async () => Simulate.change(dialog.querySelector('[aria-label="createFilePath"]'), { target: { value: 'docs/new.txt' } }))
    await act(async () => dialog.querySelector('button[type="submit"]').click())
    await flush(20)
    assert.equal(document.querySelector('[role="alert"]')?.textContent, 'transport unavailable')
    assert.notEqual(document.querySelector('[role="dialog"]'), null)
    assert.deepEqual(calls.opened, [])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Quick Open surfaces business failures instead of presenting an empty result list', async () => {
  const { ctx, calls } = createContext([], false, [], true)
  const { scope } = createSettingsScope()
  const harness = mount(React.createElement(WorkspaceQuickOpenAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'quick-open-error-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="quick-open"]').click())
    await act(async () => Simulate.change(document.querySelector('[role="combobox"]'), { target: { value: 'missing' } }))
    await flush()
    assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Quick Open unavailable')
    assert.deepEqual(calls.quickOpens.map(({ query }) => query), ['missing'])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Quick Open does not add or remove Favorites beside search results', async () => {
  const sessionId = 'quick-open-no-favorites-session'
  const { ctx } = createContext([], false, ['docs/readme.md'])
  const { scope } = createSettingsScope()
  const harness = mount(React.createElement(WorkspaceQuickOpenAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId,
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="quick-open"]').click())
    await act(async () => Simulate.change(document.querySelector('[role="combobox"]'), { target: { value: 'readme' } }))
    await flush()
    assert.equal(document.querySelector('[role="option"]')?.textContent, 'docs/readme.md')
    assert.equal(document.querySelector('[data-workspace-favorite-toggle]') !== null, false)
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('reports a Host-rejected Favorite removal without hiding the saved entry', async () => {
  const { ctx } = createContext()
  const { scope, writes, revisions } = createSettingsScope([
    { workspaceRoot: '/workspace/demo', path: 'docs/readme.md' },
  ], false)
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'favorite-refused-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="favorites"]').click())
    await act(async () => document.querySelector('[data-workspace-favorite-remove="docs/readme.md"]').click())
    assert.equal(document.querySelector('[role="alert"]')?.textContent, copy.favoriteSaveFailed)
    assert.notEqual(document.querySelector('[data-workspace-favorite-remove="docs/readme.md"]'), null)
    assert.deepEqual(writes, [['favoriteFiles', []]])
    assert.deepEqual(revisions, [1])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('a stale revision cannot overwrite a newer profile Favorites list', async () => {
  const { ctx } = createContext()
  const { scope, writes, revisions, setNextConcurrentValue, getValue } = createSettingsScope([
    { workspaceRoot: '/workspace/demo', path: 'docs/readme.md' },
  ])
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'favorite-conflict-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="favorites"]').click())
    setNextConcurrentValue([{ workspaceRoot: '/workspace/demo', path: 'external.md' }])
    await act(async () => document.querySelector('[data-workspace-favorite-remove="docs/readme.md"]').click())
    assert.equal(document.querySelector('[role="alert"]')?.textContent, copy.favoriteSaveFailed)
    assert.deepEqual(revisions, [1])
    assert.deepEqual(getValue().favoriteFiles, [{ workspaceRoot: '/workspace/demo', path: 'external.md' }])
    assert.deepEqual(writes, [['favoriteFiles', []]])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Favorites dialog moves focus inside, traps Tab, handles Escape, and restores trigger focus', async () => {
  const { ctx } = createContext()
  const { scope } = createSettingsScope([{ workspaceRoot: '/workspace/demo', path: 'docs/readme.md' }])
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'favorite-focus-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    const trigger = document.querySelector('[data-workspace-files-action="favorites"]')
    await act(async () => trigger.click())
    const closeButton = document.querySelector('[role="dialog"] button[aria-label="Close Favorites"]')
    const removeButton = document.querySelector('[data-workspace-favorite-remove="docs/readme.md"]')
    assert.equal(document.activeElement === closeButton, true)
    await assertModalFocusTrap(closeButton, removeButton)
    await act(async () => Simulate.keyDown(document.activeElement, { key: 'Escape' }))
    await flush(1)
    assert.equal(document.activeElement === trigger, true)
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Favorites list is workspace-scoped, verifies through a Session-scoped parent listing, and supports removal', async () => {
  assert.equal(typeof WorkspaceFavoritesAction, 'function')
  const sessionId = 'favorite-list-session'
  const root = '/workspace/demo'
  const { ctx, calls } = createContext([], false, [], false, [
    { name: 'readme.md', path: 'docs/readme.md', kind: 'file' },
  ])
  const { scope, writes } = createSettingsScope([
    { workspaceRoot: root, path: 'docs/readme.md' },
    { workspaceRoot: '/workspace/other', path: 'private.md' },
  ])
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: root,
    sessionId,
    scope,
    t,
  }))
  try {
    await harness.render()
    const trigger = document.querySelector('[data-workspace-files-action="favorites"]')
    await act(async () => trigger.click())
    const dialog = document.querySelector('[role="dialog"]')
    assert.equal(dialog.textContent.includes('docs/readme.md'), true)
    assert.equal(dialog.textContent.includes('private.md'), false)
    await act(async () => document.querySelector('[data-workspace-favorite-open="docs/readme.md"]').click())
    await flush(1)
    assert.equal(document.activeElement === trigger, true)
    assert.deepEqual(calls.lists.map(({ sessionId: actualSession, path }) => ({ sessionId: actualSession, path })), [
      { sessionId, path: 'docs' },
    ])
    assert.deepEqual(calls.opened, [[
      'dsh-resource://file/session/favorite-list-session/docs/readme.md',
    ]])

    await act(async () => trigger.click())
    await act(async () => document.querySelector('[data-workspace-favorite-remove="docs/readme.md"]').click())
    assert.deepEqual(writes, [[
      'favoriteFiles',
      [{ workspaceRoot: '/workspace/other', path: 'private.md' }],
    ]])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('malformed persisted Favorites cannot be exposed as open actions', async () => {
  const { ctx, calls } = createContext()
  const { scope } = createSettingsScope([
    { workspaceRoot: '/workspace/demo', path: '../outside.txt' },
    { workspaceRoot: '/workspace/demo', path: 'C:/private.txt' },
    { workspaceRoot: 'relative/workspace', path: 'readme.md' },
  ])
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'malformed-favorite-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="favorites"]').click())
    assert.equal(document.querySelectorAll('[data-workspace-favorite-open]').length, 0)
    assert.deepEqual(calls.lists, [])
    assert.deepEqual(calls.opened, [])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('opens long Favorites through exact parent-directory listing, not Quick Open query limits', async () => {
  const { ctx, calls } = createContext([], false, [], false, [
    { name: `file-${'x'.repeat(260)}.md`, path: `docs/file-${'x'.repeat(260)}.md`, kind: 'file' },
  ])
  const path = `docs/file-${'x'.repeat(260)}.md`
  const { scope } = createSettingsScope([{ workspaceRoot: '/workspace/demo', path }])
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'long-favorite-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="favorites"]').click())
    await act(async () => document.querySelector(`[data-workspace-favorite-open="${path}"]`).click())
    await flush(1)
    assert.deepEqual(calls.lists.map(({ sessionId, path: parent }) => ({ sessionId, path: parent })), [
      { sessionId: 'long-favorite-session', path: 'docs' },
    ])
    assert.deepEqual(calls.quickOpens, [])
    assert.deepEqual(calls.opened, [[`dsh-resource://file/session/long-favorite-session/${path}`]])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('stale favorites show feedback and remain removable', async () => {
  const { ctx, calls } = createContext()
  const { scope, writes } = createSettingsScope([{ workspaceRoot: '/workspace/demo', path: 'missing.txt' }])
  const harness = mount(React.createElement(WorkspaceFavoritesAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'stale-favorite-session',
    scope,
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-files-action="favorites"]').click())
    await act(async () => document.querySelector('[data-workspace-favorite-open="missing.txt"]').click())
    assert.equal(document.querySelector('[role="alert"]')?.textContent, copy.favoriteUnavailable)
    assert.equal(document.querySelector('[data-workspace-favorite-remove="missing.txt"]') !== null, true)
    assert.deepEqual(calls.lists.map(({ path }) => path), [''])
    assert.deepEqual(writes, [])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('native Files search action searches its bound Session and opens the result in native preview', async () => {
  const { ctx, calls } = createContext([{ path: 'docs/guide.md', line: 7, snippet: 'needle in text' }])
  const harness = mount(React.createElement(WorkspaceFilesSearchAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'session-1',
    t,
  }))
  try {
    await harness.render()
    const trigger = document.querySelector('[aria-label="Search file contents"]')
    await act(async () => trigger.click())
    let input = document.querySelector('[role="searchbox"]')
    const closeButton = document.querySelector('[role="dialog"] button[aria-label="Close tab"]')
    await assertModalFocusTrap(closeButton, input)
    await act(async () => Simulate.keyDown(input, { key: 'Escape' }))
    await flush(1)
    assert.equal(document.activeElement, trigger)
    await act(async () => trigger.click())
    input = document.querySelector('[role="searchbox"]')
    await act(async () => Simulate.change(input, { target: { value: 'needle' } }))
    await flush()
    const result = document.querySelector('[role="option"]')
    assert.match(result.textContent, /docs\/guide\.md:7/u)
    assert.deepEqual(calls.searches.map(({ sessionId, query }) => ({ sessionId, query })), [
      { sessionId: 'session-1', query: 'needle' },
    ])
    await act(async () => result.click())
    assert.deepEqual(calls.opened, [[
      'dsh-resource://file/session/session-1/docs/guide.md',
      { params: { line: 7 } },
    ]])
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('clears stale search results as soon as the query changes', async () => {
  const { ctx } = createContext([{ path: 'docs/old.md', line: 1, snippet: 'old result' }])
  const harness = mount(React.createElement(WorkspaceFilesSearchAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'session-1',
    t,
  }))
  let resultsAfterQueryChange
  try {
    await harness.render()
    await act(async () => document.querySelector('[aria-label="Search file contents"]').click())
    const input = document.querySelector('[role="searchbox"]')
    await act(async () => Simulate.change(input, { target: { value: 'old' } }))
    await flush()
    assert.ok(document.querySelector('[role="option"]'))
    await act(async () => Simulate.change(input, { target: { value: 'new' } }))
    resultsAfterQueryChange = document.querySelector('[role="option"]')
  } finally {
    const input = document.querySelector('[role="searchbox"]')
    if (input !== null) await act(async () => Simulate.change(input, { target: { value: '' } }))
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
  assert.equal(resultsAfterQueryChange, null)
})

test('native Files search surfaces RPC errors without silently showing an empty result', async () => {
  const { ctx } = createContext([], true)
  const harness = mount(React.createElement(WorkspaceFilesSearchAction, {
    ctx,
    absolutePath: '/workspace/demo',
    sessionId: 'session-1',
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[aria-label="Search file contents"]').click())
    const input = document.querySelector('[role="searchbox"]')
    await act(async () => Simulate.change(input, { target: { value: 'needle' } }))
    await flush()
    assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Search unavailable')
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Preview toolbar Edit opens a POSIX colon-named file in the same Session', async () => {
  const { ctx, calls } = createContext()
  const sessionId = 'colon-path-session'
  const path = 'docs/a:b.md'
  const harness = mount(React.createElement(React.Fragment, null,
    React.createElement(WorkspaceDocumentEditAction, {
      ctx,
      sessionId,
      content: { kind: 'text', text: '# Colon filename', eof: true },
      useTabInfo: () => ({ tab: { contentId: `dsh-resource://file/session/${sessionId}/docs/a%3Ab.md`, navigation: { params: {} } } }),
      t,
    }),
    React.createElement(WorkspacePlainTextBody, {
      ctx,
      sessionId,
      resourceAddress: `dsh-resource://file/session/${sessionId}/docs/a%3Ab.md`,
      content: { kind: 'text', text: '# Colon filename', eof: true, pages: [{ offset: 0, text: '# Colon filename', lines: 1 }] },
      wrap: true,
      useTabInfo: () => ({ tab: { navigation: { params: {} } } }),
      t,
    }),
  ))
  const editRequests = []
  const onEdit = (event) => editRequests.push(event.detail)
  window.addEventListener('file-explorer:open', onEdit)
  try {
    await harness.render()
    const editButton = document.querySelector('[data-workspace-document-edit-action]')
    assert.ok(editButton)
    assert.equal(editButton.textContent.trim(), copy.editorEditAction)
    assert.equal(document.querySelector('[data-workspace-edit-file]'), null)
    await act(async () => editButton.click())
    await flush(40)
    assert.equal(document.querySelector('[data-workspace-text-editor]') !== null, true)
    assert.deepEqual(calls.roots, [])
    assert.deepEqual(calls.read, [{ sessionId, path }])
    assert.deepEqual(editRequests, [{ path, line: undefined, edit: true, sessionId }])
  } finally {
    window.removeEventListener('file-explorer:open', onEdit)
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})

test('Preview toolbar Edit reports read transport failures with editor-specific copy', async () => {
  const { ctx } = createContext()
  const sessionId = 'edit-read-failure-session'
  ctx.remote.explorerFs.read = async () => { throw new Error('transport unavailable') }
  const harness = mount(React.createElement(WorkspaceDocumentEditAction, {
    ctx,
    sessionId,
    content: { kind: 'text', text: 'text', eof: true },
    useTabInfo: () => ({ tab: { contentId: `dsh-resource://file/session/${sessionId}/docs/readme.md`, navigation: { params: {} } } }),
    t,
  }))
  try {
    await harness.render()
    await act(async () => document.querySelector('[data-workspace-document-edit-action]').click())
    await flush(20)
    assert.equal(document.querySelector('[role="alert"]')?.textContent, copy.editorReadFailed)
  } finally {
    await harness.unmount()
    document.getElementById('app').replaceChildren()
  }
})
