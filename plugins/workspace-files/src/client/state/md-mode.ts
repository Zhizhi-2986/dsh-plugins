/**
 * Per-path markdown preview vs source mode (in-memory only).
 */

export type MdMode = 'source' | 'preview'

export type MdModeListener = () => void

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}

/**
 * Remember preview/source preference per path for the session.
 */
export class MdModeStore {
  readonly #modes = new Map<string, MdMode>()
  readonly #listeners = new Set<MdModeListener>()

  subscribe = (listener: MdModeListener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  get(path: string): MdMode {
    return this.#modes.get(path) ?? 'source'
  }

  set(path: string, mode: MdMode): void {
    this.#modes.set(path, mode)
    this.#emit()
  }

  toggle(path: string): MdMode {
    const next: MdMode = this.get(path) === 'preview' ? 'source' : 'preview'
    this.set(path, next)
    return next
  }

  rename(from: string, to: string): void {
    const mode = this.#modes.get(from)
    if (mode === undefined) return
    this.#modes.delete(from)
    this.#modes.set(to, mode)
    this.#emit()
  }

  drop(path: string): void {
    if (!this.#modes.delete(path)) return
    this.#emit()
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }
}
