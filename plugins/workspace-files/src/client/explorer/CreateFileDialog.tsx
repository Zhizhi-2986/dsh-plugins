import { useState, type FormEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ExplorerApi } from '../rpc.ts'
import type { ExplorerTranslate } from '../locales.ts'
import css from './explorer.module.css'

export function CreateFileDialog(props: {
  readonly api: ExplorerApi
  readonly t: ExplorerTranslate
  readonly onClose: () => void
  readonly onCreated: (path: string) => void
}): ReactElement {
  const { api, t, onClose, onCreated } = props
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const normalized = path.trim()
    if (normalized.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.createFile(normalized, '')
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      onCreated(result.value.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('createFileFailed'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className={css.dialogBackdrop}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}
    >
      <section
        className={css.dialogPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-create-file-title"
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}
      >
        <h2 id="workspace-create-file-title" className={css.dialogTitle}>{t('createFile')}</h2>
        <p className={css.dialogDescription}>{t('createFileHint')}</p>
        <form onSubmit={(event) => { void submit(event) }}>
          <label className={css.dialogLabel} htmlFor="workspace-create-file-path">{t('createFilePath')}</label>
          <input
            id="workspace-create-file-path"
            className={css.dialogInput}
            aria-label={t('createFilePath')}
            maxLength={1024}
            autoFocus
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
          {error !== null ? <div className={css.dialogError} role="alert">{error}</div> : null}
          <div className={css.dialogActions}>
            <button type="button" className={css.dialogButton} onClick={onClose} disabled={busy}>{t('cancel')}</button>
            <button type="submit" className={`${css.dialogButton} ${css.dialogButtonPrimary}`} disabled={path.trim().length === 0 || busy}>
              {busy ? t('creatingFile') : t('createFileAction')}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}
