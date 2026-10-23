import test from 'node:test'
import assert from 'node:assert/strict'
import { renderSafeMarkdown } from '../src/client/editor/markdown-safe.ts'

test('escapes raw HTML and removes script URLs from links and images', () => {
  const html = renderSafeMarkdown('<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n![x](data:text/html,boom)')
  assert.doesNotMatch(html, /<img[^>]*onerror|href="javascript:|src="data:/i)
  assert.match(html, /&lt;img/u)
  assert.doesNotMatch(renderSafeMarkdown('[x](javascript&#58;alert(1))'), /<a /u)
})

test('preserves normal relative links and formatting', () => {
  const html = renderSafeMarkdown('**hello** [file](./docs/readme.md)')
  assert.match(html, /<strong>hello<\/strong>/u)
  assert.match(html, /href="\.\/docs\/readme\.md"/u)
})
