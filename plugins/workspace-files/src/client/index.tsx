/** Client half: additive extensions for the native Workspace Files and Preview tabs. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FILE_EXPLORER_SETTINGS_NS, type FileExplorerSettings } from '../shared/settings-contract.ts'
import { TYPERT_REMOTE } from './rpc.ts'
import { ExplorerSettingsCard } from './settings/ExplorerSettingsCard.tsx'
import { dictionaries, NS } from './locales.ts'
import { installOpenLinksInterceptor } from './open-links.ts'
import { installDesktopViewShortcuts } from './view-shortcuts.ts'
import { installDesktopTabReorder } from './tab-reorder.ts'
import { registerWorkspaceFilesEnhancements } from './sidebar-files-tab.ts'
import {
  WorkspaceCodeBody,
  WorkspaceDocumentEditAction,
  WorkspaceFilesSearchAction,
  WorkspaceMarkdownBody,
  WorkspacePlainTextBody,
} from './native-files-enhancements.tsx'
import { WorkspaceCreateFileAction, WorkspaceFavoritesAction, WorkspaceQuickOpenAction } from './native-files-actions.tsx'

const PACKAGE = 'dsh-workspace-enhanced'
/** Required client services before apply runs. */
export const inject = [
  'slots',
  'remote',
  'locale',
  'connection',
  'configForms',
  'shortcuts',
  'sidebarRight',
]

/** Mount remotes and register additive UI extensions. */
export async function apply(ctx: ClientContext): Promise<void> {
  const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  ctx.effect(() => disposeRemote, 'dsh-workspace-enhanced: remote')

  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-workspace-enhanced: dictionaries')

  const settings = ctx.configForms.get<FileExplorerSettings>(FILE_EXPLORER_SETTINGS_NS)
  ctx.effect(() => {
    const reorder = installDesktopTabReorder(ctx, settings)
    const disposeShortcuts = installDesktopViewShortcuts(ctx, reorder.resolveTab)
    return () => {
      disposeShortcuts()
      reorder.dispose()
    }
  }, 'dsh-workspace-enhanced: desktop-view-tabs')

  ctx.inject(['remote.explorerFs'], (remoteCtx) => {
    remoteCtx.inject(['sidebarRight'], (sidebarCtx) => {
      sidebarCtx.inject(['sessions', 'uiSession'], (sessionCtx) => {
        sessionCtx.effect(
          () => installOpenLinksInterceptor(
            settings,
            () => {
              const key = sessionCtx.get('uiSession')?.adapter.current.getSnapshot().key
              return typeof key === 'string' ? key : undefined
            },
            (address) => {
              const sidebar = sidebarCtx.get('sidebarRight') as { openResource: (resourceAddress: string) => void } | undefined
              sidebar?.openResource(address)
            },
          ),
          'dsh-workspace-enhanced: open-links',
        )
      })
    })

    remoteCtx.effect(() => registerWorkspaceFilesEnhancements(remoteCtx, {
      searchAction: (props) => <WorkspaceFilesSearchAction ctx={remoteCtx} {...props} />,
      quickOpenAction: (props) => <WorkspaceQuickOpenAction ctx={remoteCtx} {...props} />,
      favoritesAction: (props) => <WorkspaceFavoritesAction ctx={remoteCtx} scope={settings as ConfigForm<FileExplorerSettings>} {...props} />,
      createFileAction: (props) => <WorkspaceCreateFileAction ctx={remoteCtx} {...props} />,
      documentEditAction: (props) => <WorkspaceDocumentEditAction ctx={remoteCtx} {...props} />,
      markdownBody: (props) => <WorkspaceMarkdownBody ctx={remoteCtx} {...props} />,
      codeBody: (props) => <WorkspaceCodeBody ctx={remoteCtx} {...props} />,
      plainTextBody: (props) => <WorkspacePlainTextBody ctx={remoteCtx} {...props} />,
    }), 'dsh-workspace-enhanced: native-files-extensions')

    remoteCtx.effect(
      () => remoteCtx.configForms.whileServed([FILE_EXPLORER_SETTINGS_NS], () => remoteCtx.slots.inject('plugins.item', () => remoteCtx.slots.register({
        name: 'plugins.item',
        id: 'workspace-files',
        order: 45,
        label: () => remoteCtx.locale.bind(NS)('settingsTitle'),
        locale: NS,
        registrant: PACKAGE,
      }, (props) => (
        <ExplorerSettingsCard
          ctx={remoteCtx}
          scope={settings as ConfigForm<FileExplorerSettings>}
          {...props}
        />
      )))),
      'dsh-workspace-enhanced: plugins.item',
    )
  })
}
