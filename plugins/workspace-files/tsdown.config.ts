import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig, type UserConfig } from 'tsdown'

const pluginId = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name as string
const platformModules = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]
const cssPrefix = '\0dsh-css:'

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolve(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}`
  const index = emitted.indexOf(marker)
  if (index < 0) return source
  const sourcePath = `${emitted.slice(0, index)}${sep}src${sep}${emitted.slice(index + marker.length)}`
  return existsSync(sourcePath) ? sourcePath : source
}

const config: UserConfig = {
  name: `${pluginId}/client`,
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (id: string) => platformModules.includes(id),
    alwaysBundle: (id: string) => !platformModules.includes(id),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [{
    name: 'dsh-client-css-modules',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      return `${cssPrefix}${sourceAssetPath(source, importer)}.mjs`
    },
    load(id) {
      if (!id.startsWith(cssPrefix) || !id.endsWith('.mjs')) return null
      const file = id.slice(cssPrefix.length, -4)
      this.addWatchFile(file)
      const { code, exports } = transform({
        filename: file,
        code: readFileSync(file),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes = Object.fromEntries(Object.entries(exports ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, value.name]))
      const tagId = `${pluginId}/${basename(file)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {',
        '  const tag = document.createElement("style");',
        `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig(config)
