/** Shared RPC DTOs and fail codes for `explorerFs`. */

export const EXPLORER_FS_SERVICE = 'explorerFs' as const

export type EntryKind = 'file' | 'dir'

export interface FsEntry {
  readonly name: string
  /** Relative to root; empty string means the root itself. */
  readonly path: string
  readonly kind: EntryKind
  readonly size?: number
}

export type FailCode =
  | 'OUT_OF_ROOT'
  | 'NOT_FOUND'
  | 'IS_BINARY'
  | 'IS_DIR'
  | 'TOO_LARGE'
  | 'CONFLICT'
  | 'SANDBOX_DENIED'
  | 'NO_SESSION'
  | 'IO'

export interface FailResult {
  readonly ok: false
  readonly code: FailCode
  readonly message: string
}

export interface RootOk {
  readonly ok: true
  readonly root: string
}

export interface ListOk {
  readonly ok: true
  readonly entries: readonly FsEntry[]
}

export interface ReadOk {
  readonly ok: true
  readonly content: string
  readonly version: string
}

export interface WriteOk {
  readonly ok: true
  readonly version: string
}

export interface WorkspaceSearchOptions {
  readonly caseSensitive?: boolean
  readonly regex?: boolean
  readonly wholeWord?: boolean
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
}

export interface WorkspaceSearchMatch {
  readonly path: string
  readonly line: number
  readonly snippet: string
}

export interface SearchOk {
  readonly ok: true
  readonly results: readonly WorkspaceSearchMatch[]
  /** Present when a bound stopped the scan before it covered the whole workspace. */
  readonly truncated?: boolean
}

export interface QuickOpenOk {
  readonly ok: true
  readonly results: readonly string[]
}

export type RootResult = RootOk | FailResult
export type ListResult = ListOk | FailResult
export type ReadResult = ReadOk | FailResult
export type WriteResult = WriteOk | FailResult
export type SearchResult = SearchOk | FailResult
export type QuickOpenResult = QuickOpenOk | FailResult

export function fail(code: FailCode, message: string): FailResult {
  return { ok: false, code, message }
}
