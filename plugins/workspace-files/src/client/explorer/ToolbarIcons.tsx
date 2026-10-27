/** Compact toolbar icons for the explorer header. */

import type { ReactElement, Ref } from 'react'
import css from './explorer.module.css'

function IconShell(props: { readonly children: ReactElement; readonly title: string; readonly onClick: () => void; readonly className?: string }): ReactElement {
  return (
    <button
      type="button"
      className={props.className ?? css.iconBtn}
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

const svgProps = {
  className: css.toolIcon,
  viewBox: '0 0 16 16',
  fill: 'none',
  'aria-hidden': true as const,
}

/** Document with a plus — create an empty text file. */
export function NewFileIconButton(props: {
  readonly title: string
  readonly onClick: () => void
  readonly buttonRef?: Ref<HTMLButtonElement>
}): ReactElement {
  return (
    <button
      ref={props.buttonRef}
      type="button"
      className={css.iconBtn}
      title={props.title}
      aria-label={props.title}
      data-file-explorer-create-file=""
      onClick={props.onClick}
    >
      <svg className={css.toolIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 2.25h6.5L15 5.8v8.95H5z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
        <path d="M11.5 2.5v3.4H15" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
        <circle cx="14.7" cy="14.7" r="3.4" fill="var(--dsw-alias-bg-layer-1)" stroke="currentColor" strokeWidth="1.35" />
        <path d="M14.7 12.9v3.6m-1.8-1.8h3.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/** Circular arrows — refresh. */
export function RefreshIconButton(props: { readonly title: string; readonly onClick: () => void }): ReactElement {
  return (
    <IconShell title={props.title} onClick={props.onClick}>
      <svg {...svgProps}>
        <path
          d="M13 8a5 5 0 1 1-1.4-3.4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path d="M13 3.2V6.5H9.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IconShell>
  )
}

/** File-folder with plus — expand all. */
export function ExpandAllIconButton(props: { readonly title: string; readonly onClick: () => void }): ReactElement {
  return (
    <IconShell title={props.title} onClick={props.onClick} className={`${css.iconBtn} ${css.treeActionBtn}`}>
      <svg {...svgProps}>
        <path d="M1.7 4h4.6l1.1 1.5h6.9v8H1.7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 7.3v4.1m-2-2.05h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </IconShell>
  )
}

/** File-folder with minus — collapse all. */
export function CollapseAllIconButton(props: { readonly title: string; readonly onClick: () => void }): ReactElement {
  return (
    <IconShell title={props.title} onClick={props.onClick} className={`${css.iconBtn} ${css.treeActionBtn}`}>
      <svg {...svgProps}>
        <path d="M1.7 4h4.6l1.1 1.5h6.9v8H1.7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 9.35h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </IconShell>
  )
}

/** Eye — show or hide dotfiles in the tree and Quick Open. */
export function HiddenFilesToggleIconButton(props: {
  readonly title: string
  readonly active: boolean
  readonly onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className={props.active ? `${css.iconBtn} ${css.iconBtnActive}` : css.iconBtn}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      <svg {...svgProps}>
        <path
          d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.2" />
        {props.active ? null : (
          <path d="M2.6 13.4 13.4 2.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        )}
      </svg>
    </button>
  )
}
