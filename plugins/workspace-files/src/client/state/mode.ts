/**
 * In-memory explorer mode flag (sidebar occupancy).
 * Subscribe API matches useSyncExternalStore (`() => void` listeners).
 */

export type ModeListener = () => void

export class ExplorerModeStore {
  private enabled = false
  private readonly listeners = new Set<ModeListener>()

  getSnapshot = (): boolean => this.enabled

  subscribe = (listener: ModeListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setEnabled(next: boolean): void {
    if (this.enabled === next) return
    this.enabled = next
    for (const listener of this.listeners) listener()
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled)
    return this.enabled
  }
}
