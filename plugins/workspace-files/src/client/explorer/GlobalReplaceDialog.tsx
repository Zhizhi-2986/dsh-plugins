import { useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ExplorerApi } from '../rpc.ts'
import type { BuffersStore } from '../state/buffers.ts'
import type { ExplorerTranslate } from '../locales.ts'
import { applyReplacementPreview, createReplacementPreview, replacementExcerpt, type ReplacementPreview } from './replace-preview.ts'
import { trapDialogTab } from '../dialog-focus.ts'
import css from './explorer.module.css'

export function GlobalReplaceDialog(props: {
  readonly api: ExplorerApi
  readonly buffers: BuffersStore
  readonly t: ExplorerTranslate
  readonly initialFindText: string
  readonly onClose: () => void
}): ReactElement {
  const { api, buffers, t, initialFindText, onClose } = props
  const [findText, setFindText] = useState(initialFindText)
  const [replacementText, setReplacementText] = useState('')
  const [preview, setPreview] = useState<ReplacementPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<readonly { path: string; ok: boolean; message?: string }[] | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

  const makePreview = async (): Promise<void> => {
    if (previewing || applying) return
    setPreviewing(true)
    setError(null)
    setPreview(null)
    setOutcomes(null)
    try {
      setPreview(await createReplacementPreview(api, buffers, findText, replacementText))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('replaceFailed'))
    } finally {
      setPreviewing(false)
    }
  }

  const apply = async (): Promise<void> => {
    if (preview === null || preview.files.length === 0 || applying || outcomes !== null) return
    setApplying(true)
    setError(null)
    try {
      setOutcomes(await applyReplacementPreview(api, buffers, preview))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('replaceFailed'))
    } finally {
      setApplying(false)
    }
  }

  const canClose = !previewing && !applying
  const successful = outcomes?.filter((outcome) => outcome.ok).length ?? 0
  const failed = outcomes?.length ? outcomes.length - successful : 0

  return createPortal(
    <div className={css.dialogBackdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget && canClose) onClose()
    }}>
      <section
        ref={dialogRef}
        className={`${css.dialogPanel} ${css.replaceDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-replace-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          trapDialogTab(event, dialogRef.current)
          if (event.key === 'Escape' && canClose) onClose()
        }}
      >
        <h2 id="workspace-replace-title" className={css.dialogTitle}>{t('replaceTitle')}</h2>
        <p className={css.dialogDescription}>{t('replaceHint')}</p>
        <label className={css.dialogLabel} htmlFor="workspace-replace-find">{t('replaceFind')}</label>
        <input
          id="workspace-replace-find"
          className={css.dialogInput}
          aria-label={t('replaceFind')}
          maxLength={512}
          autoFocus
          value={findText}
          disabled={previewing || applying}
          onChange={(event) => { setFindText(event.target.value); setPreview(null); setOutcomes(null); setError(null) }}
        />
        <label className={css.dialogLabel} htmlFor="workspace-replace-with">{t('replaceWith')}</label>
        <input
          id="workspace-replace-with"
          className={css.dialogInput}
          aria-label={t('replaceWith')}
          maxLength={2 * 1024 * 1024}
          value={replacementText}
          disabled={previewing || applying}
          onChange={(event) => { setReplacementText(event.target.value); setPreview(null); setOutcomes(null); setError(null) }}
        />
        {error !== null ? <div className={css.dialogError} role="alert">{error}</div> : null}
        {preview !== null ? (
          <div className={css.replacePreview}>
            <div className={css.replaceSummary} role="status">
              {preview.totalOccurrences === 0
                ? t('replaceNoMatches')
                : `${preview.totalOccurrences} ${t('replaceOccurrences')} ${t('replaceAcross')} ${preview.files.length} ${t('replaceFiles')}`}
            </div>
            {preview.files.map((file) => (
              <details key={file.path} className={css.replaceFile}>
                <summary>{file.path}<span>{file.count} {t('replaceOccurrences')}</span></summary>
                <div className={css.replaceDiff}>
                  <div><span className={css.replaceBeforeLabel}>{t('replaceBefore')}</span><pre data-file-explorer-replace-before="">{replacementExcerpt(file.before, file.firstMatchOffset, preview.findText.length)}</pre></div>
                  <div><span className={css.replaceAfterLabel}>{t('replaceAfter')}</span><pre data-file-explorer-replace-after="">{replacementExcerpt(file.after, file.firstMatchOffset, preview.replacementText.length)}</pre></div>
                </div>
              </details>
            ))}
          </div>
        ) : null}
        {outcomes !== null ? (
          <div className={css.replaceOutcome} role="status">
            {successful} {t('replaceSucceeded')}; {failed} {t('replaceFailedCount')}
            {outcomes.filter((outcome) => !outcome.ok || outcome.message !== undefined).map((outcome) => (
              <div key={outcome.path} role="alert">{outcome.path}: {outcome.message}</div>
            ))}
          </div>
        ) : null}
        <div className={css.dialogActions}>
          <button type="button" className={css.dialogButton} onClick={onClose} disabled={!canClose}>{t('cancel')}</button>
          {preview === null ? (
            <button type="button" className={`${css.dialogButton} ${css.dialogButtonPrimary}`} onClick={() => { void makePreview() }} disabled={previewing || applying || findText.length === 0} data-file-explorer-preview-replace="">
              {previewing ? t('replacePreviewing') : t('replacePreviewAction')}
            </button>
          ) : (
            <button type="button" className={`${css.dialogButton} ${css.dialogButtonPrimary}`} onClick={() => { void apply() }} disabled={preview.files.length === 0 || applying || outcomes !== null} data-file-explorer-apply-replace="">
              {applying ? t('replaceApplying') : `${t('replaceAll')} ${preview.totalOccurrences}`}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
