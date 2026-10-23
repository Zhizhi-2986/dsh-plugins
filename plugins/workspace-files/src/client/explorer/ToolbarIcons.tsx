/** Compact toolbar icons for the explorer header. */

import type { ReactElement } from 'react'
import css from './explorer.module.css'

function IconShell(props: { readonly children: ReactElement; readonly title: string; readonly onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      className={css.iconBtn}
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

/** Nested chevrons — expand all. */
export function ExpandAllIconButton(props: { readonly title: string; readonly onClick: () => void }): ReactElement {
  return (
    <IconShell title={props.title} onClick={props.onClick}>
      <svg {...svgProps}>
        <path d="M3 4.5 8 9l5-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 8.5 8 13l5-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IconShell>
  )
}

/** Nested chevrons up — collapse all. */
export function CollapseAllIconButton(props: { readonly title: string; readonly onClick: () => void }): ReactElement {
  return (
    <IconShell title={props.title} onClick={props.onClick}>
      <svg {...svgProps}>
        <path d="M3 7.5 8 3l5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 11.5 8 7l5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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
