import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-hello-plugin'

export function apply(_ctx: Context) {
  // Register DSH services, tools, or event listeners here.
  // Prefer ctx.effect()/ctx.on() registrations so DSH can clean them up on unload.
}
