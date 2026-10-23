/**
 * Capture clicks on conversation file-looking links and open them in the editor.
 */

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FileExplorerSettings } from '../shared/settings-contract.ts'
import { requestOpenPath } from './editor/EditorSurface.tsx'

const TABS_SELECTOR = '[data-conversation-tabs] [role="tab"]'

/**
 * Bring the Files view tab into front before the editor opens a path.
 * The tab is the conversation view registered by this plugin, matched by label
 * because the host does not publish a view id on the tab button.
 */
function activateFilesTab(label: string): boolean {
  const tabs = document.querySelectorAll<HTMLElement>(TABS_SELECTOR)
  for (const tab of tabs) {
    if (tab.textContent?.trim() === label) {
      tab.click()
      return true
    }
  }
  return false
}

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
  filesTabLabel: () => string,
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
    event.preventDefault()
    event.stopPropagation()
    // Prefer relative paths as-is; absolute paths are passed through for host setRoot/read failure handling.
    const relative = ABS_PATH.test(path)
      ? path.replace(/^\/+/, '').replace(/^[A-Za-z]:[\\/]/, '')
      : path.replace(/^\.\//, '')
    activateFilesTab(filesTabLabel())
    requestOpenPath(relative.replaceAll('\\', '/'))
  }

  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
