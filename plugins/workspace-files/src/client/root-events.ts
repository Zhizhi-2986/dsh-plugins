/** Notify explorer UI after the Host workspace root is re-pinned. */

type RootListener = () => void

const listeners = new Set<RootListener>()

/** Subscribe to successful session/root pins. */
export function subscribeRootPinned(listener: RootListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Fire after `setRoot` succeeds so the tree reloads against the new cwd. */
export function notifyRootPinned(): void {
  for (const listener of listeners) listener()
}
