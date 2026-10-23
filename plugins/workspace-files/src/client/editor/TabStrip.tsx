/**
 * Tab strip for open editor buffers, with close + context-menu actions.
 */

import { useCallback, useState, type ReactElement } from 'react'
import type { EditorTab } from '../state/tabs.ts'
import type { BuffersStore } from '../state/buffers.ts'
import type { ExplorerTranslate } from '../locales.ts'
import { ExplorerContextMenu } from '../explorer/ExplorerContextMenu.tsx'
import css from './editor.module.css'

export interface TabStripProps {
  readonly tabs: readonly EditorTab[]
  readonly activePath: string | null
  readonly buffers: BuffersStore
  readonly t: ExplorerTranslate
  readonly onActivate: (path: string) => void
  readonly onClose: (path: string) => void
  readonly onClosePaths: (paths: readonly string[]) => void
}

/**
 * Horizontal list of open paths with dirty marks, close buttons, and
 * right-click: close / close to the right / close all.
 */
export function TabStrip(props: TabStripProps): ReactElement {
  const { tabs, activePath, buffers, t, onActivate, onClose, onClosePaths } = props
  const [menu, setMenu] = useState<{
    readonly x: number
    readonly y: number
    readonly path: string
  } | null>(null)

  const closeMenu = useCallback((): void => {
    setMenu(null)
  }, [])

  const menuItems = menu === null
    ? []
    : (() => {
      const index = tabs.findIndex((tab) => tab.path === menu.path)
      const toRight = index >= 0 ? tabs.slice(index + 1).map((tab) => tab.path) : []
      return [
        {
          id: 'close',
          label: t('tabClose'),
          onSelect: () => {
            onClose(menu.path)
          },
        },
        {
          id: 'close-right',
          label: t('tabCloseRight'),
          disabled: toRight.length === 0,
          onSelect: () => {
            if (toRight.length === 0) return
            onClosePaths(toRight)
          },
        },
        {
          id: 'close-all',
          label: t('tabCloseAll'),
          onSelect: () => {
            onClosePaths(tabs.map((tab) => tab.path))
          },
        },
      ]
    })()

  return (
    <div className={css.tabs} role="tablist">
      {tabs.map((tab) => {
        const active = tab.path === activePath
        const dirty = buffers.isDirty(tab.path)
        return (
          <button
            key={tab.path}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => onActivate(tab.path)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onActivate(tab.path)
              setMenu({ x: event.clientX, y: event.clientY, path: tab.path })
            }}
          >
            <span>
              {tab.title}
              {dirty ? <span className={css.dirtyMark}> •</span> : null}
            </span>
            <span
              className={css.closeBtn}
              role="button"
              tabIndex={0}
              aria-label={t('tabClose')}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.path)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onClose(tab.path)
                }
              }}
            >
              ×
            </span>
          </button>
        )
      })}
      {menu !== null ? (
        <ExplorerContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  )
}
