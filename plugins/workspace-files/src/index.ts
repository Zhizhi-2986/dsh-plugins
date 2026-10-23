/** Workspace files plugin — Host half. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { ExplorerFsService } from './host/fs-service.ts'
import type { Config } from './host/config.ts'

export { Config, name, inject } from './host/config.ts'

/** Register the scoped filesystem RPC. Workspace scope is resolved per Session by Typert. */
export function apply(ctx: Context, _config: Config): void {
  new ExplorerFsService(ctx)
}
