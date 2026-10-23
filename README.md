# DSH Plugins

Community plugins for **DSH Desktop only**, maintained by [@zhizhi-2986](https://github.com/zhizhi-2986). The Desktop renderer uses DSH's Web client transport, but standalone DSH Web, TUI, and Headless are outside this repository's compatibility scope.

> This repository is an independent community project and is not affiliated with DeepSeek.

## Repository layout

```text
plugins/
  hello-plugin/      # Minimal installable DSH bundle example
  workspace-files/   # Session-scoped workspace browser, editor, and search
```

## Develop

Requirements: Node.js 22+ and pnpm 10+ (confirm exact versions against your DSH installation).

```sh
pnpm install
pnpm build
```

To try the example from a local DSH source checkout, add the plugin source entry from that checkout's `cordis.yml` patch. The plugin entry is `plugins/hello-plugin/src/index.ts`; local source patches use an absolute path as the Cordis module name. See [plugins/hello-plugin/README.md](plugins/hello-plugin/README.md).

The workspace browser/editor plugin is documented in [plugins/workspace-files/README.md](plugins/workspace-files/README.md). Its test, typecheck, and build commands are scoped to `dsh-workspace-enhanced`.

## Add a plugin

1. Create a directory under `plugins/`.
2. Export `name` and `apply(ctx)` from its entry module; declare required services through `inject`.
3. Add a `cordis.patch.yml` patch and a `dsh.bundle` manifest in `package.json` for distribution.
4. Document how to install, configure, run, and remove the plugin.

See [DSH plugin development guide](https://github.com/anweat/dsh-plugin-dev-guide/blob/main/docs/plugin-development.md) and [publishing guide](https://github.com/anweat/dsh-plugin-dev-guide/blob/main/docs/publishing.md).

## License

MIT
