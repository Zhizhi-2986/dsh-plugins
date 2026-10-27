/** Host plugin identity and required DSH capability services. */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  MAX_FAVORITE_FILES_TOTAL,
  MAX_FAVORITE_PATH_LENGTH,
  MAX_FAVORITE_WORKSPACE_ROOT_LENGTH,
  type FavoriteFileEntry,
} from '../shared/settings-contract.ts'

export const name = 'dsh-workspace-enhanced'
export const inject = ['workspaceFiles', 'fs', 'sessions', 'sandboxPolicy', 'typert'] as const

export interface Config {
  openLinksInEditor: Volatile<boolean>
  reorderViewTabs: Volatile<boolean>
  viewTabOrder: Volatile<string[]>
  favoriteFiles: Volatile<FavoriteFileEntry[]>
}

// ConfigForm schemas must be serializable and rehydratable by the Client.
// Keep this volatile schema declarative; normalize and validate semantic paths
// in the Favorites Client before they can be displayed, written, or opened.
const FavoriteFiles = z.array(z.object({
  workspaceRoot: z.string().min(1).max(MAX_FAVORITE_WORKSPACE_ROOT_LENGTH),
  path: z.string().min(1).max(MAX_FAVORITE_PATH_LENGTH),
})).max(MAX_FAVORITE_FILES_TOTAL).default([]).volatile()

export const Config: ReturnType<typeof z.object> = z.object({
  openLinksInEditor: z.boolean().default(true).volatile(),
  reorderViewTabs: z.boolean().default(false).volatile(),
  viewTabOrder: z.array(z.string()).default([]).volatile(),
  favoriteFiles: FavoriteFiles,
})
