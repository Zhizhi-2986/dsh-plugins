/** Session-scoped workspace filesystem RPC using DSH's stable-target seam. */

import { symbols, type Context } from '@deepseek-ai/cordis'
import { FsVersion, type FsTarget } from '@deepseek-ai/dsh-fs'
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  EXPLORER_FS_SERVICE,
  fail,
  type FailResult,
  type FsEntry,
  type CreateFileOk,
  type QuickOpenOk,
  type ListOk,
  type ReadOk,
  type RootOk,
  type SearchOk,
  type WorkspaceSearchOptions,
  type WriteOk,
} from '../shared/rpc-contract.ts'
import { MAX_GLOB_FILTER_CHARS, quickOpenWorkspace, searchWorkspace } from '../search.mts'
import { isEditableText } from './content-type.ts'
import { guardPath } from './path-guard.ts'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_LIST_ENTRIES = 1000
const SAMPLE_BYTES = 8192

type FsOpResult<T> = T | FailResult

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function selfOf(receiver: object): ExplorerFsService {
  const original = Reflect.get(receiver, symbols.original)
  return (isObject(original) ? original : receiver) as ExplorerFsService
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

function failure(error: unknown, action: string): FailResult {
  switch (errorCode(error)) {
    case 'FS_NOT_FOUND': return fail('NOT_FOUND', 'path not found')
    case 'FS_NOT_TEXT': return fail('IS_BINARY', 'file is not valid editable text')
    case 'FS_TOO_LARGE': return fail('TOO_LARGE', `file exceeds the ${MAX_FILE_BYTES} byte editor limit`)
    case 'FS_STALE_VERSION':
    case 'FS_NOT_OBSERVED': return fail('CONFLICT', 'file changed on disk; reload it before saving')
    case 'FS_SANDBOX_DENIED':
    case 'FS_PERMISSION_DENIED': return fail('SANDBOX_DENIED', 'the workspace sandbox denied this operation')
    default:
      return fail('IO', `${action} failed`)
  }
}

async function resolveScope(self: ExplorerFsService, scope: WorkspaceFileScope, signal?: AbortSignal) {
  if (typeof scope?.sessionId !== 'string' || typeof scope.workspaceRoot !== 'string' || scope.workspaceRoot.trim() === '') {
    return { ok: false as const, result: fail('NO_SESSION', 'active session workspace is unavailable') }
  }
  try {
    const root = await self.context.fs.resolve(scope.workspaceRoot, { signal })
    const session = self.context.sessions.get(scope.sessionId as Parameters<Context['sessions']['get']>[0])
    if (session === undefined) {
      // workspaceFileScope is Host-resolved from the persisted Session header; reads remain available for cold sessions.
      return { ok: true as const, root, rootPath: scope.workspaceRoot, session, policy: undefined }
    }
    const policy = self.context.sandboxPolicy.resolve({ session })
    const trustedRoot = session.header.cwd ?? policy.workspaceRoot
    const expectedRoot = await self.context.fs.resolve(trustedRoot, { signal })
    if (root.targetKey !== expectedRoot.targetKey) {
      return { ok: false as const, result: fail('OUT_OF_ROOT', 'workspace scope does not match this session') }
    }
    return { ok: true as const, root, rootPath: trustedRoot, session, policy }
  } catch {
    return { ok: false as const, result: fail('IO', 'cannot resolve the session workspace') }
  }
}

async function resolvePath(self: ExplorerFsService, scope: WorkspaceFileScope, path: string, signal?: AbortSignal) {
  const scoped = await resolveScope(self, scope, signal)
  if (!scoped.ok) return scoped
  const guarded = guardPath(scoped.rootPath, path)
  if (!guarded.ok) {
    return { ok: false as const, result: fail('OUT_OF_ROOT', 'absolute or escaping paths are not allowed') }
  }
  try {
    let segmentPath = ''
    for (const segment of guarded.relative.split('/').filter(Boolean)) {
      segmentPath = joinRelative(segmentPath, segment)
      const segmentInfo = await self.context.fs.lstat(segmentPath, { cwd: scoped.rootPath }, signal)
      if (segmentInfo?.type === 'symlink') {
        return { ok: false as const, result: fail('OUT_OF_ROOT', 'symbolic links are not allowed in workspace paths') }
      }
    }
    const target = await self.context.fs.resolve(guarded.absolute, { signal })
    if (!self.context.fs.contains(scoped.root, target)) {
      return { ok: false as const, result: fail('OUT_OF_ROOT', 'path escapes the session workspace') }
    }
    return {
      ok: true as const,
      root: scoped.root,
      rootPath: scoped.rootPath,
      session: scoped.session,
      policy: scoped.policy,
      target,
      relative: guarded.relative,
      absolute: guarded.absolute,
    }
  } catch (error) {
    return { ok: false as const, result: failure(error, 'Path resolution') }
  }
}

interface ReadObservation {
  readonly result: FsOpResult<ReadOk>
  readonly bytesRead?: number
}

async function readWorkspaceText(
  self: ExplorerFsService,
  scope: WorkspaceFileScope,
  path: string,
  signal?: AbortSignal,
): Promise<ReadObservation> {
  const resolved = await resolvePath(self, scope, path, signal)
  if (!resolved.ok) return { result: resolved.result }
  try {
    const lstat = await self.context.fs.lstat(resolved.absolute, undefined, signal)
    if (lstat === undefined) return { result: fail('NOT_FOUND', 'path not found') }
    if (lstat.type === 'symlink') return { result: fail('OUT_OF_ROOT', 'symbolic links cannot be edited') }
    const info = await self.context.fs.stat(resolved.target, signal)
    if (info === undefined) return { result: fail('NOT_FOUND', 'path not found') }
    if (info.type === 'directory') return { result: fail('IS_DIR', 'path is a directory') }
    if (info.type !== 'file') return { result: fail('IS_BINARY', 'only regular text files can be edited') }
    if (info.size !== undefined && info.size > MAX_FILE_BYTES) {
      return { result: fail('TOO_LARGE', `file exceeds the ${MAX_FILE_BYTES} byte editor limit`) }
    }
    const bytes = await self.context.fs.readBytes(resolved.target, signal, MAX_FILE_BYTES)
    if (!isEditableText(path, bytes.subarray(0, SAMPLE_BYTES))) {
      return { result: fail('IS_BINARY', 'file looks binary and cannot be edited'), bytesRead: bytes.byteLength }
    }
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return { result: fail('IS_BINARY', 'file is not valid UTF-8 text'), bytesRead: bytes.byteLength }
    }
    return { result: { ok: true, content, version: String(info.version) }, bytesRead: bytes.byteLength }
  } catch (error) {
    return { result: failure(error, 'Reading') }
  }
}

function joinRelative(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/** Host RPC with per-session workspace lookup and DSH filesystem enforcement. */
export class ExplorerFsService extends TypertRemoteService {
  /** Public because Cordis proxies forward service reads/writes through this object. */
  context: Context

  constructor(ctx: Context) {
    super(ctx, EXPLORER_FS_SERVICE)
    this.context = ctx
  }

  @Remote
  async getRoot(scope: WorkspaceFileScope): Promise<FsOpResult<RootOk>> {
    const resolved = await resolveScope(selfOf(this), scope)
    return resolved.ok
      ? { ok: true, root: resolved.rootPath }
      : resolved.result
  }

  @Remote
  async list(scope: WorkspaceFileScope, path: string, signal?: AbortSignal): Promise<FsOpResult<ListOk>> {
    const self = selfOf(this)
    const resolved = await resolvePath(self, scope, path, signal)
    if (!resolved.ok) return resolved.result
    try {
      // `workspaceFiles.list` rejects the empty path, so the workspace root is sent as '.'.
      const listing = await self.context.workspaceFiles.list(scope, resolved.relative === '' ? '.' : resolved.relative, signal ?? new AbortController().signal)
      if (listing.truncated || listing.entries.length > MAX_LIST_ENTRIES) {
        return fail('TOO_LARGE', 'directory listing is incomplete; narrow the workspace before browsing or searching')
      }
      const entries: FsEntry[] = []
      for (const entry of listing.entries) {
        if (entry.type === 'other') continue
        const childPath = joinRelative(listing.path, entry.name)
        const pathInfo = await self.context.fs.lstat(childPath, { cwd: resolved.rootPath }, signal)
        if (pathInfo?.type === 'symlink') continue
        entries.push({
          name: entry.name,
          path: childPath,
          kind: entry.type === 'directory' ? 'dir' : 'file',
          ...(entry.type === 'file' && entry.size !== undefined ? { size: entry.size } : {}),
        })
      }
      return { ok: true, entries }
    } catch (error) {
      return failure(error, 'Listing')
    }
  }

  @Remote
  async read(scope: WorkspaceFileScope, path: string, signal?: AbortSignal): Promise<FsOpResult<ReadOk>> {
    return (await readWorkspaceText(selfOf(this), scope, path, signal)).result
  }

  @Remote
  async quickOpen(scope: WorkspaceFileScope, query: string, signal?: AbortSignal): Promise<FsOpResult<QuickOpenOk>> {
    if (query.length > 256) return fail('IO', 'quick-open query is too long')
    const self = selfOf(this)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('quick-open timed out')), 10_000)
    const forwardAbort = (): void => controller.abort(signal?.reason)
    if (signal?.aborted) forwardAbort()
    else signal?.addEventListener('abort', forwardAbort, { once: true })
    const files = {
      list: async (_scope: unknown, path: string, requestSignal?: AbortSignal) => {
        const result = await self.list(scope, path, requestSignal)
        if (!result.ok && ['NOT_FOUND', 'OUT_OF_ROOT', 'IS_DIR'].includes(result.code)) {
          return { ok: true as const, value: { entries: [] } }
        }
        return result.ok
          ? { ok: true as const, value: { entries: result.entries.map((entry) => ({
              name: entry.name,
              type: entry.kind === 'dir' ? 'directory' as const : 'file' as const,
              ...(entry.size !== undefined ? { size: entry.size } : {}),
            })) } }
          : { ok: false as const, error: { message: result.message } }
      },
      read: async () => ({ ok: true as const, value: { content: '', offset: 1 } }),
    }
    let truncated = false
    try {
      const results = await quickOpenWorkspace(files, null, query, {
        signal: controller.signal,
        maxResults: 100,
        maxFiles: 5000,
        maxDirectories: 2000,
        onTruncated: () => { truncated = true },
      })
      return { ok: true, results, ...(truncated ? { truncated: true } : {}) }
    } catch {
      return fail('IO', controller.signal.aborted ? 'quick-open was cancelled or timed out' : 'quick-open failed')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  @Remote
  async search(
    scope: WorkspaceFileScope,
    query: string,
    options: WorkspaceSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<FsOpResult<SearchOk>> {
    const globFilterChars = [...(options.include ?? []), ...(options.exclude ?? [])]
      .reduce((total, pattern) => total + pattern.length, 0)
    if (query.length > 512 || (options.include?.length ?? 0) > 20 || (options.exclude?.length ?? 0) > 20
      || globFilterChars > MAX_GLOB_FILTER_CHARS) {
      return fail('IO', 'search request exceeds its input limits')
    }
    const self = selfOf(this)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('search timed out')), 10_000)
    const forwardAbort = (): void => controller.abort(signal?.reason)
    if (signal?.aborted) forwardAbort()
    else signal?.addEventListener('abort', forwardAbort, { once: true })
    const fileSizes = new Map<string, number>()
    const files = {
      list: async (_scope: unknown, path: string, requestSignal?: AbortSignal) => {
        const result = await self.list(scope, path, requestSignal)
        return result.ok
          ? { ok: true as const, value: { entries: result.entries.map((entry) => {
              if (entry.size !== undefined) fileSizes.set(entry.path, entry.size)
              return {
                name: entry.name,
                type: entry.kind === 'dir' ? 'directory' as const : 'file' as const,
                ...(entry.size !== undefined ? { size: entry.size } : {}),
              }
            }) } }
          : { ok: false as const, error: { message: result.message } }
      },
      read: async (_scope: unknown, path: string, _range?: { offset: number; limit: number; maxBytes?: number }, requestSignal?: AbortSignal) => {
        const observation = await readWorkspaceText(self, scope, path, requestSignal)
        const result = observation.result
        if (!result.ok && ['NOT_FOUND', 'OUT_OF_ROOT', 'IS_BINARY', 'TOO_LARGE'].includes(result.code)) {
          return {
            ok: true as const,
            value: {
              content: '',
              offset: 1,
              ...(result.code === 'TOO_LARGE' ? { truncated: true, bytesRead: MAX_FILE_BYTES } : {}),
              ...(result.code === 'IS_BINARY' ? { bytesRead: observation.bytesRead ?? fileSizes.get(path) ?? MAX_FILE_BYTES } : {}),
            },
          }
        }
        return result.ok
          ? { ok: true as const, value: { content: result.content, offset: 1 } }
          : { ok: false as const, error: { message: result.message } }
      },
    }
    let truncated = false
    try {
      const results = await searchWorkspace(files, null, '', query, {
        ...options,
        signal: controller.signal,
        maxResults: 100,
        maxFiles: 2000,
        maxLines: 5000,
        maxFileBytes: 1024 * 1024,
        maxTotalBytes: 32 * 1024 * 1024,
        onTruncated: () => { truncated = true },
      })
      return truncated ? { ok: true, results, truncated: true } : { ok: true, results }
    } catch (error) {
      if (controller.signal.aborted) return fail('IO', 'search was cancelled or timed out')
      return fail('IO', 'workspace search failed')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  @Remote
  async createFile(
    scope: WorkspaceFileScope,
    path: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<FsOpResult<CreateFileOk>> {
    const self = selfOf(this)
    if (typeof path !== 'string' || path.includes('\0')) {
      return fail('OUT_OF_ROOT', 'invalid workspace file path')
    }
    if (typeof content !== 'string') return fail('IO', 'file content must be text')
    if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) {
      return fail('TOO_LARGE', `file exceeds the ${MAX_FILE_BYTES} byte editor limit`)
    }
    const scoped = await resolveScope(self, scope, signal)
    if (!scoped.ok) return scoped.result
    const guarded = guardPath(scoped.rootPath, path)
    if (!guarded.ok || guarded.relative === '') {
      return fail('OUT_OF_ROOT', 'a non-empty workspace-relative file path is required')
    }
    const parentPath = entryParent(guarded.relative)
    const parent = await resolvePath(self, scope, parentPath, signal)
    if (!parent.ok) return parent.result
    if (scoped.session === undefined || scoped.policy === undefined) {
      return fail('NO_SESSION', 'a live session policy is required to create files')
    }
    if (self.context.fs.sandboxMode === undefined) {
      return fail('SANDBOX_DENIED', 'a sandbox-enforcing filesystem is required for file creation')
    }
    try {
      const parentInfo = await self.context.fs.stat(parent.target, signal)
      if (parentInfo === undefined || parentInfo.type !== 'directory') {
        return fail('NOT_FOUND', 'parent directory does not exist')
      }
      const existing = await self.context.fs.lstat(guarded.relative, { cwd: scoped.rootPath }, signal)
      if (existing?.type === 'symlink') {
        return fail('OUT_OF_ROOT', 'symbolic links are not allowed in workspace paths')
      }
      if (existing !== undefined) return fail('CONFLICT', 'a file or directory already exists at this path')
      const target = await self.context.fs.resolve(guarded.absolute, { signal })
      if (!self.context.fs.contains(scoped.root, target)) {
        return fail('OUT_OF_ROOT', 'path escapes the session workspace')
      }
      const outcome = await self.context.fs.writeText(
        target,
        content,
        { kind: 'createIfAbsent' },
        signal,
        scoped.policy,
      )
      return { ok: true, path: guarded.relative, version: String(outcome.version) }
    } catch (error) {
      return failure(error, 'Creating file')
    }
  }

  @Remote
  async write(
    scope: WorkspaceFileScope,
    path: string,
    content: string,
    expectedVersion: string,
    signal?: AbortSignal,
  ): Promise<FsOpResult<WriteOk>> {
    const self = selfOf(this)
    if (typeof expectedVersion !== 'string' || expectedVersion.length === 0) {
      return fail('CONFLICT', 'an observed file version is required before saving')
    }
    if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) {
      return fail('TOO_LARGE', `file exceeds the ${MAX_FILE_BYTES} byte editor limit`)
    }
    const resolved = await resolvePath(self, scope, path, signal)
    if (!resolved.ok) return resolved.result
    if (resolved.session === undefined || resolved.policy === undefined) {
      return fail('NO_SESSION', 'a live session policy is required to save files')
    }
    if (self.context.fs.sandboxMode === undefined) {
      return fail('SANDBOX_DENIED', 'a sandbox-enforcing filesystem is required for writes')
    }
    try {
      const lstat = await self.context.fs.lstat(resolved.absolute, undefined, signal)
      if (lstat?.type === 'symlink') return fail('OUT_OF_ROOT', 'symbolic links cannot be edited')
      const current = await self.context.fs.stat(resolved.target, signal)
      if (current?.type === 'directory') return fail('IS_DIR', 'path is a directory')
      if (current === undefined) {
        return fail('CONFLICT', 'file no longer exists; reload it before saving')
      }
      const intent = { kind: 'replaceIfVersion' as const, version: FsVersion(expectedVersion) }
      const outcome = await self.context.fs.writeText(resolved.target, content, intent, signal, resolved.policy)
      return { ok: true, version: String(outcome.version) }
    } catch (error) {
      return failure(error, 'Saving')
    }
  }
}

export function entryBasename(relPath: string): string {
  return relPath.split(/[\\/]/u).pop() ?? relPath
}

export function entryParent(relPath: string): string {
  const separator = Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\'))
  return separator < 0 ? '' : relPath.slice(0, separator)
}

export type { FsTarget }
