/** Hand-authored Host Typert face for the external plugin package. */

import { z } from 'zod'

const PACKAGE = 'dsh-workspace-enhanced'
const SERVICE = 'explorerFs'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const Str = z.string()
const FailCode = z.enum([
  'OUT_OF_ROOT', 'NOT_FOUND', 'IS_BINARY', 'IS_DIR',
  'TOO_LARGE', 'CONFLICT', 'SANDBOX_DENIED', 'NO_SESSION', 'IO',
])
const FailResult = z.object({ ok: z.literal(false), code: FailCode, message: z.string() })
const RootOk = z.object({ ok: z.literal(true), root: z.string() })
const FsEntry = z.object({ name: z.string(), path: z.string(), kind: z.enum(['file', 'dir']), size: z.number().optional() })
const ListOk = z.object({ ok: z.literal(true), entries: z.array(FsEntry) })
const ReadOk = z.object({ ok: z.literal(true), content: z.string(), version: z.string() })
const WriteOk = z.object({ ok: z.literal(true), version: z.string() })
const SearchOptions = z.object({
  caseSensitive: z.boolean().optional(),
  regex: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  include: z.array(z.string().max(256)).max(20).optional(),
  exclude: z.array(z.string().max(256)).max(20).optional(),
}).strict()
const SearchOk = z.object({
  ok: z.literal(true),
  results: z.array(z.object({ path: z.string(), line: z.number().int().positive(), snippet: z.string() })),
})
const QuickOpenOk = z.object({ ok: z.literal(true), results: z.array(z.string()) })

function jsonParam(name: string, schema: z.ZodType = Str, typeName = 'String') {
  return {
    name,
    wire: name,
    source: 'json' as const,
    codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}/types#${typeName}`, create: () => schema },
  }
}

function workspaceScopeParam() {
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
  return { mode: 'strict' as const, typeSymbol: `${PACKAGE}/types#${typeSymbol}`, create: () => schema }
}

function invocation(method: string, parameters: ReturnType<typeof jsonParam>[], result: ReturnType<typeof resultCodec>, cancellable = false) {
  return {
    id: `${PACKAGE}#${SERVICE}/${method}`,
    service: SERVICE,
    namespace: SERVICE,
    method,
    invocation: { kind: 'direct' as const },
    parameters: [
      workspaceScopeParam(),
      ...parameters.map((parameter) => parameter.codec.typeSymbol === `${PACKAGE}/types#String`
        ? { ...parameter, codec: { ...parameter.codec, typeSymbol: `${PACKAGE}#${SERVICE}/${method}:${parameter.name}` } }
        : parameter),
    ],
    result,
    ...(cancellable ? { cancellation: { parameter: 'signal' as const } } : {}),
    sourceLocation: { file: 'src/host/fs-service.ts', line: 1, column: 1 },
  }
}

export const TYPERT = {
  package: PACKAGE,
  face: 'host' as const,
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [
    invocation('getRoot', [], resultCodec(z.union([RootOk, FailResult]), 'RootResult')),
    invocation('list', [jsonParam('path')], resultCodec(z.union([ListOk, FailResult]), 'ListResult'), true),
    invocation('read', [jsonParam('path')], resultCodec(z.union([ReadOk, FailResult]), 'ReadResult'), true),
    invocation('quickOpen', [jsonParam('query', Str.max(256))], resultCodec(z.union([QuickOpenOk, FailResult]), 'QuickOpenResult'), true),
    invocation('search', [jsonParam('query', Str.max(512)), jsonParam('options', SearchOptions, 'WorkspaceSearchOptions')], resultCodec(z.union([SearchOk, FailResult]), 'SearchResult'), true),
    invocation('write', [
      jsonParam('path'),
      jsonParam('content', Str.max(MAX_FILE_BYTES)),
      jsonParam('expectedVersion'),
    ], resultCodec(z.union([WriteOk, FailResult]), 'WriteResult'), true),
  ],
}

export default TYPERT
