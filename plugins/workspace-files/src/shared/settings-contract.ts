/** Settings namespace contract visible to both Host and Client. */

/**
 * Profile entry id from `cordis.patch.yml` (`dsh-workspace-enhanced`).
 * dsh ≥ 0.1.7 projects volatile Config under this id into `configForms`.
 */
export const FILE_EXPLORER_SETTINGS_NS = 'dsh-workspace-enhanced' as const
export const MAX_FAVORITE_FILES_PER_WORKSPACE = 200
export const MAX_FAVORITE_FILES_TOTAL = 1000
export const MAX_FAVORITE_WORKSPACE_ROOT_LENGTH = 1024
export const MAX_FAVORITE_PATH_LENGTH = 1024

/** Normalize the absolute root key shared by Client and Host Favorites validation. */
export function normalizeWorkspaceRoot(root: string): string | null {
  if (typeof root !== 'string' || root.trim() === '' || root.includes('\0')) return null
  const normalized = root.replace(/\\/gu, '/')
  if (normalized.length > MAX_FAVORITE_WORKSPACE_ROOT_LENGTH) return null
  const isDriveRoot = /^[A-Za-z]:\//u.test(normalized)
  const isUncRoot = normalized.startsWith('//') && !normalized.startsWith('///')
  if (!normalized.startsWith('/') && !isDriveRoot) return null

  const prefix = isDriveRoot ? `${normalized.slice(0, 2).toUpperCase()}/` : isUncRoot ? '//' : '/'
  const remainder = isDriveRoot
    ? normalized.slice(3)
    : isUncRoot ? normalized.slice(2) : normalized.replace(/^\/+/, '')
  const rootSegments = isUncRoot ? 2 : 0
  const segments: string[] = []
  for (const segment of remainder.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length > rootSegments) segments.pop()
      else if (isUncRoot) return null
      continue
    }
    segments.push(segment)
  }
  if (isUncRoot && segments.length < 2) return null
  if (prefix === '/' && segments.length === 0) return '/'
  return `${prefix}${segments.join('/')}`
}

/** Normalize workspace-relative paths, rejecting traversal and whole-path drive prefixes. */
export function normalizeWorkspaceRelativePath(path: string): string | null {
  if (typeof path !== 'string' || path.trim() === '' || path.includes('\0')) return null
  const normalized = path.replace(/\\/gu, '/')
  if (normalized.length > MAX_FAVORITE_PATH_LENGTH) return null
  if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)) return null
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..')) return null
  const safeSegments = segments.filter((segment) => segment !== '' && segment !== '.')
  if (safeSegments.length === 0) return null
  const relativePath = safeSegments.join('/')
  if (/^[A-Za-z]:/u.test(relativePath)) return null
  return relativePath.length <= MAX_FAVORITE_PATH_LENGTH ? relativePath : null
}

/** A favorite stores a workspace-relative path, partitioned by workspace root. */
export interface FavoriteFileEntry {
  readonly workspaceRoot: string
  readonly path: string
}

export interface FileExplorerSettings {
  /** Route conversation file-path links into the editor. */
  readonly openLinksInEditor: boolean
  /** Opt-in: visually reorder Desktop's native View tabs. */
  readonly reorderViewTabs: boolean
  /** Profile-local order of registered View ids, including hidden Views. */
  readonly viewTabOrder: readonly string[]
  /** Workspace-root-keyed favorites; paths remain relative to their workspace. */
  readonly favoriteFiles: readonly FavoriteFileEntry[]
}

export const DEFAULT_FILE_EXPLORER_SETTINGS: FileExplorerSettings = {
  openLinksInEditor: true,
  reorderViewTabs: false,
  viewTabOrder: [],
  favoriteFiles: [],
}
