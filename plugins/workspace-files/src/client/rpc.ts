/** Client Typert contribution and session-scoped workspace RPC helpers. */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import {
  EXPLORER_FS_SERVICE,
  type FailResult,
  type FsEntry,
  type ListOk,
  type ReadOk,
  type RootOk,
  type QuickOpenOk,
  type SearchOk,
  type WorkspaceSearchOptions,
  type WriteOk,
} from '../shared/rpc-contract.ts'

const PKG = 'dsh-workspace-enhanced'
const Str = z.string()
const FailCode = z.enum([
  'OUT_OF_ROOT', 'NOT_FOUND', 'IS_BINARY', 'IS_DIR',
  'TOO_LARGE', 'CONFLICT', 'SANDBOX_DENIED', 'NO_SESSION', 'IO',
])
const FailResultSchema = z.object({ ok: z.literal(false), code: FailCode, message: z.string() })
const RootOkSchema = z.object({ ok: z.literal(true), root: z.string() })
const FsEntrySchema = z.object({
  name: z.string(), path: z.string(), kind: z.enum(['file', 'dir']), size: z.number().optional(),
})
const ListOkSchema = z.object({ ok: z.literal(true), entries: z.array(FsEntrySchema) })
const ReadOkSchema = z.object({ ok: z.literal(true), content: z.string(), version: z.string() })
const WriteOkSchema = z.object({ ok: z.literal(true), version: z.string() })
const SearchOptionsSchema = z.object({
  caseSensitive: z.boolean().optional(),
  regex: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  include: z.array(z.string().max(256)).max(20).optional(),
  exclude: z.array(z.string().max(256)).max(20).optional(),
}).strict()
const SearchOkSchema = z.object({
  ok: z.literal(true),
  results: z.array(z.object({ path: z.string(), line: z.number().int().positive(), snippet: z.string() })),
  truncated: z.boolean().optional(),
})
const QuickOpenOkSchema = z.object({ ok: z.literal(true), results: z.array(z.string()) })
const RootResultSchema = z.union([RootOkSchema, FailResultSchema])
const ListResultSchema = z.union([ListOkSchema, FailResultSchema])
const ReadResultSchema = z.union([ReadOkSchema, FailResultSchema])
const WriteResultSchema = z.union([WriteOkSchema, FailResultSchema])
const SearchResultSchema = z.union([SearchOkSchema, FailResultSchema])
const QuickOpenResultSchema = z.union([QuickOpenOkSchema, FailResultSchema])

function strParam(name: string, schema: z.ZodType = Str) {
  return {
    name,
    wire: name,
    source: 'json' as const,
    codec: { mode: 'strict' as const, typeSymbol: `${PKG}/types#String`, create: () => schema },
  }
}

function typedParam(name: string, schema: z.ZodType, typeName: string) {
  const param = strParam(name, schema)
  return { ...param, codec: { ...param.codec, typeSymbol: `${PKG}/types#${typeName}` } }
}

function sessionScopeParam() {
  return {
    name: 'workspaceFileScope',
    wire: 'workspaceFileScopeId',
    source: 'lookup' as const,
    lookup: 'workspaceFileScope',
    codec: {
      mode: 'strict' as const,
      typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
      create: () => Str,
    },
  }
}

function resultCodec(schema: z.ZodType, typeSymbol: string) {
  return { mode: 'strict' as const, typeSymbol: `${PKG}/types#${typeSymbol}`, create: () => schema }
}

function invocation(method: string, parameters: ReturnType<typeof strParam>[], result: ReturnType<typeof resultCodec>, cancellable = false) {
  return {
    id: `${PKG}#${EXPLORER_FS_SERVICE}/${method}`,
    service: EXPLORER_FS_SERVICE,
    namespace: EXPLORER_FS_SERVICE,
    method,
    invocation: { kind: 'direct' as const },
    parameters: [
      sessionScopeParam(),
      ...parameters.map((parameter) => parameter.codec.typeSymbol === `${PKG}/types#String`
        ? { ...parameter, codec: { ...parameter.codec, typeSymbol: `${PKG}#${EXPLORER_FS_SERVICE}/${method}:${parameter.name}` } }
        : parameter),
    ],
    result,
    ...(cancellable ? { cancellation: { parameter: 'signal' as const } } : {}),
  }
}

/** Strict Client contribution mounted via `ctx.remote.$mount`. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: PKG,
  descriptors: [
    invocation('getRoot', [], resultCodec(RootResultSchema, 'RootResult')),
    invocation('list', [strParam('path')], resultCodec(ListResultSchema, 'ListResult'), true),
    invocation('read', [strParam('path')], resultCodec(ReadResultSchema, 'ReadResult'), true),
    invocation('search', [strParam('query', Str.max(512)), typedParam('options', SearchOptionsSchema, 'WorkspaceSearchOptions')], resultCodec(SearchResultSchema, 'SearchResult'), true),
    invocation('quickOpen', [strParam('query', Str.max(256))], resultCodec(QuickOpenResultSchema, 'QuickOpenResult'), true),
    invocation('write', [strParam('path'), strParam('content', Str.max(2 * 1024 * 1024)), strParam('expectedVersion')], resultCodec(WriteResultSchema, 'WriteResult'), true),
  ],
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    readonly explorerFs: ExplorerFsRemote
  }
}

export interface ExplorerFsRemote {
  getRoot(sessionId: string): Promise<RemoteResult<RootOk | FailResult>>
  list(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteResult<ListOk | FailResult>>
  read(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteResult<ReadOk | FailResult>>
  search(sessionId: string, query: string, options: WorkspaceSearchOptions, signal?: AbortSignal): Promise<RemoteResult<SearchOk | FailResult>>
  quickOpen(sessionId: string, query: string, signal?: AbortSignal): Promise<RemoteResult<QuickOpenOk | FailResult>>
  write(sessionId: string, path: string, content: string, expectedVersion: string, signal?: AbortSignal): Promise<RemoteResult<WriteOk | FailResult>>
}

export type ExplorerCallError = {
  readonly kind: 'transport' | 'business'
  readonly message: string
  readonly code?: FailResult['code']
}
export type ExplorerCallResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ExplorerCallError }

async function unwrap<T>(promise: Promise<RemoteResult<T | FailResult>>): Promise<ExplorerCallResult<Exclude<T, FailResult>>> {
  const result = await promise
  if (!result.ok) return { ok: false, error: { kind: 'transport', message: result.error.message } }
  const value = result.value
  if (typeof value === 'object' && value !== null && 'ok' in value && value.ok === false) {
    const fail = value as FailResult
    return { ok: false, error: { kind: 'business', message: fail.message, code: fail.code } }
  }
  return { ok: true, value: value as Exclude<T, FailResult> }
}

/** Bind a mounted view to its Session so delayed saves cannot drift to another Session. */
export function createExplorerApi(ctx: Context, boundSessionId?: string | null) {
  const remote = () => (ctx as Context & { remote: { explorerFs: ExplorerFsRemote } }).remote.explorerFs
  const currentSessionId = (): string | undefined => {
    const uiSession = ctx.get('uiSession')
    return uiSession?.adapter.current.getSnapshot().key as string | undefined
  }
  const noSession = <T>(): Promise<ExplorerCallResult<T>> => Promise.resolve({
    ok: false,
    error: { kind: 'transport', message: 'Select an active session to browse its workspace.' },
  })
  const withSession = <T>(call: (sessionId: string) => Promise<ExplorerCallResult<T>>): Promise<ExplorerCallResult<T>> => {
    const sessionId = boundSessionId === undefined ? currentSessionId() : boundSessionId
    return sessionId == null ? noSession<T>() : call(sessionId)
  }
  return {
    getRoot: () => withSession((sessionId) => unwrap(remote().getRoot(sessionId))),
    list: (path: string, signal?: AbortSignal) => withSession((sessionId) => unwrap(remote().list(sessionId, path, signal))),
    read: (path: string, signal?: AbortSignal) => withSession((sessionId) => unwrap(remote().read(sessionId, path, signal))),
    search: (query: string, options: WorkspaceSearchOptions, signal?: AbortSignal) => withSession(
      (sessionId) => unwrap(remote().search(sessionId, query, options, signal)),
    ),
    quickOpen: (query: string, signal?: AbortSignal) => withSession(
      (sessionId) => unwrap(remote().quickOpen(sessionId, query, signal)),
    ),
    write: (path: string, content: string, expectedVersion: string, signal?: AbortSignal) => withSession(
      (sessionId) => unwrap(remote().write(sessionId, path, content, expectedVersion, signal)),
    ),
  }
}

export type ExplorerApi = ReturnType<typeof createExplorerApi>
export type { FsEntry }
