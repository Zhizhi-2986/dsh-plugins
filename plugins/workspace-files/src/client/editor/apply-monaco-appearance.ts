/**
 * Apply appearance prefs to a loaded Monaco namespace (theme + optional custom bg).
 */

import type { EditorAppearance } from './appearance.ts'
import { EDITOR_CUSTOM_THEME_ID } from './appearance.ts'
import type { MonacoNamespace } from './monaco-loader.ts'

/**
 * Register / select Monaco theme for the current appearance snapshot.
 */
export function applyMonacoAppearance(
  monaco: MonacoNamespace,
  appearance: EditorAppearance,
): void {
  const custom = appearance.customBackground
  if (custom === null) {
    monaco.editor.setTheme(appearance.theme)
    return
  }
  const base = appearance.theme === 'vs'
    ? 'vs'
    : appearance.theme === 'hc-black'
      ? 'hc-black'
      : 'vs-dark'
  monaco.editor.defineTheme(EDITOR_CUSTOM_THEME_ID, {
    base,
    inherit: true,
    rules: [],
    colors: {
      'editor.background': custom,
      'editorGutter.background': custom,
      'editorLineNumber.foreground': base === 'vs' ? '#237893' : '#858585',
    },
  })
  monaco.editor.setTheme(EDITOR_CUSTOM_THEME_ID)
}
