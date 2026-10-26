/** One workspace tree row with lazy directory expansion. */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { ExplorerApi } from '../rpc.ts'
import type { FsEntry } from '../../shared/rpc-contract.ts'
import type { ExplorerTranslate } from '../locales.ts'
import { type TreeExpansionBudget } from './tree-expansion.ts'
import css from './explorer.module.css'

export interface TreeAction {
  readonly id: number
  readonly action: 'expand' | 'collapse'
  readonly budget?: TreeExpansionBudget
}

export interface TreeNodeProps {
  readonly entry: FsEntry
  readonly depth: number
  readonly api: ExplorerApi
  readonly t: ExplorerTranslate
  readonly activePath: string | null
  readonly selectedPath: string | null
  readonly onSelect: (path: string) => void
  readonly onOpenFile: (path: string, line?: number, edit?: boolean) => void
  readonly onError: (message: string) => void
  readonly refreshToken: number
  readonly treeAction: TreeAction | null
  readonly expandCascadeId: number | null
  readonly expandBudget: TreeExpansionBudget | null
}

function joinPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

function TreeIcon({ directory }: { readonly directory: boolean }): ReactElement {
  return directory ? (
    <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.5 3.5h5l1 1.5h7v8h-13z" opacity=".85" /></svg>
  ) : (
    <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 1.5h5.5L13 5v9.5H4z" opacity=".75" /></svg>
  )
}

function FolderToggleGlyph({ open }: { readonly open: boolean }): ReactElement {
  return (
    <svg className={css.chevron} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {open ? null : <path d="M8 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  )
}

export function TreeNode(props: TreeNodeProps): ReactElement {
  const { entry, depth, api, t, activePath, selectedPath, onSelect, onOpenFile, onError, refreshToken, treeAction, expandCascadeId, expandBudget } = props
  const [expanded, setExpanded] = useState(false)
  const [expandCascade, setExpandCascade] = useState<number | null>(null)
  const [children, setChildren] = useState<readonly FsEntry[] | null>(null)
  const [childrenLimited, setChildrenLimited] = useState(false)
  const [loading, setLoading] = useState(false)
  const activeExpansionBudget = expandCascade === null
    ? null
    : treeAction?.id === expandCascade
      ? treeAction.budget ?? null
      : expandBudget?.id === expandCascade
        ? expandBudget
        : null
  const directory = entry.kind === 'dir'
  const selected = selectedPath === entry.path
  const opened = activePath === entry.path

  const loadChildren = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await api.list(entry.path)
      if (!result.ok) {
        onError(result.error.message)
        return
      }
      const entries = result.value.entries
      const visibleCount = activeExpansionBudget?.takeEntries(entry.path, entries.length) ?? entries.length
      setChildren(entries.slice(0, visibleCount))
      setChildrenLimited(visibleCount < entries.length)
    } catch {
      onError(t('directoryLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [activeExpansionBudget, api, entry.path, onError, t])

  useEffect(() => {
    if (expanded) void loadChildren()
  }, [expanded, refreshToken, loadChildren])
  useEffect(() => {
    if (!directory) return
    if (treeAction !== null) {
      const expanding = treeAction.action === 'expand'
      const allowed = expanding && (treeAction.budget?.claim(entry.path) ?? true)
      setExpanded(allowed)
      setExpandCascade(allowed ? treeAction.id : null)
    } else if (expandCascadeId !== null) {
      const allowed = expandBudget === null || (expandBudget.id === expandCascadeId && expandBudget.claim(entry.path))
      setExpanded(allowed)
      setExpandCascade(allowed ? expandCascadeId : null)
    }
  }, [treeAction, expandCascadeId, expandBudget, entry.path, directory])

  const toggle = (): void => {
    onSelect(entry.path)
    if (directory) {
      setExpanded((value) => !value)
      setExpandCascade(null)
    } else onOpenFile(entry.path)
  }

  const rowClass = [css.row, selected ? css.rowSelected : '', opened ? css.rowOpened : ''].filter(Boolean).join(' ')

  return (
    <li>
      <div
        className={rowClass}
        style={{ paddingLeft: 8 + depth * 12 }}
        title={entry.path || entry.name}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={directory ? expanded : undefined}
        onClick={toggle}
        onDoubleClick={(event) => {
          if (directory) return
          event.stopPropagation()
          onSelect(entry.path)
          onOpenFile(entry.path, undefined, true)
        }}
        onKeyDown={(event) => {
          if (directory && event.key === 'ArrowRight') {
            event.preventDefault()
            onSelect(entry.path)
            setExpanded(true)
            setExpandCascade(null)
          } else if (directory && event.key === 'ArrowLeft') {
            event.preventDefault()
            onSelect(entry.path)
            setExpanded(false)
            setExpandCascade(null)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        }}
        tabIndex={0}
      >
        {directory ? (
          <button
            type="button"
            className={css.chevronBtn}
            aria-label={expanded ? t('collapse') : t('expand')}
            aria-expanded={expanded}
            data-file-explorer-tree-toggle=""
            tabIndex={-1}
            onClick={(event) => { event.stopPropagation(); toggle() }}
          ><FolderToggleGlyph open={expanded} /></button>
        ) : <span className={css.chevronPlaceholder} />}
        <TreeIcon directory={directory} />
        <span className={css.label}>{entry.name}{loading ? '…' : ''}</span>
      </div>
      {directory && expanded ? (
        <ul className={css.children} role="group">
          {children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              api={api}
              t={t}
              activePath={activePath}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpenFile={onOpenFile}
              onError={onError}
              refreshToken={refreshToken}
              treeAction={null}
              expandCascadeId={expandCascade}
              expandBudget={treeAction?.budget ?? expandBudget}
            />
          ))}
          {children !== null && children.length === 0 && !childrenLimited ? (
            <li className={css.emptyChild} style={{ paddingLeft: 8 + (depth + 1) * 12 }}>{t('emptyWorkspace')}</li>
          ) : null}
          {childrenLimited ? (
            <li className={css.emptyChild} style={{ paddingLeft: 8 + (depth + 1) * 12 }}>{t('expandAllEntriesOmitted')}</li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}
