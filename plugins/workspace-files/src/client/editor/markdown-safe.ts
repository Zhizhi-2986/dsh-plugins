import { marked } from 'marked'

export interface SafeMarkdownOptions {
  readonly blockImages?: boolean
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function safeHref(href: string): boolean {
  if (/[\u0000-\u0020&"'<>\\]/u.test(href) || href.startsWith('//')) return false
  if (/^https?:\/\//iu.test(href) || /^mailto:/iu.test(href)) return true
  return !/^[^/?#]*:/u.test(href)
}

/** Render untrusted workspace Markdown without executable HTML or URL schemes. */
export function renderSafeMarkdown(source: string, options: SafeMarkdownOptions = {}): string {
  const renderer = new marked.Renderer()
  renderer.html = ({ text }) => escapeHtml(text)
  renderer.link = ({ href, text }) => safeHref(href)
    ? `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
    : escapeHtml(text)
  renderer.image = ({ href, text }) => options.blockImages
    ? escapeHtml(text)
    : safeHref(href)
      ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">`
      : escapeHtml(text)
  return marked.parse(source, { async: false, renderer }) as string
}
