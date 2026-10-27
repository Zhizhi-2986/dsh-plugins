import type { KeyboardEvent } from 'react'

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

/** Keep Tab navigation inside a modal and recover focus if it escaped. */
export function trapDialogTab(event: KeyboardEvent<HTMLElement>, dialog: HTMLElement | null): void {
  if (event.key !== 'Tab' || dialog === null) return
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  const first = focusable[0]
  const last = focusable.at(-1)
  if (first === undefined || last === undefined) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const active = document.activeElement
  if (!dialog.contains(active)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Restore focus to a surviving action button after its portal closes. */
export function restoreDialogTrigger(trigger: HTMLElement | null): void {
  if (trigger?.isConnected) trigger.focus()
}
