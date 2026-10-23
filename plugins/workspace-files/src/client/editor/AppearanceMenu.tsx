/**
 * Popover for Monaco theme + custom hex background + font size + saved schemes.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ExplorerTranslate } from '../locales.ts'
import type { EditorAppearance, EditorAppearanceStore, EditorChromeTheme } from './appearance.ts'
import {
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  hexForColorInput,
  normalizeHexColor,
} from './appearance.ts'
import css from './editor.module.css'

export interface AppearanceMenuProps {
  readonly t: ExplorerTranslate
  readonly appearance: EditorAppearance
  readonly store: EditorAppearanceStore
  readonly onClose: () => void
}

const THEME_OPTIONS: readonly {
  readonly id: EditorChromeTheme
  readonly labelKey: 'editorThemeDark' | 'editorThemeLight' | 'editorThemeHighContrast'
}[] = [
  { id: 'vs-dark', labelKey: 'editorThemeDark' },
  { id: 'vs', labelKey: 'editorThemeLight' },
  { id: 'hc-black', labelKey: 'editorThemeHighContrast' },
]

/**
 * Floating panel: preset themes, custom HTML hex, font size, saved schemes.
 */
export function AppearanceMenu(props: AppearanceMenuProps): ReactElement {
  const { t, appearance, store, onClose } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [hexDraft, setHexDraft] = useState(
    appearance.customBackground ?? hexForColorInput(null, appearance.theme),
  )
  const [hexInvalid, setHexInvalid] = useState(false)

  useEffect(() => {
    setHexDraft(appearance.customBackground ?? hexForColorInput(null, appearance.theme))
    setHexInvalid(false)
  }, [appearance.customBackground, appearance.theme])

  useEffect(() => {
    const onPointer = (event: MouseEvent): void => {
      const root = rootRef.current
      if (root !== null && root.contains(event.target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer, true)
      document.addEventListener('keydown', onKey, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const commitHex = (raw: string): boolean => {
    const normalized = normalizeHexColor(raw)
    if (normalized === null) {
      setHexInvalid(true)
      return false
    }
    setHexInvalid(false)
    setHexDraft(normalized)
    store.setCustomBackground(normalized)
    return true
  }

  const saveCurrentScheme = (): void => {
    const draft = hexDraft.trim()
    if (draft !== '') {
      const normalized = normalizeHexColor(draft)
      if (normalized === null) {
        setHexInvalid(true)
        return
      }
      setHexInvalid(false)
      setHexDraft(normalized)
      store.setCustomBackground(normalized)
      store.saveScheme(normalized)
      return
    }
    store.saveScheme()
  }

  const pickerValue = hexForColorInput(
    normalizeHexColor(hexDraft) ?? appearance.customBackground,
    appearance.theme,
  )

  return (
    <div
      ref={rootRef}
      className={css.appearanceMenu}
      role="dialog"
      aria-label={t('editorAppearance')}
      data-file-explorer-appearance=""
    >
      <div className={css.appearanceSection}>
        <div className={css.appearanceLabel}>{t('editorTheme')}</div>
        <div className={css.appearanceThemeRow} role="radiogroup" aria-label={t('editorTheme')}>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={appearance.customBackground === null && appearance.theme === option.id}
              className={
                appearance.customBackground === null && appearance.theme === option.id
                  ? `${css.appearanceChip} ${css.appearanceChipActive}`
                  : css.appearanceChip
              }
              onClick={() => store.setTheme(option.id)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className={css.appearanceSection}>
        <div className={css.appearanceLabel}>{t('editorCustomColor')}</div>
        <div className={css.appearanceColorRow}>
          <input
            type="color"
            className={css.appearanceColorSwatch}
            value={pickerValue}
            aria-label={t('editorCustomColor')}
            onChange={(event) => {
              commitHex(event.target.value)
            }}
          />
          <input
            type="text"
            className={hexInvalid ? `${css.appearanceHexInput} ${css.appearanceHexInvalid}` : css.appearanceHexInput}
            value={hexDraft}
            spellCheck={false}
            placeholder="#1e1e1e"
            aria-invalid={hexInvalid}
            aria-label={t('editorCustomColor')}
            onChange={(event) => {
              setHexDraft(event.target.value)
              setHexInvalid(false)
            }}
            onBlur={() => {
              if (hexDraft.trim() === '') {
                store.setCustomBackground(null)
                setHexDraft(hexForColorInput(null, appearance.theme))
                setHexInvalid(false)
                return
              }
              commitHex(hexDraft)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitHex(hexDraft)
              }
            }}
          />
          <button
            type="button"
            className={css.appearanceStep}
            disabled={appearance.customBackground === null}
            onClick={() => {
              store.setCustomBackground(null)
              setHexDraft(hexForColorInput(null, appearance.theme))
              setHexInvalid(false)
            }}
          >
            {t('editorCustomColorClear')}
          </button>
        </div>
        {hexInvalid ? (
          <div className={css.appearanceHint}>{t('editorCustomColorInvalid')}</div>
        ) : (
          <div className={css.appearanceHint}>{t('editorCustomColorHint')}</div>
        )}
      </div>
      <div className={css.appearanceSection}>
        <div className={css.appearanceLabel}>{t('editorFontSize')}</div>
        <div className={css.appearanceFontRow}>
          <button
            type="button"
            className={css.appearanceStep}
            aria-label={t('editorFontSmaller')}
            disabled={appearance.fontSize <= EDITOR_FONT_MIN}
            onClick={() => store.bumpFont(-1)}
          >
            A−
          </button>
          <span className={css.appearanceFontValue}>{appearance.fontSize}px</span>
          <button
            type="button"
            className={css.appearanceStep}
            aria-label={t('editorFontLarger')}
            disabled={appearance.fontSize >= EDITOR_FONT_MAX}
            onClick={() => store.bumpFont(1)}
          >
            A+
          </button>
        </div>
      </div>
      <div className={css.appearanceSection}>
        <div className={css.appearanceLabel}>{t('editorScheme')}</div>
        <button
          type="button"
          className={css.appearanceSaveScheme}
          onClick={saveCurrentScheme}
        >
          {t('editorSchemeSave')}
        </button>
        {appearance.schemes.length === 0 ? (
          <div className={css.appearanceHint}>{t('editorSchemeEmpty')}</div>
        ) : (
          <ul className={css.appearanceSchemeList} aria-label={t('editorScheme')}>
            {appearance.schemes.map((scheme) => {
              const active =
                appearance.customBackground === scheme.background
                && appearance.fontSize === scheme.fontSize
              return (
                <li key={scheme.id} className={css.appearanceSchemeItem}>
                  <button
                    type="button"
                    className={
                      active
                        ? `${css.appearanceSchemeApply} ${css.appearanceSchemeApplyActive}`
                        : css.appearanceSchemeApply
                    }
                    onClick={() => store.applyScheme(scheme.id)}
                  >
                    <span
                      className={css.appearanceSchemeSwatch}
                      style={{ background: scheme.background }}
                      aria-hidden="true"
                    />
                    <span className={css.appearanceSchemeMeta}>
                      {scheme.background}
                      {' · '}
                      {scheme.fontSize}
                      px
                    </span>
                  </button>
                  <button
                    type="button"
                    className={css.appearanceSchemeRemove}
                    aria-label={t('editorSchemeRemove')}
                    onClick={() => store.removeScheme(scheme.id)}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
