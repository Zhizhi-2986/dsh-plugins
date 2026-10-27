/**
 * Markdown preview using `marked`.
 */

import { useMemo, type ReactElement } from 'react'
import { renderSafeMarkdown } from './markdown-safe.ts'
import css from './editor.module.css'

export interface MarkdownPreviewProps {
  readonly content: string
  readonly blockImages?: boolean
}

/**
 * Render markdown source as HTML inside a scrollable pane.
 */
export function MarkdownPreview(props: MarkdownPreviewProps): ReactElement {
  const html = useMemo(() => {
    try {
      return renderSafeMarkdown(props.content, { blockImages: props.blockImages })
    } catch (error) {
      return `<pre>${escapeHtml(error instanceof Error ? error.message : 'preview failed')}</pre>`
    }
  }, [props.content, props.blockImages])

  return (
    <div
      className={css.preview}
      data-file-explorer-preview=""
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
