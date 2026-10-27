import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ExplorerTranslate } from './locales.ts'
import { NS } from './locales.ts'

export const WORKSPACE_FILES_SEARCH_ACTION_ID = 'dsh-workspace-enhanced/search'
export const WORKSPACE_QUICK_OPEN_ACTION_ID = 'dsh-workspace-enhanced/quick-open'
export const WORKSPACE_FAVORITES_ACTION_ID = 'dsh-workspace-enhanced/favorites'
export const WORKSPACE_CREATE_FILE_ACTION_ID = 'dsh-workspace-enhanced/create-file'
export const NATIVE_MARKDOWN_PREVIEW_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown'
export const NATIVE_CODE_PREVIEW_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code'
export const NATIVE_PLAIN_TEXT_PREVIEW_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text'

/** File action inputs share the owning Preview/Files Session and filesystem path. */
export interface WorkspaceFileActionProps {
  readonly absolutePath: string
  readonly sessionId: string
  readonly t: ExplorerTranslate
}

export type WorkspaceFilesSearchActionProps = WorkspaceFileActionProps

export interface WorkspaceDocumentRendererProps {
  readonly sessionId: string
  readonly resourceAddress: string
  readonly content: { readonly kind: 'text'; readonly text: string; readonly eof: boolean }
  readonly t: ExplorerTranslate
}

export interface WorkspaceDocumentTabInfo {
  readonly tab: {
    readonly contentId: string
    readonly navigation: { readonly params?: Readonly<Record<string, unknown>> }
  }
}

export interface WorkspaceDocumentEditActionProps {
  readonly sessionId: string
  readonly content: { readonly kind: 'text'; readonly text: string; readonly eof: boolean }
  readonly t: ExplorerTranslate
  readonly useTabInfo: () => WorkspaceDocumentTabInfo
}

export interface WorkspaceCodeRendererProps extends WorkspaceDocumentRendererProps {
  readonly wrap: boolean
  readonly scrollportRef: (scrollport: HTMLDivElement | null) => void
}

export interface WorkspacePlainTextRendererProps extends WorkspaceDocumentRendererProps {
  readonly content: {
    readonly kind: 'text'
    readonly text: string
    readonly eof: boolean
    readonly pages: readonly { readonly offset: number; readonly text: string; readonly lines: number }[]
  }
  readonly wrap: boolean
  readonly useTabInfo: () => WorkspaceDocumentTabInfo
}

export interface WorkspaceFilesEnhancementComponents {
  readonly searchAction: (props: WorkspaceFilesSearchActionProps) => ReactNode
  readonly quickOpenAction: (props: WorkspaceFilesSearchActionProps) => ReactNode
  readonly favoritesAction: (props: WorkspaceFilesSearchActionProps) => ReactNode
  readonly createFileAction: (props: WorkspaceFilesSearchActionProps) => ReactNode
  readonly documentEditAction: (props: WorkspaceDocumentEditActionProps) => ReactNode
  readonly markdownBody: (props: WorkspaceDocumentRendererProps) => ReactNode
  readonly codeBody: (props: WorkspaceCodeRendererProps) => ReactNode
  readonly plainTextBody: (props: WorkspacePlainTextRendererProps) => ReactNode
}

interface DynamicSlotRegistry {
  inject(name: string, register: () => () => void): () => void
  register(options: {
    readonly name: string
    readonly id?: string
    readonly key?: string
    readonly order?: number
    readonly priority?: number
    readonly locale?: string
    readonly registrant?: string
  }, component: (props: never) => ReactNode): () => void
}

/** Register additive Files actions and the plain-text Preview body override. */
export function registerWorkspaceFilesEnhancements(
  ctx: ClientContext,
  components: WorkspaceFilesEnhancementComponents,
): () => void {
  const slots = ctx.slots as unknown as DynamicSlotRegistry
  const disposeFilesActions = slots.inject('sidebar.right.tab.files.actions', () => {
    const disposers: Array<() => void> = []
    const registerAction = (id: string, order: number, component: (props: never) => ReactNode): void => {
      disposers.push(slots.register({
        name: 'sidebar.right.tab.files.actions',
        id,
        order,
        locale: NS,
        registrant: 'dsh-workspace-enhanced',
      }, component))
    }
    try {
      registerAction(WORKSPACE_FILES_SEARCH_ACTION_ID, -100, components.searchAction)
      registerAction(WORKSPACE_QUICK_OPEN_ACTION_ID, -80, components.quickOpenAction)
      registerAction(WORKSPACE_FAVORITES_ACTION_ID, -60, components.favoritesAction)
      registerAction(WORKSPACE_CREATE_FILE_ACTION_ID, -40, components.createFileAction)
      return () => disposers.reverse().forEach((dispose) => dispose())
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose())
      throw error
    }
  })
  const disposeDocumentEditActions = slots.inject('sidebar.right.tab.document.action', () => {
    const disposers: Array<() => void> = []
    try {
      for (const key of [NATIVE_MARKDOWN_PREVIEW_ID, NATIVE_CODE_PREVIEW_ID, NATIVE_PLAIN_TEXT_PREVIEW_ID]) {
        disposers.push(slots.register({
          name: 'sidebar.right.tab.document.action',
          key,
          locale: NS,
          registrant: 'dsh-workspace-enhanced',
        }, components.documentEditAction))
      }
      return () => disposers.reverse().forEach((dispose) => dispose())
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose())
      throw error
    }
  })
  const disposeDocumentBodies = slots.inject('sidebar.right.tab.document', () => {
    const disposers: Array<() => void> = []
    const registerBody = (key: string, component: (props: never) => ReactNode): void => {
      disposers.push(slots.register({
        name: 'sidebar.right.tab.document',
        key,
        priority: -1,
        locale: NS,
        registrant: 'dsh-workspace-enhanced',
      }, component))
    }
    try {
      registerBody(NATIVE_MARKDOWN_PREVIEW_ID, components.markdownBody)
      registerBody(NATIVE_CODE_PREVIEW_ID, components.codeBody)
      registerBody(NATIVE_PLAIN_TEXT_PREVIEW_ID, components.plainTextBody)
      return () => disposers.reverse().forEach((dispose) => dispose())
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose())
      throw error
    }
  })
  return () => {
    disposeDocumentBodies()
    disposeDocumentEditActions()
    disposeFilesActions()
  }
}
