import {
  MAX_FAVORITE_FILES_PER_WORKSPACE,
  MAX_FAVORITE_FILES_TOTAL,
  normalizeWorkspaceRelativePath,
  normalizeWorkspaceRoot,
  type FavoriteFileEntry,
} from '../shared/settings-contract.ts'

export { normalizeWorkspaceRoot }
export const normalizeFavoritePath = normalizeWorkspaceRelativePath

export const MAX_FAVORITES_PER_WORKSPACE = MAX_FAVORITE_FILES_PER_WORKSPACE

export type FavoriteToggleResult =
  | { readonly ok: true; readonly favorites: readonly FavoriteFileEntry[]; readonly isFavorite: boolean }
  | { readonly ok: false; readonly reason: 'invalid-root' | 'invalid-path' | 'limit' }

function normalizeEntries(entries: readonly FavoriteFileEntry[]): readonly FavoriteFileEntry[] {
  const unique = new Map<string, FavoriteFileEntry>()
  for (const entry of entries) {
    const workspaceRoot = normalizeWorkspaceRoot(entry.workspaceRoot)
    const path = normalizeFavoritePath(entry.path)
    if (workspaceRoot === null || path === null) continue
    const key = `${workspaceRoot}\0${path}`
    if (!unique.has(key)) unique.set(key, { workspaceRoot, path })
  }
  return [...unique.values()]
}

export function favoritesForWorkspace(
  entries: readonly FavoriteFileEntry[],
  workspaceRoot: string,
): readonly FavoriteFileEntry[] {
  const root = normalizeWorkspaceRoot(workspaceRoot)
  if (root === null) return []
  return normalizeEntries(entries).filter((entry) => entry.workspaceRoot === root)
}

export function isWorkspaceFavorite(
  entries: readonly FavoriteFileEntry[],
  workspaceRoot: string,
  path: string,
): boolean {
  const root = normalizeWorkspaceRoot(workspaceRoot)
  const relativePath = normalizeFavoritePath(path)
  if (root === null || relativePath === null) return false
  return normalizeEntries(entries).some((entry) => entry.workspaceRoot === root && entry.path === relativePath)
}

/** Toggle one relative file while preserving favorites for other workspace roots. */
export function toggleWorkspaceFavorite(
  entries: readonly FavoriteFileEntry[],
  workspaceRoot: string,
  path: string,
): FavoriteToggleResult {
  const root = normalizeWorkspaceRoot(workspaceRoot)
  if (root === null) return { ok: false, reason: 'invalid-root' }
  const relativePath = normalizeFavoritePath(path)
  if (relativePath === null) return { ok: false, reason: 'invalid-path' }

  const normalized = normalizeEntries(entries)
  const alreadyFavorite = normalized.some((entry) => entry.workspaceRoot === root && entry.path === relativePath)
  if (alreadyFavorite) {
    return {
      ok: true,
      isFavorite: false,
      favorites: normalized.filter((entry) => entry.workspaceRoot !== root || entry.path !== relativePath),
    }
  }

  const workspaceCount = normalized.filter((entry) => entry.workspaceRoot === root).length
  if (workspaceCount >= MAX_FAVORITES_PER_WORKSPACE || normalized.length >= MAX_FAVORITE_FILES_TOTAL) {
    return { ok: false, reason: 'limit' }
  }
  return {
    ok: true,
    isFavorite: true,
    favorites: [...normalized, { workspaceRoot: root, path: relativePath }],
  }
}
