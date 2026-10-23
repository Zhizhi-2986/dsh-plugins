import { BuffersStore } from './buffers.ts'
import { MdModeStore } from './md-mode.ts'
import { TabsStore } from './tabs.ts'

export interface SessionEditorStores {
  readonly tabs: TabsStore
  readonly buffers: BuffersStore
  readonly mdModes: MdModeStore
}

const storesBySession = new Map<string, SessionEditorStores>()

/** Keep open tabs and unsaved buffers isolated by Session identity. */
export function editorStoresForSession(sessionId: string | null): SessionEditorStores {
  const key = sessionId ?? '__no-active-session__'
  const existing = storesBySession.get(key)
  if (existing !== undefined) return existing
  const stores = { tabs: new TabsStore(), buffers: new BuffersStore(), mdModes: new MdModeStore() }
  storesBySession.set(key, stores)
  return stores
}
