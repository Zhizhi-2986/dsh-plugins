import { useRef, useState, type FormEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ExplorerApi } from '../rpc.ts'
import type { ExplorerTranslate } from '../locales.ts'
import { trapDialogTab } from '../dialog-focus.ts'
import css from './explorer.module.css'

const FILE_TEMPLATES = [
  { id: 'blank', label: 'templateBlank', content: '' },
  { id: 'markdown', label: 'templateMarkdown', content: '# Title\n\n' },
  { id: 'json', label: 'templateJson', content: '{\n  \n}\n' },
  { id: 'typescript', label: 'templateTypescript', content: 'export {}\n' },
] as const

export function CreateFileDialog(props: {
  readonly api: ExplorerApi
  readonly t: ExplorerTranslate
  readonly onClose: () => void
  readonly onCreated: (path: string) => void
}): ReactElement {
  const { api, t, onClose, onCreated } = props
  const [path, setPath] = useState('')
  const [templateId, setTemplateId] = useState<(typeof FILE_TEMPLATES)[number]['id']>('blank')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const normalized = path.trim()
    if (normalized.length === 0 || busy) return
    const template = FILE_TEMPLATES.find((candidate) => candidate.id === templateId)
    if (template === undefined) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.createFile(normalized, template.content)
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
        ref={dialogRef}
        className={css.dialogPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-create-file-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          trapDialogTab(event, dialogRef.current)
          if (event.key === 'Escape' && !busy) onClose()
        }}
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
          <label className={css.dialogLabel} htmlFor="workspace-create-file-template">{t('createFileTemplate')}</label>
          <select
            id="workspace-create-file-template"
            className={css.dialogInput}
            aria-label={t('createFileTemplate')}
            value={templateId}
            disabled={busy}
            onChange={(event) => setTemplateId(event.target.value as (typeof FILE_TEMPLATES)[number]['id'])}
          >
            {FILE_TEMPLATES.map((templateOption) => (
              <option key={templateOption.id} value={templateOption.id}>{t(templateOption.label)}</option>
            ))}
          </select>
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
