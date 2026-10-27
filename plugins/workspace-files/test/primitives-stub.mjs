import React from 'react'

const LANGUAGES = Object.freeze({
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  markdown: 'markdown',
  ts: 'typescript',
  tsx: 'typescript',
})

export function languageForPath(path) {
  const basename = path.split(/[\\/]/u).pop() ?? path
  const separator = basename.lastIndexOf('.')
  if (separator <= 0) return undefined
  return LANGUAGES[basename.slice(separator + 1).toLowerCase()]
}

export function CodeBlock(props) {
  return React.createElement('div', {
    className: props.className,
    'data-native-code-block': '',
    'data-code-language': props.lang,
    'data-code-wrap': String(props.wrap),
  }, React.createElement('div', {
    ref: props.contentRef,
    'data-code-block-content': '',
  }, props.code))
}
