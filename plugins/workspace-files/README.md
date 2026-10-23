# DSH Workspace Enhanced

A session-scoped workspace browser and text editor plugin for DeepSeek Harness Desktop.

## V0.1 scope

- Browse the active session's workspace, expand/collapse directories, and refresh the tree.
- Open files in tabs, preview Markdown, and double-click file content to enter edit mode.
- On macOS DSH Desktop, press **Option+Shift+1…9** to switch to the corresponding workspace view tab (by current visual order when the tab-reorder experiment is enabled). There is no shortcut configuration row; the defaults are built in. Open dialogs and approval modals block switching, and terminal focus is left untouched.
- Optional, **off by default**: enable “Experimental: drag to reorder top View tabs” in the plugin's settings. It changes only the native tabs' CSS visual order, preserves the selected view on drop, and saves view IDs in this plugin's profile configuration. Disabling restores the original appearance.
- Quick Open with **Ctrl/Cmd+P**; type a fuzzy filename/path and optionally append `:line`.
- Search workspace contents with case, regex, whole-word, include-glob, and exclude-glob options.
- Search the current file with **Ctrl/Cmd+F**; move through matches with Enter / Shift+Enter.
- Save with **Ctrl/Cmd+S**, the Save button, editor blur, or closing a dirty tab. Saves use an observed-version guard; conflicts preserve the unsaved buffer.

File creation, rename/delete, and global replace are intentionally out of scope for this release.

## Safety and limits

The Host resolves the active workspace from DSH's Session-derived `workspaceFileScope`; clients cannot submit a root path. Listing and reads use DSH workspace/filesystem services, and writes use `ctx.fs.writeText` with the workspace sandbox policy and expected version. Path traversal and symlink paths are rejected. Writes fail closed when a live Session policy or sandbox-enforcing filesystem is unavailable.

- Editor reads/writes: maximum 2 MiB per file.
- Workspace search: at most 2,000 files and 2,000 directories, 5,000 lines per file, 1 MiB per file, 32 MiB total, and 100 results. Directory listings that exceed the Host cap fail explicitly rather than silently returning incomplete results.
- Quick Open: at most 5,000 files, 2,000 directories, and 100 results.
- Regex search accepts only a conservative subset: groups, alternatives, backreferences, and all quantifiers are rejected. This is not a substitute for a linear-time regex engine.

The tab-reorder experiment matches the installed Desktop renderer's native Tab DOM against registered view IDs; if labels/counts do not match, it leaves the tabs untouched and does not remap the shortcut. CSS visual order does **not** change DOM/reading/focus order. This version-dependent prototype has jsdom tests but has not been installed or tested live in DSH Desktop as a reorder feature. See [VALIDATION.md](./VALIDATION.md) for test evidence, live-UI verification gaps, and known limits.

**Security review pending:** the current DSH filesystem contract does not guarantee an atomic no-follow read within the workspace root. A concurrent symlink swap between path validation and read may cross that boundary. Do not deploy this plugin for untrusted concurrent workspaces until the filesystem backend provides operation-time confinement and the plugin uses it.

## Develop

From the repository root:

```sh
pnpm install
pnpm --filter dsh-workspace-enhanced test
pnpm --filter dsh-workspace-enhanced exec tsc -p tsconfig.json --noEmit
pnpm --filter dsh-workspace-enhanced build
```

The package builds a Host entry, Typert descriptors, and a bundled Client entry. Install/enable it through a DSH Desktop plugin bundle; this package does not target standalone DSH Web, TUI, or Headless. The `dsh.client.platform: web` manifest value selects Desktop's Web renderer transport and does not add standalone Web compatibility.

To check in a running DSH Desktop instance **after separately authorizing installation/configuration**: enable the tab-reorder experiment in this plugin's settings, drag one native view Tab before another, confirm the selected Tab does not change, then press Option+Shift+1…9 and confirm each visible index follows the visual order. Switch Sessions, restart Desktop, toggle developer tools, and disable the experiment to verify persistence and native restoration. These paths are covered only by jsdom and installed-contract inspection here; this build has not been manually verified in the running Desktop app.

## Attribution and license

This plugin adapts UI and editor patterns from [SupaNexus/dsh-plugin-file-explorer](https://github.com/supanexus/dsh-plugin-file-explorer), licensed under MIT. The upstream license notice is retained in [`LICENSE`](LICENSE). The workspace scoping, Host RPC, sandboxed/versioned filesystem operations, and search implementation are adapted for DSH's current APIs.
