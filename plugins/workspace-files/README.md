# DSH Workspace Enhanced

A Session-scoped workspace search, text editing, file creation, Favorites, and Preview enhancement for **DSH Desktop**.

## 0.0.3 scope

- Adds **Quick Open** (bounded filename/path search) and file-content search to DSH's native Workspace Files action area. It does not replace the native file tree or create another Files tab.
- Quick Open accepts `path:line`; selecting a result opens the existing Session-scoped resource in DSH's native Preview. It does not add or remove Favorites.
- The native Files action area includes a **Favorites** panel, filtered to the current workspace. It can open and remove existing Favorites; adding/removing from a file row is deferred until DSH exposes a public native row context-menu Slot. Opening a Favorite verifies the exact file through a Session-bound parent-directory listing. Entries are stored in profile configuration by workspace root and relative path.
- DSH's native Markdown, Code, and Plain Text Preview modes remain selected; the plugin does not register a duplicate **Markdown Preview** mode. It supplies editable body renderers under those native keys; Markdown uses the plugin's safe renderer, Code reuses DSH's public `CodeBlock`, and Plain Text—including `.gitignore`—uses literal text. The native Preview shell and PDF, Office, image, and other renderers remain owned by DSH.
- All three modes use the same toolbar **Edit/Save** action and switch directly between preview and editor in the Preview body. **Find** is a separate toolbar action while editing. Saves use the version observed when the file was read; editing starts only from the explicit Edit action. The native Files action area exposes **New file**, which creates an empty file only when its parent directory exists and the destination is absent. Host writes require a live Session and sandbox policy and validate paths; Global Replace remains unregistered.
- Existing conversation-view shortcuts and optional tab reordering remain separate from the file Sidebar integration; tab reordering stays off by default.
- The existing conversation-link preference routes supported workspace file links to DSH's native Preview, not to a plugin editor.

Recent history, Favorites additions from file rows, tree-local filtering, and global replacement remain deferred. DSH Desktop RC.2 exposes an additive Files action slot but no supported tree-row context-menu/filter Slot; its public `sidebarRight.openTabs` inventory also lacks a file reactivation event, so this release does not infer Recent from tab membership. The plugin does not inject into private DOM or replace the native tree. Favorites store the absolute workspace root plus relative filenames in the Host-shared profile ConfigForm; those values are visible to authenticated clients of that profile, so use Favorites only where those clients are trusted.

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
