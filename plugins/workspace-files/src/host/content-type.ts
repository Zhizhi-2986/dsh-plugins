/**
 * Decide whether a path should be treated as editable text.
 */

import { extname } from 'node:path'

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.markdown', '.txt', '.css', '.scss', '.less',
  '.html', '.htm', '.xml', '.svg',
  '.yml', '.yaml', '.toml', '.ini', '.env',
  '.sh', '.bash', '.zsh', '.ps1',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.h', '.cpp', '.hpp', '.cs',
  '.sql', '.graphql', '.vue', '.svelte',
  '.gitignore', '.dockerignore', '.editorconfig',
])

/**
 * Extension-based text hint (case-insensitive). Dotfiles without extension
 * that match known names are treated as text.
 */
export function isLikelyTextPath(filePath: string): boolean {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  if (base.startsWith('.') && !base.includes('.', 1)) {
    return TEXT_EXTENSIONS.has(base) || base === '.gitignore' || base === '.dockerignore'
  }
  const ext = extname(base).toLowerCase()
  if (ext === '' && !base.includes('.')) return false
  return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(base)
}

/**
 * Probe a buffer for a NUL byte (strong binary signal).
 */
export function bufferLooksBinary(sample: Uint8Array): boolean {
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) return true
  }
  return false
}

/**
 * Combined decision: known text extension → text; otherwise probe sample.
 */
export function isEditableText(filePath: string, sample: Uint8Array): boolean {
  if (isLikelyTextPath(filePath)) return !bufferLooksBinary(sample)
  return !bufferLooksBinary(sample) && sample.length > 0
    ? !hasHighControlRatio(sample)
    : !bufferLooksBinary(sample)
}

function hasHighControlRatio(sample: Uint8Array): boolean {
  if (sample.length === 0) return false
  let control = 0
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i]!
    if (b < 9 || (b > 13 && b < 32)) control += 1
  }
  return control / sample.length > 0.3
}
