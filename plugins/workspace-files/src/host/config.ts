/** Host plugin identity and required DSH capability services. */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-workspace-enhanced'
export const inject = ['workspaceFiles', 'fs', 'sessions', 'sandboxPolicy', 'typert'] as const

export interface Config {
  openLinksInEditor: Volatile<boolean>
  reorderViewTabs: Volatile<boolean>
  viewTabOrder: Volatile<string[]>
}

export const Config = z.object({
  openLinksInEditor: z.boolean().default(true).volatile(),
  reorderViewTabs: z.boolean().default(false).volatile(),
  viewTabOrder: z.array(z.string()).default([]).volatile(),
})
