const FILE_PREFIX = 'dsh-resource://file/'

export interface SessionFileAddress {
  readonly sessionId: string
  readonly path: string
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/giu, ':')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/')
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[/\\]/u.test(path) || path.startsWith('\\\\')
}

function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '')
  return `${FILE_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`
}

/** Build the native Session-scoped resource address for one workspace search result. */
export function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  if (!isAbsolutePath(normalized)) return sessionFileAddress(sessionId, normalized)
  const root = (cwd ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '')
  if (root !== '' && normalized === root) return sessionFileAddress(sessionId, '')
  if (root !== '' && normalized.startsWith(`${root}/`)) {
    return sessionFileAddress(sessionId, normalized.slice(root.length + 1))
  }
  return sessionFileAddress(sessionId, normalized)
}

/** Parse only authenticated Session-scoped DSH file addresses. */
export function parseSessionFileAddress(address: string): SessionFileAddress | null {
  try {
    if (!address.startsWith(FILE_PREFIX)) return null
    const end = address.search(/[?#]/u)
    const [scope, encodedSessionId, ...segments] = address
      .slice(FILE_PREFIX.length, end === -1 ? undefined : end)
      .split('/')
    if (scope !== 'session' || encodedSessionId === undefined || encodedSessionId === '' || segments.length === 0) {
      return null
    }
    return {
      sessionId: decodeURIComponent(encodedSessionId),
      path: segments.map(decodeURIComponent).join('/'),
    }
  } catch {
    return null
  }
}
