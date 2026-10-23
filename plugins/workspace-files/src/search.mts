const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.pnpm-store', 'dist', 'build', 'coverage'])
const BINARY_EXTENSIONS = new Set([
  '.7z', '.a', '.avi', '.bin', '.bmp', '.class', '.dll', '.dylib', '.exe',
  '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.mp3', '.mp4', '.o',
  '.pdf', '.png', '.so', '.tar', '.wasm', '.webp', '.zip',
])

type SearchEntry = {
  readonly name: string
  readonly type?: 'file' | 'directory' | 'other'
  readonly kind?: 'file' | 'dir'
  readonly size?: number
}
type SearchDirectory = { readonly entries: readonly SearchEntry[] }
type SearchDocument = {
  readonly text?: string
  readonly content?: string
  readonly offset?: number
}
type OperationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error?: { readonly message?: string } }
export type WorkspaceSearchTruncation = 'files' | 'directories' | 'bytes' | 'lines'

export interface WorkspaceSearchResult {
  readonly path: string
  readonly line: number
  readonly snippet: string
}
export interface WorkspaceSearchOptions {
  readonly signal?: AbortSignal
  readonly maxResults?: number
  readonly maxFiles?: number
  readonly maxDirectories?: number
  readonly maxLines?: number
  readonly maxFileBytes?: number
  readonly maxTotalBytes?: number
  readonly caseSensitive?: boolean
  readonly regex?: boolean
  readonly wholeWord?: boolean
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  /** Reports a bound that cut the search short, so callers can tell the user results are partial. */
  readonly onTruncated?: (reason: WorkspaceSearchTruncation) => void
}
export interface WorkspaceSearchApi {
  list(scope: unknown, path: string, signal?: AbortSignal): Promise<OperationResult<SearchDirectory>>
  read(scope: unknown, path: string, range?: { offset: number; limit: number; maxBytes?: number }, signal?: AbortSignal): Promise<OperationResult<SearchDocument>>
}
export interface QuickOpenOptions {
  readonly signal?: AbortSignal
  readonly maxResults?: number
  readonly maxFiles?: number
  readonly maxDirectories?: number
}

export function fuzzyPathScore(path: string, query: string): number | null {
  const needle = query.trim().toLocaleLowerCase()
  if (needle.length === 0) return 0
  const candidate = path.toLocaleLowerCase()
  let previous = -2
  let first = -1
  let gapScore = 0
  let consecutive = 0
  for (const character of needle) {
    const index = candidate.indexOf(character, previous + 1)
    if (index < 0) return null
    if (first < 0) first = index
    if (previous >= 0) {
      gapScore += index - previous - 1
      consecutive = index === previous + 1 ? consecutive + 1 : 1
    } else consecutive = 1
    previous = index
  }
  const basename = candidate.slice(candidate.lastIndexOf('/') + 1)
  const baseIndex = basename.indexOf(needle)
  const prefixBonus = candidate.startsWith(needle) ? 30 : 0
  const basenameBonus = baseIndex === 0 ? 20 : baseIndex > 0 ? 8 : 0
  return gapScore * 4 + Math.max(0, first) - prefixBonus - basenameBonus - consecutive
}

export async function quickOpenWorkspace(
  files: WorkspaceSearchApi,
  scope: unknown,
  query: string,
  options: QuickOpenOptions = {},
): Promise<string[]> {
  const { signal, maxResults = 100, maxFiles = 5000, maxDirectories = 2000 } = options
  const pending = ['']
  const candidates: Array<{ readonly path: string; readonly score: number }> = []
  let visitedFiles = 0
  let visitedDirectories = 0
  while (pending.length > 0 && visitedDirectories < maxDirectories) {
    signal?.throwIfAborted()
    const current = pending.pop()!
    visitedDirectories += 1
    const listing = unwrap(await files.list(scope, current, signal), `List ${current || 'workspace'}`)
    for (const entry of listing.entries) {
      signal?.throwIfAborted()
      const entryType = entry.type ?? (entry.kind === 'dir' ? 'directory' : entry.kind)
      const path = relativePath(current, entry.name)
      if (entryType === 'directory') {
        if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(path)
        continue
      }
      if (entryType !== 'file') continue
      if (++visitedFiles > maxFiles) break
      const score = fuzzyPathScore(path, query)
      if (score !== null) candidates.push({ path, score })
    }
    if (visitedFiles > maxFiles) break
  }
  return candidates
    .sort((left, right) => left.score - right.score || left.path.localeCompare(right.path))
    .slice(0, maxResults)
    .map((candidate) => candidate.path)
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

function relativePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function unwrap<T>(result: OperationResult<T>, description: string): T {
  if (result?.ok) return result.value
  throw new Error(result?.error?.message ?? `${description} failed`)
}

type GlobToken = { readonly kind: 'literal'; readonly char: string }
  | { readonly kind: 'star' | 'globstar' | 'globstarSlash' | 'question' }

/** Linear-state glob matcher; unlike generated regexes, repeated * cannot backtrack exponentially. */
function globMatcher(pattern: string): { test(path: string): boolean } {
  const source = String(pattern).replaceAll('\\', '/')
  if (source.length > 256) throw new Error('Search glob is too long')
  const tokens: GlobToken[] = []
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? ''
    if (char === '*' && source[index + 1] === '*') {
      if (source[index + 2] === '/') {
        tokens.push({ kind: 'globstarSlash' })
        index += 2
      } else {
        tokens.push({ kind: 'globstar' })
        index += 1
      }
    } else if (char === '*') tokens.push({ kind: 'star' })
    else if (char === '?') tokens.push({ kind: 'question' })
    else tokens.push({ kind: 'literal', char })
  }
  const close = (states: Uint8Array): void => {
    for (let index = 0; index < tokens.length; index += 1) {
      if (states[index] && ['star', 'globstar', 'globstarSlash'].includes(tokens[index]!.kind)) states[index + 1] = 1
    }
  }
  return { test(path: string): boolean {
    if (path.length > 4096) return false
    let active = new Uint8Array(tokens.length + 1)
    active[0] = 1
    close(active)
    for (const char of path) {
      const next = new Uint8Array(tokens.length + 1)
      for (let index = 0; index < tokens.length; index += 1) {
        if (!active[index]) continue
        const token = tokens[index]!
        if (token.kind === 'literal' && token.char === char) next[index + 1] = 1
        else if (token.kind === 'question' && char !== '/') next[index + 1] = 1
        else if (token.kind === 'star' && char !== '/') next[index] = 1
        else if (token.kind === 'globstar') next[index] = 1
        else if (token.kind === 'globstarSlash') {
          next[index] = 1
          if (char === '/') next[index + 1] = 1
        }
      }
      active = next
      close(active)
    }
    return active[tokens.length] === 1
  } }
}

function compileMatcher(query: string, options: Pick<WorkspaceSearchOptions, 'caseSensitive' | 'regex' | 'wholeWord'> = {}): RegExp {
  const { caseSensitive = false, regex = false, wholeWord = false } = options
  if (query.length > 512) throw new Error('Search query is too long (maximum 512 characters)')
  let source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  // JavaScript RegExp has no execution timeout. Admit only a small subset:
  // no groups, alternatives, backreferences, or quantifiers of any kind.
  const plainSource = source.replace(/\\./gu, '')
  const quantifiers = plainSource.match(/[+*?]|\{\d+(?:,\d*)?\}/gu) ?? []
  if (regex && (source.length > 128 || /[()|]/u.test(plainSource) || /\\[1-9]/u.test(source) || quantifiers.length > 0)) {
    throw new Error('Quantified regex groups are not supported; unsafe quantifier or other regex construct')
  }
  if (wholeWord) source = `\\b(?:${source})\\b`
  try {
    return new RegExp(source, caseSensitive ? 'u' : 'iu')
  } catch {
    throw new Error('Invalid search regular expression')
  }
}

/** Search bounded, workspace-relative text documents. */
export async function searchWorkspace(
  files: WorkspaceSearchApi,
  scope: unknown,
  directory: string,
  query: string,
  options: WorkspaceSearchOptions = {},
): Promise<WorkspaceSearchResult[]> {
  const needle = query.trim()
  if (!needle) return []
  const {
    signal,
    maxResults = 100,
    maxFiles = 2000,
    maxDirectories = 2000,
    maxLines = 5000,
    maxFileBytes = 1024 * 1024,
    maxTotalBytes = 32 * 1024 * 1024,
    caseSensitive = false,
    regex = false,
    wholeWord = false,
    include = [],
    exclude = [],
    onTruncated,
  } = options
  const matcher = compileMatcher(needle, { caseSensitive, regex, wholeWord })
  const includeGlobs = include.map(globMatcher)
  const excludeGlobs = exclude.map(globMatcher)
  const matchesGlob = (path: string): boolean => {
    if (includeGlobs.length > 0 && !includeGlobs.some((pattern) => pattern.test(path))) return false
    return !excludeGlobs.some((pattern) => pattern.test(path))
  }
  const results: WorkspaceSearchResult[] = []
  const pending = [directory]
  let visitedFiles = 0
  let visitedDirectories = 0
  let visitedBytes = 0

  while (pending.length > 0 && results.length < maxResults) {
    signal?.throwIfAborted()
    if (++visitedDirectories > maxDirectories) {
      onTruncated?.('directories')
      break
    }
    const current = pending.pop()!
    const listing = unwrap(await files.list(scope, current, signal), `List ${current || 'workspace'}`)
    for (const entry of listing.entries) {
      signal?.throwIfAborted()
      const childPath = relativePath(current, entry.name)
      const entryType = entry.type ?? (entry.kind === 'dir' ? 'directory' : entry.kind)
      if (entryType === 'directory') {
        if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(childPath)
        continue
      }
      if (entryType !== 'file' || BINARY_EXTENSIONS.has(extensionOf(entry.name))) continue
      if (!matchesGlob(childPath) || (entry.size !== undefined && entry.size > maxFileBytes)) continue
      if (++visitedFiles > maxFiles) {
        onTruncated?.('files')
        break
      }
      const document = unwrap(await files.read(scope, childPath, {
        offset: 1,
        limit: maxLines,
        maxBytes: maxFileBytes,
      }, signal), `Read ${childPath}`)
      const text = document.text ?? document.content
      if (typeof text !== 'string' || text.includes('\0')) continue
      const size = new TextEncoder().encode(text).byteLength
      if (size > maxFileBytes) continue
      visitedBytes += size
      if (visitedBytes > maxTotalBytes) {
        onTruncated?.('bytes')
        break
      }
      const allLines = text.split(/\r?\n/u)
      // Large files are scanned up to the per-file cap instead of failing the whole search.
      let lines = allLines
      if (allLines.length > maxLines) {
        onTruncated?.('lines')
        lines = allLines.slice(0, maxLines)
      }
      const offset = Number.isInteger(document.offset) ? document.offset! : 1
      for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
        const line = lines[index] ?? ''
        matcher.lastIndex = 0
        if (matcher.test(line)) results.push({ path: childPath, line: offset + index, snippet: line.trim().slice(0, 300) })
      }
    }
  }
  return results
}
