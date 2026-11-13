# DSH Plugins Enhanced

Community plugins for **DSH Desktop**, maintained by [@zhizhi-2986](https://github.com/zhizhi-2986). The main plugin enhances the current Session's workspace files and native document preview.

> This is an independent community project and is not affiliated with DeepSeek. The compatibility target is DSH Desktop; standalone DSH Web, TUI, and Headless are outside the scope of this repository.

## Workspace enhancement

[`dsh-workspace-enhanced`](plugins/workspace-files/README.md) adds actions to Desktop's existing Files area and editing to its native Preview:

- **Find files and content:** Quick Open searches filenames and paths, supports `path:line`, and opens results in native Preview. Content search searches the current workspace.
- **Edit text files:** Edit Markdown, code, and plain text directly in Preview. Save explicitly, find text while editing, and retain unsaved drafts when navigating between previews. Conflicts offer options to copy the draft, reload from disk, or continue editing.
- **Create files:** Create a blank, Markdown, JSON, or TypeScript file in an existing directory. Existing files are not overwritten.
- **Replace across files:** Preview matches before applying Global Replace; version conflicts and partial success are reported per file.
- **Open saved Favorites:** View, open, and remove Favorites for the current workspace. Adding Favorites from native file rows is not yet available.
- **Customize conversation views:** Switch among the first nine views with `Alt/Option + Shift + 1–9` by default; the modifier is configurable. Native view tab reordering is optional and disabled by default. Supported workspace file links in conversations open in native Preview by default.

The native file tree and Preview shell remain in place. Recent files, tree filtering, and adding Favorites from file rows are not currently available. Search and replacement are bounded, and file writes use the version observed when the file was read or previewed. See the [plugin README](plugins/workspace-files/README.md) for editing behavior, settings, limits, and security details.

The filesystem boundary in DSH `0.2.1-rc.2` has a documented ancestor-symlink race limitation. Use the plugin with a trusted local workspace that is not being modified concurrently; see the [plugin safety notes](plugins/workspace-files/README.md#safety-and-limits).

## Repository layout

```text
plugins/
  workspace-files/   # Workspace search, editing, creation, replacement, and Preview
  hello-plugin/      # Minimal installable DSH bundle example
```

## Develop

The workspace declares pnpm 10 in `package.json`. Install dependencies and build from the repository root:

```sh
pnpm install
pnpm build
```

To check the workspace plugin separately:

```sh
pnpm --filter dsh-workspace-enhanced test
pnpm --filter dsh-workspace-enhanced exec tsc -p tsconfig.json --noEmit
pnpm --filter dsh-workspace-enhanced build
```

The plugin's dependency baseline is DSH `0.2.1-rc.2`. Tests use mocks and jsdom/SlotCore; they do not establish behavior in a running Desktop instance. See [validation evidence](plugins/workspace-files/VALIDATION.md) for the recorded checks and their scope.

For the starter bundle and local development setup, see [hello-plugin](plugins/hello-plugin/README.md). New plugins should export `name` and `apply(ctx)`, declare required services through `inject`, and include a `cordis.patch.yml` patch and `dsh.bundle` manifest. See the [DSH plugin development guide](https://github.com/anweat/dsh-plugin-dev-guide/blob/main/docs/plugin-development.md) and [publishing guide](https://github.com/anweat/dsh-plugin-dev-guide/blob/main/docs/publishing.md).

## License

MIT. The workspace plugin retains its [upstream attribution and license notice](plugins/workspace-files/LICENSE).
