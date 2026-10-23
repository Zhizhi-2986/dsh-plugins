/** Settings namespace contract visible to both Host and Client. */

/**
 * Profile entry id from `cordis.patch.yml` (`dsh-workspace-enhanced`).
 * dsh ≥ 0.1.7 projects volatile Config under this id into `configForms`.
 */
export const FILE_EXPLORER_SETTINGS_NS = 'dsh-workspace-enhanced' as const

export interface FileExplorerSettings {
  /** Route conversation file-path links into the editor. */
  readonly openLinksInEditor: boolean
  /** Opt-in: visually reorder Desktop's native View tabs. */
  readonly reorderViewTabs: boolean
  /** Profile-local order of registered View ids, including hidden Views. */
  readonly viewTabOrder: readonly string[]
}

export const DEFAULT_FILE_EXPLORER_SETTINGS: FileExplorerSettings = {
  openLinksInEditor: true,
  reorderViewTabs: false,
  viewTabOrder: [],
}
