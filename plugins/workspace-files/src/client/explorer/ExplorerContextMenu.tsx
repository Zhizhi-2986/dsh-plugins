/**
 * Floating context menu for editor tab actions.
 */

import { useEffect, useRef, type ReactElement } from 'react'
import css from './explorer.module.css'

export interface ContextMenuItem {
  readonly id: string
  readonly label: string
  readonly danger?: boolean
  readonly disabled?: boolean
  readonly onSelect: () => void
}

export interface ExplorerContextMenuProps {
  readonly x: number
  readonly y: number
  readonly items: readonly ContextMenuItem[]
  readonly onClose: () => void
}

/**
 * Fixed-position menu; closes on outside click, Escape, or item select.
 */
export function ExplorerContextMenu(props: ExplorerContextMenuProps): ReactElement {
  const { x, y, items, onClose } = props
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointer = (event: MouseEvent): void => {
      const root = rootRef.current
      if (root !== null && root.contains(event.target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // Defer so the opening contextmenu event does not immediately close us.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer, true)
      document.addEventListener('keydown', onKey, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 8 : x
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 8 : y
  const left = Math.min(x, maxX - 160)
  const top = Math.min(y, maxY - 88)

  return (
    <div
      ref={rootRef}
      className={css.contextMenu}
      style={{ left, top }}
      role="menu"
      data-file-explorer-context-menu=""
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled === true}
          className={item.danger === true ? `${css.contextItem} ${css.contextItemDanger}` : css.contextItem}
          onClick={() => {
            if (item.disabled === true) return
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
