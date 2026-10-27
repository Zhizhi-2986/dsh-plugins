# DSH Workspace Enhanced 0.0.3 — validation evidence

**Target:** DSH Desktop 2.0.18 with installed DSH 0.2.1-rc.2 APIs. This report covers source, tests, and build; it is not a live Desktop qualification of 0.0.3.

## 0.0.3 behavior verified

| Guarantee | Evidence |
|---|---|
| The native Files tree and Preview shell remain intact; the plugin removes its duplicate Markdown mode, overrides Markdown/Code/Plain Text body keys for direct editing, and adds Search, Quick Open, Favorites-list, Create File, and keyed Edit actions. Code reuses DSH's public CodeBlock primitive; Markdown uses the plugin's safe renderer. | `test/sidebar-files-tab.test.mjs` (SlotCore), `test/native-files-enhancements.test.mjs`, `test/editor-ui.test.mjs`, `test/explorer-ui.test.mjs` |
| Quick Open and content search remain Session-bound; Quick Open supports `path:line` and does not toggle Favorites. | `test/native-files-enhancements.test.mjs` |
| Favorites are partitioned by normalized workspace root, store relative paths, reject absolute/drive/traversal/NUL inputs, and enforce the 1,024-character boundary and Host schema limits. | `test/favorites.test.mjs`, `test/settings.test.mjs` |
| Favorites list is scoped to the current workspace, verifies the exact regular file using the Session-bound parent listing before opening, and allows removal of unavailable entries. Adding/removing from native file rows is deferred until DSH provides a public row context-menu Slot. | `test/native-files-enhancements.test.mjs`, `test/fs-service.test.mjs` |
| Markdown, Code, and Plain Text all switch the Preview body directly to EditorSurface from their toolbar action, save with the observed version, and return to the corresponding preview body. POSIX colon filenames remain editable; Create File creates only absent destinations and opens the new file in native Preview. | `test/native-files-enhancements.test.mjs`, `test/fs-service.test.mjs`, `test/path-guard.test.mjs`, `test/editor-ui.test.mjs` |
| Host create/write requires a live Session and sandbox policy; paths, symlinks, content size, parent directories, and expected versions are checked. Client and Host cap input and returned opaque version tokens at 256 characters. | `test/fs-service.test.mjs`, `test/typert-contract.test.mjs` |
| Stale ConfigForm Favorite writes are rejected and surfaced; Host Config enforces 200 entries per normalized lexical root key and 1,000 total. Case variants on case-insensitive volumes may form separate keys. | `test/native-files-enhancements.test.mjs`, `test/favorites.test.mjs`, `test/settings.test.mjs` |
| Global Replace remains unregistered. | `test/sidebar-files-tab.test.mjs`, `test/native-files-enhancements.test.mjs` |

## Deliberately deferred

Favorites additions from native file rows, row context menus, and tree-local filtering are deferred: DSH RC.2 has no public row context-menu/filter Slot, and this plugin will not inject into private DOM or replace the native tree. The Quick Open star control was removed as requested; the existing Favorites list remains available for viewing/opening/removing saved entries. Recent also remains deferred: public `sidebarRight.openTabs` has membership but no active-tab/navigation-revision event, so it cannot reliably rank revisits. Recent is not inferred from tab membership.

## Reproducible checks

- `pnpm --filter dsh-workspace-enhanced test` — **187 passing, 0 failures** (includes the TypeScript compile stage).
- `pnpm --filter dsh-workspace-enhanced build` — passed; Client bundle 410.00 kB (92.26 kB gzip).
- Coverage was not rerun after the native Markdown/Code Edit action changes; the prior 184-test snapshot measured 87.51% lines, 79.63% branches, and 80.68% functions.
- `git diff --check` — passed.
- Package-archive dry run was not performed: this shell has no `npm` executable, and the available `pnpm pack` command has no dry-run mode.

The jsdom suite still emits React 18 `act(...)`, `attachEvent`/`detachEvent`, and `getNodeFromInstance` diagnostics from retained editor tests; they did not fail the suite. SlotCore/Host-mock tests do not prove behavior inside a running DSH Desktop instance.

## RED → GREEN evidence

- Host mutation tests first failed because `createFile`/`write` returned `READ_ONLY`; they pass after re-enabling guarded `createIfAbsent` and versioned `replaceIfVersion` operations.
- UI tests first failed because the active Files action/Preview entrypoints lacked Create File and Edit; they now verify native Create File, Session-bound Preview editing, and versioned saves.
- The Quick Open star regression failed while the star was present; it now confirms no favorite toggle there. Slot tests confirm Create File is additive and Global Replace remains absent.
- A Host schema test first accepted more than 200 Favorites for one normalized workspace; the shared root normalizer and Host schema now enforce the cap across trailing-slash and dot-segment aliases.
- Version-token tests reproduced unbounded Client/Host inputs and read/create/write results; schemas now require 1–256 characters, and Host fails before reading for invalid read tokens and refuses unusable mutation outcomes.
- The POSIX colon-path Edit test initially found the Client normalizer rejecting any drive-like path segment; it now only rejects a drive prefix at the whole relative-path start, while Host path guard remains authoritative.
- The current task's regression tests first failed because only the plain-text body was overridden and Markdown/Code actions targeted the dialog variant. Native Markdown/Code body slots now host the shared inline editing path; SlotCore and jsdom coverage verifies all three renderer modes.
- Retarget regressions cover an in-flight save remaining bound to its original path and a stale preflight read failure not leaking onto the next Preview.
- Markdown, Code, and Plain Text now share the in-place Preview editor and toolbar Save/Find flow. Versioned saves return to the selected renderer body; retarget and stale-read cases stay Session/path-bound. Code rendering uses the public CodeBlock primitive. There was no live Desktop visual test.
- Final full suite: 187 passing, 0 failures.

## Persistence and security boundary

Favorites store the absolute workspace root plus relative filenames in the Host-shared profile ConfigForm; authenticated clients of that profile can see both. Favorite opens require an exact regular-file match from the Session-bound parent-directory listing; static symlink components and out-of-root paths are rejected. File writes use DSH's sandbox policy and version fence, and file creation is `createIfAbsent`.

A concurrent ancestor-symlink swap between path validation and later path-based filesystem access remains within DSH RC.2's documented TOCTOU limitation. Use only trusted, non-concurrently modified local workspaces. This restriction is documented, not enforced by a runtime toggle. Recent remains deferred as noted above.

The `desktop` profile already links this package to the local workspace, so the rebuilt bundle is available at the linked package path. The requested Desktop restart was blocked by macOS Automation permission (`osascript` returned -10004); the running app was not restarted, so live behavior remains unverified. No Desktop profile change, commit, or push was performed.
