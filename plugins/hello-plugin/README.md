# dsh-hello-plugin

Minimal starter plugin in the [`dsh-plugins`](../../README.md) workspace.

## Local development

The plugin source entry is `src/index.ts`. Build it with `pnpm --filter dsh-hello-plugin build`. To load it directly from a DSH source checkout, add a patch row there using the absolute path to this source file:

```yaml
- insert:
    - id: dsh-hello-plugin
      name: /absolute/path/to/dsh-plugins/plugins/hello-plugin/src/index.ts
```

Start DSH with that patch (for example, `pnpm dsh web --patch /path/to/cordis.yml`). The exact startup command depends on your DSH checkout and profile.

## Bundle installation

This package declares a `dsh.bundle` manifest and includes `cordis.patch.yml`. After publishing or packing it, install it into a DSH profile with:

```sh
dsh plugin --profile <profile> add <package-or-local-path>
```

The starter intentionally registers no capabilities. Implement and test behavior before publishing a real plugin. See the upstream [plugin development guide](https://github.com/anweat/dsh-plugin-dev-guide/blob/main/docs/plugin-development.md).
