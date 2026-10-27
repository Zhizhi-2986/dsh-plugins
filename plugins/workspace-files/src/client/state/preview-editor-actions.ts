export interface PreviewEditorActionState {
  readonly activePath: string | null
  readonly editing: boolean
  readonly saving: boolean
}

export type PreviewEditorActionListener = () => void

const EMPTY_STATE: PreviewEditorActionState = { activePath: null, editing: false, saving: false }
const states = new Map<string, PreviewEditorActionState>()
const listeners = new Map<string, Set<PreviewEditorActionListener>>()

/** Read the editor state that belongs to a Session's native Preview toolbar. */
export function getPreviewEditorActionState(sessionId: string): PreviewEditorActionState {
  return states.get(sessionId) ?? EMPTY_STATE
}

/** Subscribe to changes in the editor state for one Session. */
export function subscribePreviewEditorActionState(
  sessionId: string,
  listener: PreviewEditorActionListener,
): () => void {
  let sessionListeners = listeners.get(sessionId)
  if (sessionListeners === undefined) {
    sessionListeners = new Set()
    listeners.set(sessionId, sessionListeners)
  }
  sessionListeners.add(listener)
  return () => {
    sessionListeners?.delete(listener)
    if (sessionListeners?.size === 0 && listeners.get(sessionId) === sessionListeners) listeners.delete(sessionId)
  }
}

/** Publish the active Preview editor state without moving UI state into the Host. */
export function publishPreviewEditorActionState(
  sessionId: string,
  state: PreviewEditorActionState,
): void {
  const previous = getPreviewEditorActionState(sessionId)
  if (
    previous.activePath === state.activePath
    && previous.editing === state.editing
    && previous.saving === state.saving
  ) return
  if (state.activePath === null && !state.editing && !state.saving) states.delete(sessionId)
  else states.set(sessionId, state)
  for (const listener of listeners.get(sessionId) ?? []) listener()
}
