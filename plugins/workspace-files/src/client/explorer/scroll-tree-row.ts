/**
 * Scroll a tree row into the explorer's dedicated scrollport (not the page).
 * Native scrollIntoView often fails here because ancestors use overflow:hidden.
 */

const SCROLL_PAD = 12

export function scrollTreeRowIntoView(row: HTMLElement): void {
  const scroller = row.closest('[data-file-explorer-tree-scroll]')
  if (!(scroller instanceof HTMLElement)) return

  const rowRect = row.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()

  let nextLeft = scroller.scrollLeft
  let nextTop = scroller.scrollTop

  if (rowRect.right > box.right - SCROLL_PAD) {
    nextLeft += rowRect.right - box.right + SCROLL_PAD
  } else if (rowRect.left < box.left + SCROLL_PAD) {
    nextLeft -= box.left + SCROLL_PAD - rowRect.left
  }

  if (rowRect.bottom > box.bottom - SCROLL_PAD) {
    nextTop += rowRect.bottom - box.bottom + SCROLL_PAD
  } else if (rowRect.top < box.top + SCROLL_PAD) {
    nextTop -= box.top + SCROLL_PAD - rowRect.top
  }

  if (nextLeft !== scroller.scrollLeft || nextTop !== scroller.scrollTop) {
    scroller.scrollTo({ left: Math.max(0, nextLeft), top: Math.max(0, nextTop) })
  }
}
