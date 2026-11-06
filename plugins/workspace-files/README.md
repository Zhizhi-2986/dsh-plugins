# DSH Workspace Enhanced

A Session-scoped workspace search, text editing, file creation, Favorites, global replacement, and Preview enhancement for **DSH Desktop**.

## Current features

- Adds **Quick Open** (bounded filename/path search) and file-content search to DSH's native Workspace Files action area. It does not replace the native file tree or create another Files tab.
- Quick Open accepts `path:line`; selecting a result opens the existing Session-scoped resource in DSH's native Preview. It does not add or remove Favorites.
- The native Files action area includes a **Favorites** panel, filtered to the current workspace. It can open and remove existing Favorites; adding/removing from a file row is deferred until DSH exposes a public native row context-menu Slot. Opening a Favorite verifies the exact file through a Session-bound parent-directory listing. Entries are stored in profile configuration by workspace root and relative path.
- DSH's native Markdown, Code, and Plain Text Preview modes remain selected; the plugin does not register a duplicate **Markdown Preview** mode. It supplies editable body renderers under those native keys; Markdown uses the plugin's safe renderer, Code reuses DSH's public `CodeBlock`, and Plain Text—including `.gitignore`—uses literal text. The native Preview shell and PDF, Office, image, and other renderers remain owned by DSH.
- All three modes use the same toolbar **Edit/Save** action and switch directly between preview and editor in the Preview body. **Find** is a separate toolbar action while editing. Saves use the version observed when the file was read; editing starts only from the explicit Edit action. The native Files action area exposes **New file** with blank, Markdown, JSON, and TypeScript templates. It creates only in an existing parent directory and only when the destination is absent.
- The native Files action area also exposes **Global Replace**. It shows a bounded preview, then writes each file once with the version captured for that preview; conflicts and partial success are reported per file.
- While a file is active in the editor, the Host watches its Session-scoped workspace path. Clean buffers refresh from disk; dirty buffers keep their draft and show the existing conflict actions. If the watch stream cannot start or ends unexpectedly, the editor reports that monitoring is unavailable; saves still use version checks.
- Existing conversation-view shortcuts and optional tab reordering remain separate from the file Sidebar integration; tab reordering stays off by default.
- The existing conversation-link preference routes supported workspace file links to DSH's native Preview, not to a plugin editor.

Recent history, Favorites additions from file rows, and tree-local filtering remain deferred. DSH Desktop RC.2 exposes an additive Files action slot but no supported tree-row context-menu/filter Slot; its public `sidebarRight.openTabs` inventory also lacks a file reactivation event, so this release does not infer Recent from tab membership. The plugin does not inject into private DOM or replace the native tree. Favorites store the absolute workspace root plus relative filenames in the Host-shared profile ConfigForm; those values are visible to authenticated clients of that profile, so use Favorites only where those clients are trusted.

## 0.0.4 scope

Editing reliability and safety (`docs/research/v004-current-state.md` tracks the gap audit):

- **No automatic saves.** Leaving the editor (blur, focus change, Preview switching) never writes; only the explicit **Edit/Save** action writes. The dirty state survives across Preview navigation and is retained per file and Session.
- **Cancel with a dirty buffer.** The toolbar **Cancel** action (and the same exit paths inside the Preview body) asks **Save / Discard / Keep editing** when unsaved changes exist, with *Keep editing* as the default focus. *Discard* exits editing and drops the draft; the next Edit starts from a fresh read. DSH RC.2 offers no public tab-close interception, so closing the native tab while a dirty buffer exists keeps the draft in the cross-tab buffer store; it is not lost.
- **Save conflicts.** When Host `write` reports the target changed on disk (`CONFLICT`), the editor keeps the draft and shows a banner with **Copy draft**, **Reload from disk** (confirmed before the in-place rebase), and **Keep editing**.
- **Dirty indicator.** The editor status strip shows *Unsaved* while the active buffer differs from its saved content.
- Saves remain versioned (`replaceIfVersion`), all writes pass through the sandbox policy, and editing still starts only from the explicit Edit action; retargeting stays Session/path-bound.

## Safety and limits

The Host derives workspace scope from DSH's Session `workspaceFileScope`; the Client does not access the local filesystem directly. Writes require a live Session, a sandbox-enforcing filesystem, a workspace-relative path, and the editor's observed version token (limited to 256 characters). The Host also rejects empty or overlong version tokens returned by read/create/write; file creation uses `createIfAbsent`. Quick Open and content search remain bounded. Favorites are capped at 200 entries per normalized lexical workspace-root key and 1,000 across the profile; workspace keys and relative paths are limited to 1,024 characters. Path-component casing is preserved, so case variants on a case-insensitive volume can form separate keys; the cap is per key spelling, not a filesystem-realpath identity. ConfigForm writes use a revision fence, so stale concurrent Favorite updates are rejected and reported rather than overwriting newer entries.

**Filesystem boundary limitation:** installed DSH `0.2.1-rc.2` uses path-based filesystem targets. Its sandbox re-resolves and checks mutation targets, but explicitly accepts a residual ancestor-symlink TOCTOU window; reads are also path-based. This release does not claim race-safe confinement for an untrusted or concurrently mutable workspace. Use it only with a trusted, non-concurrent local workspace. This is a deployment restriction, not a runtime trust toggle.

## Develop and verify

From the repository root:

```sh
pnpm --filter dsh-workspace-enhanced test
pnpm --filter dsh-workspace-enhanced exec tsc -p tsconfig.json --noEmit
pnpm --filter dsh-workspace-enhanced build
```

The plugin targets DSH Desktop only. `dsh.client.platform: web` is the Desktop renderer transport and does not promise standalone DSH Web support. Component tests run in jsdom and slot tests use `SlotCore`; neither proves behavior inside a running Desktop instance. No Desktop profile is changed by build or test commands.

## Attribution and license

This plugin adapts UI and editor patterns from [SupaNexus/dsh-plugin-file-explorer](https://github.com/supanexus/dsh-plugin-file-explorer), licensed under MIT. The upstream license notice is retained in [`LICENSE`](LICENSE). Workspace scoping and search use DSH's current APIs.
