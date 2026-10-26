export const MAX_EXPAND_ALL_DIRECTORIES = 10
export const MAX_EXPAND_ALL_ENTRIES = 2_000

export interface TreeExpansionBudget {
  readonly id: number
  claim(path: string): boolean
  takeEntries(path: string, count: number): number
}

/** Bound directory loads and rendered entries for one Expand All action. */
export function createTreeExpansionBudget(
  id: number,
  onLimit: () => void,
  maxDirectories = MAX_EXPAND_ALL_DIRECTORIES,
  maxEntries = MAX_EXPAND_ALL_ENTRIES,
): TreeExpansionBudget {
  const paths = new Set<string>()
  const entryLimits = new Map<string, number>()
  let remainingEntries = maxEntries
  let limitNotified = false
  const notifyLimit = (): void => {
    if (limitNotified) return
    limitNotified = true
    onLimit()
  }
  return {
    id,
    claim(path: string): boolean {
      if (paths.has(path)) return true
      if (paths.size >= maxDirectories) {
        notifyLimit()
        return false
      }
      paths.add(path)
      return true
    },
    takeEntries(path: string, count: number): number {
      const previousLimit = entryLimits.get(path)
      if (previousLimit !== undefined) return Math.min(Math.max(count, 0), previousLimit)
      const visible = Math.min(Math.max(count, 0), Math.max(remainingEntries, 0))
      entryLimits.set(path, visible)
      remainingEntries -= visible
      if (visible < count) notifyLimit()
      return visible
    },
  }
}
