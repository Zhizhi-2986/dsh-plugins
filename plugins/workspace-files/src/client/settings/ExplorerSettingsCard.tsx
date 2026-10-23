/**
 * Plugins page contribution for file explorer preferences.
 */

import { useCallback, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileExplorerSettings } from '../../shared/settings-contract.ts'
import { explorerT } from '../locales.ts'
import css from './settings-card.module.css'

export interface ExplorerSettingsCardProps extends PropsRuntime<'plugins.item'>, PropsLocale<'dsh-workspace-enhanced'> {
  readonly ctx: ClientContext
  readonly scope: ConfigForm<FileExplorerSettings>
}

/** Summary one-liner or settings form body for the Plugins page. */
export function ExplorerSettingsCard(props: ExplorerSettingsCardProps): ReactElement | null {
  const { ctx, scope, view, t: slotT } = props
  // ConfigForm methods read `this.store`, so they must stay bound to the form.
  const snap = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const locale = useSyncExternalStore(
    (listener) => ctx.locale.subscribe(listener),
    () => ctx.locale.getSnapshot().active,
  )
  const t = explorerT(locale)
  const [saving, setSaving] = useState(false)
  const writable = snap.writable
  const toggle = useCallback(async (field: 'openLinksInEditor' | 'reorderViewTabs', checked: boolean): Promise<void> => {
    if (!writable || saving) return
    setSaving(true)
    try {
      await scope.set(field, checked)
    } finally {
      setSaving(false)
    }
  }, [saving, scope, writable])

  if (view === 'summary') return <span>{slotT('settingsDescription')}</span>

  const value = snap.value
  if (snap.status !== 'ready' || value === undefined) return null
  const openLinks = value.openLinksInEditor

  return (
    <div className={css.body}>
      {!writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}
      <div className={css.field}>
        <label className={writable ? css.row : `${css.row} ${css.rowDisabled}`}>
          <input
            className={css.checkbox}
            type="checkbox"
            checked={openLinks}
            disabled={!writable || saving}
            onChange={(event) => { void toggle('openLinksInEditor', event.target.checked) }}
          />
          <span>{t('settingsOpenLinks')}</span>
        </label>
        <p className={css.hint}>{t('settingsOpenLinksHint')}</p>
      </div>
      <div className={css.field}>
        <label className={writable ? css.row : `${css.row} ${css.rowDisabled}`}>
          <input
            className={css.checkbox}
            type="checkbox"
            checked={value.reorderViewTabs === true}
            disabled={!writable || saving}
            onChange={(event) => { void toggle('reorderViewTabs', event.target.checked) }}
          />
          <span>{t('settingsReorderTabs')}</span>
        </label>
        <p className={css.hint}>{t('settingsReorderTabsHint')}</p>
      </div>
    </div>
  )
}
