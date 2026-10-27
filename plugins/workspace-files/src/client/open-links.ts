/**
 * Capture clicks on conversation file-looking links and open the native resource preview.
 */

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FileExplorerSettings } from '../shared/settings-contract.ts'
import { fileAddressFor } from './workspace-address.ts'

const ABS_PATH = /^(?:\/|[A-Za-z]:[\\/])/
const REL_PATH = /^\.\.?[\\/]/

function candidateFromAnchor(anchor: HTMLAnchorElement): string | null {
  const dataPath = anchor.getAttribute('data-path') ?? anchor.getAttribute('data-filepath')
  if (dataPath !== null && dataPath.trim() !== '') return dataPath.trim()
  const href = anchor.getAttribute('href')
  if (href === null || href === '' || href.startsWith('#') || href.startsWith('mailto:')) return null
  if (href.startsWith('file:')) {
    try {
      return decodeURIComponent(href.replace(/^file:\/\//, '').replace(/^\/([A-Za-z]:)/, '$1'))
    } catch {
      return null
    }
  }
  if (ABS_PATH.test(href) || REL_PATH.test(href)) return href
  // Plain relative workspace paths without scheme
  if (!href.includes('://') && href.includes('/') && !href.startsWith('//')) return href
  return null
}

/**
 * Install a capture-phase click interceptor while settings allow it.
 * @returns disposer.
 */
export function installOpenLinksInterceptor(
  scope: ConfigForm<FileExplorerSettings>,
  getSessionId: () => string | null | undefined,
  openResource: (address: string) => void,
): () => void {
  const onClick = (event: MouseEvent): void => {
    const snap = scope.getSnapshot()
    if (snap.status !== 'ready' || snap.value?.openLinksInEditor !== true) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a')
    if (!(anchor instanceof HTMLAnchorElement)) return
    const path = candidateFromAnchor(anchor)
    if (path === null) return
    const sessionId = getSessionId()
    if (typeof sessionId !== 'string') return
    event.preventDefault()
    event.stopPropagation()
    openResource(fileAddressFor(sessionId, undefined, path))
  }

  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
