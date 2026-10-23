/**
 * Load Monaco from jsDelivr; callers fall back to textarea on failure.
 */

export interface MonacoEditorApi {
  readonly getValue: () => string
  readonly getModel: () => { readonly getLineCount: () => number } | null
  readonly setValue: (value: string) => void
  readonly onDidChangeModelContent: (listener: () => void) => { dispose: () => void }
  readonly dispose: () => void
  readonly layout: () => void
  readonly updateOptions: (options: Record<string, unknown>) => void
  readonly onDidBlurEditorWidget: (listener: () => void) => { dispose: () => void }
  readonly revealLineInCenter: (lineNumber: number) => void
  readonly revealRangeInCenter: (range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => void
  readonly setSelection: (range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => void
  readonly setPosition: (position: { lineNumber: number; column: number }) => void
  readonly focus: () => void
}

export interface MonacoNamespace {
  editor: {
    create: (
      container: HTMLElement,
      options: Record<string, unknown>,
    ) => MonacoEditorApi
    setTheme: (theme: string) => void
    defineTheme: (name: string, themeData: Record<string, unknown>) => void
  }
}

declare global {
  interface Window {
    require?: {
      config: (options: { paths: Record<string, string> }) => void
      (modules: string[], callback: (monaco: MonacoNamespace) => void): void
    }
    monaco?: MonacoNamespace
  }
}

const MONACO_CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
const LOAD_TIMEOUT_MS = 12_000

let loading: Promise<MonacoNamespace> | null = null

/**
 * Ensure Monaco AMD loader + editor are available.
 */
export function loadMonaco(): Promise<MonacoNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('monaco requires a browser'))
  }
  if (window.monaco !== undefined) return Promise.resolve(window.monaco)
  if (loading !== null) return loading

  loading = new Promise<MonacoNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      loading = null
      reject(new Error('monaco load timed out'))
    }, LOAD_TIMEOUT_MS)

    const finish = (monaco: MonacoNamespace): void => {
      window.clearTimeout(timer)
      window.monaco = monaco
      resolve(monaco)
    }

    const startRequire = (): void => {
      if (window.require === undefined) {
        loading = null
        window.clearTimeout(timer)
        reject(new Error('monaco AMD loader missing'))
        return
      }
      window.require.config({ paths: { vs: MONACO_CDN } })
      window.require(['vs/editor/editor.main'], (monaco) => {
        finish(monaco)
      })
    }

    if (window.require !== undefined) {
      startRequire()
      return
    }

    const script = document.createElement('script')
    script.src = `${MONACO_CDN}/loader.js`
    script.async = true
    script.onload = () => startRequire()
    script.onerror = () => {
      loading = null
      window.clearTimeout(timer)
      reject(new Error('monaco loader script failed'))
    }
    document.head.appendChild(script)
  }).catch((error) => {
    loading = null
    throw error
  })

  return loading
}

/** Map a relative path to a Monaco language id. */
export function languageForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'shell'
  return 'plaintext'
}
