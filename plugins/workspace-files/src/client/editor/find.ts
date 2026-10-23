const MAX_FIND_MATCHES = 10_000

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function findOffsets(text: string, query: string, caseSensitive = false): number[] {
  if (query.length === 0) return []
  const matcher = new RegExp(escapeRegex(query), caseSensitive ? 'gu' : 'giu')
  const offsets: number[] = []
  let match: RegExpExecArray | null
  while (offsets.length < MAX_FIND_MATCHES && (match = matcher.exec(text)) !== null) {
    offsets.push(match.index)
    if (match[0].length === 0) matcher.lastIndex += 1
  }
  return offsets
}

export function nextFindOffset(
  offsets: readonly number[],
  current: number | null,
  direction: 1 | -1,
): number | null {
  if (offsets.length === 0) return null
  if (direction === 1) return offsets.find((offset) => current === null || offset > current) ?? offsets[0] ?? null
  for (let index = offsets.length - 1; index >= 0; index -= 1) {
    const offset = offsets[index]
    if (offset !== undefined && (current === null || offset < current)) return offset
  }
  return offsets.at(-1) ?? null
}

export function offsetToLineColumn(text: string, offset: number): { lineNumber: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, text.length))
  const lastNewline = text.lastIndexOf('\n', safeOffset - 1)
  const lineNumber = text.slice(0, safeOffset).split('\n').length
  return { lineNumber, column: safeOffset - lastNewline }
}
