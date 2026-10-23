/**
 * Client-side tab roster for the file explorer editor.
 *
 * `getSnapshot` MUST return a stable reference between mutations — React's
 * useSyncExternalStore infinite-loops if every call allocates a new object.
 */

export interface EditorTab {
  readonly path: string
  readonly title: string
}

export interface TabsState {
  readonly open: readonly EditorTab[]
  readonly activePath: string | null
}

export type TabsListener = () => void

const EMPTY: TabsState = { open: [], activePath: null }

function titleOf(path: string): string {
  if (path === '') return '/'
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * Mutable tab roster with subscribe semantics for React.
 */
export class TabsStore {
  #open: EditorTab[] = []
  #activePath: string | null = null
  #snapshot: TabsState = EMPTY
  readonly #listeners = new Set<TabsListener>()

  getSnapshot = (): TabsState => this.#snapshot

  subscribe = (listener: TabsListener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Open or activate a path. Returns whether a new tab was created. */
  open(path: string): boolean {
    const existing = this.#open.find((t) => t.path === path)
    if (existing !== undefined) {
      if (this.#activePath === path) return false
      this.#activePath = path
      this.#emit()
      return false
    }
    this.#open = [...this.#open, { path, title: titleOf(path) }]
    this.#activePath = path
    this.#emit()
    return true
  }

  activate(path: string): void {
    if (!this.#open.some((t) => t.path === path)) return
    if (this.#activePath === path) return
    this.#activePath = path
    this.#emit()
  }

  /**
   * Close a tab. Activates neighbor to the right, else left, else null.
   * @returns whether the tab was present.
   */
  close(path: string): boolean {
    const index = this.#open.findIndex((t) => t.path === path)
    if (index < 0) return false
    const next = this.#open.filter((t) => t.path !== path)
    this.#open = next
    if (this.#activePath === path) {
      const right = next[index]
      const left = next[index - 1]
      this.#activePath = right?.path ?? left?.path ?? null
    }
    this.#emit()
    return true
  }

  /** Rename an open tab path (after a successful host rename). */
  rename(from: string, to: string): void {
    this.#open = this.#open.map((t) => (
      t.path === from ? { path: to, title: titleOf(to) } : t
    ))
    if (this.#activePath === from) this.#activePath = to
    this.#emit()
  }

  #emit(): void {
    this.#snapshot = {
      open: this.#open,
      activePath: this.#activePath,
    }
    for (const listener of this.#listeners) listener()
  }
}
