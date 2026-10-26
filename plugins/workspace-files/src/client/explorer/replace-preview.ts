import type { ExplorerApi } from '../rpc.ts'
import type { BuffersStore } from '../state/buffers.ts'

const SEARCH_RESULT_LIMIT = 100
const REPLACE_FILE_LIMIT = 50
const MAX_FILE_BYTES = 2 * 1024 * 1024
const REPLACE_BYTE_LIMIT = 16 * 1024 * 1024
const PARTS_PER_CHUNK = 1024

export interface ReplacementFilePreview {
  readonly path: string
  readonly before: string
  readonly after: string
  readonly version: string
  readonly count: number
  readonly firstMatchOffset: number
}

export interface ReplacementPreview {
  readonly findText: string
  readonly replacementText: string
  readonly totalOccurrences: number
  readonly files: readonly ReplacementFilePreview[]
}

export interface ReplacementApplyResult {
  readonly path: string
  readonly ok: boolean
  readonly message?: string
}

export function replacementExcerpt(text: string, offset: number, spanLength: number): string {
  const safeOffset = Math.max(0, Math.min(offset, text.length))
  const start = Math.max(0, safeOffset - 55)
  const end = Math.min(text.length, safeOffset + Math.max(0, spanLength) + 55)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function occurrenceCount(text: string, needle: string): number {
  let count = 0
  let offset = 0
  while (offset <= text.length - needle.length) {
    const match = text.indexOf(needle, offset)
    if (match < 0) break
    count += 1
    offset = match + needle.length
  }
  return count
}

/** Construct a literal replacement only while its UTF-8 output remains bounded. */
export function replaceLiteralBounded(
  text: string,
  needle: string,
  replacement: string,
  maxBytes: number,
): { readonly content: string; readonly byteLength: number } {
  if (needle.length === 0) throw new Error('Find text must not be empty.')
  const encoder = new TextEncoder()
  const replacementBytes = encoder.encode(replacement).byteLength
  const chunks: string[] = []
  let parts: string[] = []
  const appendPart = (part: string): void => {
    if (part.length === 0) return
    parts.push(part)
    if (parts.length >= PARTS_PER_CHUNK) {
      chunks.push(parts.join(''))
      parts = []
    }
  }
  let byteLength = 0
  let cursor = 0
  while (true) {
    const match = text.indexOf(needle, cursor)
    if (match < 0) break
    const unchanged = text.slice(cursor, match)
    byteLength += unchanged.length === 0 ? 0 : encoder.encode(unchanged).byteLength
    byteLength += replacementBytes
    if (byteLength > maxBytes) throw new Error(`Replacement output exceeds the ${maxBytes} byte limit.`)
    appendPart(unchanged)
    appendPart(replacement)
    cursor = match + needle.length
  }
  const tail = text.slice(cursor)
  byteLength += tail.length === 0 ? 0 : encoder.encode(tail).byteLength
  if (byteLength > maxBytes) throw new Error(`Replacement output exceeds the ${maxBytes} byte limit.`)
  appendPart(tail)
  const finalChunk = parts.join('')
  chunks.push(finalChunk)
  return { content: chunks.join(''), byteLength }
}

/** Build a bounded, exact-literal replacement snapshot. No writes occur here. */
export async function createReplacementPreview(
  api: ExplorerApi,
  buffers: BuffersStore,
  findText: string,
  replacementText: string,
): Promise<ReplacementPreview> {
  if (findText.trim().length === 0) {
    throw new Error('Find text must contain at least one non-whitespace character.')
  }
  if (findText.includes('\n') || findText.includes('\r')) {
    throw new Error('Global replacement currently supports single-line literal text only.')
  }
  const search = await api.search(findText, { caseSensitive: true, regex: false })
  if (!search.ok) throw new Error(search.error.message)
  if (search.value.truncated || search.value.results.length >= SEARCH_RESULT_LIMIT) {
    throw new Error('Search results are incomplete; narrow the search before replacing.')
  }

  const paths = [...new Set(search.value.results.map((match) => match.path))]
  if (paths.length > REPLACE_FILE_LIMIT) {
    throw new Error(`Replacement preview is limited to ${REPLACE_FILE_LIMIT} files; narrow the search.`)
  }

  let totalBytes = 0
  let totalOutputBytes = 0
  let totalOccurrences = 0
  const files: ReplacementFilePreview[] = []
  for (const path of paths) {
    if (buffers.isDirty(path)) {
      throw new Error(`Save or discard unsaved changes in ${path} before replacing.`)
    }
    const read = await api.read(path)
    if (!read.ok) throw new Error(`${path}: ${read.error.message}`)
    totalBytes += new TextEncoder().encode(read.value.content).byteLength
    if (totalBytes > REPLACE_BYTE_LIMIT) {
      throw new Error('Replacement preview exceeds the 16 MiB scan limit; narrow the search.')
    }
    const count = occurrenceCount(read.value.content, findText)
    if (count === 0) continue
    let replacement: { readonly content: string; readonly byteLength: number }
    try {
      replacement = replaceLiteralBounded(read.value.content, findText, replacementText, MAX_FILE_BYTES)
    } catch {
      throw new Error(`${path}: replacement would exceed the 2 MiB per-file limit.`)
    }
    totalOutputBytes += replacement.byteLength
    if (totalOutputBytes > REPLACE_BYTE_LIMIT) {
      throw new Error('Replacement output exceeds the 16 MiB preview limit; narrow the search.')
    }
    totalOccurrences += count
    files.push({
      path,
      before: read.value.content,
      after: replacement.content,
      version: read.value.version,
      count,
      firstMatchOffset: read.value.content.indexOf(findText),
    })
  }
  return { findText, replacementText, totalOccurrences, files }
}

/** Apply exactly the reviewed contents with captured versions; never retry stale writes. */
export async function applyReplacementPreview(
  api: ExplorerApi,
  buffers: BuffersStore,
  preview: ReplacementPreview,
): Promise<readonly ReplacementApplyResult[]> {
  const dirtyPath = preview.files.find((file) => buffers.isDirty(file.path))?.path
  if (dirtyPath !== undefined) {
    throw new Error(`Save or discard unsaved changes in ${dirtyPath} before replacing.`)
  }

  const results: ReplacementApplyResult[] = []
  for (const file of preview.files) {
    if (buffers.isDirty(file.path)) {
      results.push({ path: file.path, ok: false, message: `Unsaved changes appeared in ${file.path}; this file was skipped.` })
      continue
    }
    try {
      const write = await api.write(file.path, file.after, file.version)
      if (!write.ok) {
        results.push({ path: file.path, ok: false, message: write.error.message })
        continue
      }
      if (buffers.get(file.path) !== undefined) {
        if (buffers.isDirty(file.path)) {
          buffers.markSaved(file.path, file.after, write.value.version)
          results.push({ path: file.path, ok: true, message: `Disk updated; the newer draft in ${file.path} was preserved.` })
          continue
        }
        buffers.load(file.path, file.after, write.value.version)
      }
      results.push({ path: file.path, ok: true })
    } catch (cause) {
      results.push({ path: file.path, ok: false, message: cause instanceof Error ? cause.message : 'Write failed' })
    }
  }
  return results
}
