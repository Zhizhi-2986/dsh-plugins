/**
 * Per-path editor buffers and dirty tracking.
 */

export interface BufferEntry {
  readonly path: string
  readonly content: string
  readonly savedContent: string
  readonly version: string
}

export type BuffersListener = () => void

/**
 * Text buffers keyed by relative path.
 */
export class BuffersStore {
  readonly #map = new Map<string, BufferEntry>()
  readonly #listeners = new Set<BuffersListener>()

  subscribe = (listener: BuffersListener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  get(path: string): BufferEntry | undefined {
    return this.#map.get(path)
  }

  /** Load or replace buffer from a successful read. Clears dirty. */
  load(path: string, content: string, version: string): void {
    this.#map.set(path, { path, content, savedContent: content, version })
    this.#emit()
  }

  /** Update draft content; dirty when content !== savedContent. */
  setContent(path: string, content: string): void {
    const prev = this.#map.get(path)
    if (prev !== undefined && prev.content === content) return
    if (prev === undefined) return
    this.#map.set(path, { ...prev, content })
    this.#emit()
  }

  /** Mark current content as saved (after successful write). */
  markSaved(path: string, savedContent: string, version: string): void {
    const prev = this.#map.get(path)
    if (prev === undefined) return
    this.#map.set(path, { ...prev, savedContent, version })
    this.#emit()
  }

  isDirty(path: string): boolean {
    const entry = this.#map.get(path)
    if (entry === undefined) return false
    return entry.content !== entry.savedContent
  }

  drop(path: string): void {
    if (!this.#map.delete(path)) return
    this.#emit()
  }

  /** Move buffer after rename. */
  rename(from: string, to: string): void {
    const prev = this.#map.get(from)
    if (prev === undefined) return
    this.#map.delete(from)
    this.#map.set(to, { ...prev, path: to })
    this.#emit()
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }
}
