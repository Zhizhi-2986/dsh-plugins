/**
 * Resolve a relative path under a root and reject escapes.
 */

import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

export interface GuardOk {
  readonly ok: true
  /** Absolute path after resolve(root, rel). */
  readonly absolute: string
  /** Normalized relative path ('' for root). */
  readonly relative: string
}

export interface GuardFail {
  readonly ok: false
  readonly reason: 'OUT_OF_ROOT' | 'INVALID'
}

export type GuardResult = GuardOk | GuardFail

/**
 * Normalize a caller-supplied relative path (no leading slash expected).
 * Absolute inputs are rejected as INVALID (callers must use relative paths).
 */
export function normalizeRelativeInput(input: string): string | null {
  if (input === '' || input === '.') return ''
  if (isAbsolute(input)) return null
  const normalized = normalize(input).replaceAll('\\', '/')
  if (normalized === '.' ) return ''
  if (normalized.startsWith('../') || normalized === '..') return null
  return normalized.replace(/\/+$/, '')
}

/**
 * Resolve `rel` under `root`. Both `resolve` and optional `realpath` results
 * must remain inside root.
 * @param root - absolute workspace root
 * @param relInput - relative path from the client
 * @param realpath - optional realpath resolver for symlink checks
 */
export function guardPath(
  root: string,
  relInput: string,
  realpath?: (absolute: string) => string,
): GuardResult {
  const rootAbs = resolve(root)
  const rel = normalizeRelativeInput(relInput)
  if (rel === null) return { ok: false, reason: 'INVALID' }

  const absolute = rel === '' ? rootAbs : resolve(rootAbs, rel)
  if (!isInsideRoot(rootAbs, absolute)) return { ok: false, reason: 'OUT_OF_ROOT' }

  if (realpath !== undefined) {
    let real: string
    try {
      real = realpath(absolute)
    } catch {
      // Target may not exist yet (write/mkdir); still require parent inside root.
      const parent = resolve(absolute, '..')
      try {
        const parentReal = realpath(parent)
        if (!isInsideRoot(rootAbs, parentReal) && parentReal !== rootAbs) {
          return { ok: false, reason: 'OUT_OF_ROOT' }
        }
      } catch {
        if (!isInsideRoot(rootAbs, parent) && parent !== rootAbs) {
          return { ok: false, reason: 'OUT_OF_ROOT' }
        }
      }
      return { ok: true, absolute, relative: rel }
    }
    const rootReal = (() => {
      try {
        return realpath(rootAbs)
      } catch {
        return rootAbs
      }
    })()
    if (!isInsideRoot(rootReal, real) && real !== rootReal) {
      return { ok: false, reason: 'OUT_OF_ROOT' }
    }
  }

  return { ok: true, absolute, relative: rel }
}

/** True when `candidate` is `root` or a descendant. */
export function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../')) return false
  return true
}
