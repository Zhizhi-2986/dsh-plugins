/** Locales for the file explorer plugin. */

export const NS = 'dsh-workspace-enhanced' as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-workspace-enhanced': ExplorerKey
  }
}

export type ExplorerKey =
  | 'viewLabel'
  | 'emptyWorkspace'
  | 'settingsTitle'
  | 'settingsDescription'
  | 'settingsOpenLinks'
  | 'settingsOpenLinksHint'
  | 'settingsReorderTabs'
  | 'settingsReorderTabsHint'
  | 'expand'
  | 'collapse'
  | 'expandAll'
  | 'collapseAll'
  | 'readOnly'
  | 'refresh'
  | 'tabClose'
  | 'tabCloseRight'
  | 'tabCloseAll'
  | 'editorEmpty'
  | 'editorSave'
  | 'editorSource'
  | 'editorPreview'
  | 'editorSaved'
  | 'editorSaving'
  | 'editorNoChanges'
  | 'editorTextareaMode'
  | 'treeAriaLabel'
  | 'editorAppearance'
  | 'editorTheme'
  | 'editorThemeDark'
  | 'editorThemeLight'
  | 'editorThemeHighContrast'
  | 'editorFontSize'
  | 'editorFontSmaller'
  | 'editorFontLarger'
  | 'editorCustomColor'
  | 'editorCustomColorHint'
  | 'editorCustomColorInvalid'
  | 'editorCustomColorClear'
  | 'editorScheme'
  | 'editorSchemeSave'
  | 'editorSchemeEmpty'
  | 'editorSchemeRemove'
  | 'editorFilePath'
  | 'searchWorkspace'
  | 'searching'
  | 'searchNoResults'
  | 'searchPartial'
  | 'showHiddenFiles'
  | 'hideHiddenFiles'
  | 'searchEnterQuery'
  | 'editorEdit'
  | 'editorEditAction'
  | 'editorReadFailed'
  | 'codePreviewCopy'
  | 'codePreviewCopied'
  | 'codePreviewTitle'
  | 'codePreviewWrap'
  | 'codePreviewUnwrap'
  | 'editorView'
  | 'editorConflict'
  | 'editorFind'
  | 'editorFindPlaceholder'
  | 'editorFindCaseSensitive'
  | 'editorFindPrevious'
  | 'editorFindNext'
  | 'editorFindClose'
  | 'quickOpen'
  | 'quickOpenPlaceholder'
  | 'quickOpenClose'
  | 'quickOpenEmpty'
  | 'quickOpenPartial'
  | 'favoriteTitle'
  | 'favoriteLoading'
  | 'favoriteClose'
  | 'favoriteChecking'
  | 'favoriteAddDeferred'
  | 'favoriteEmpty'
  | 'favoriteOpen'
  | 'favoriteRemove'
  | 'favoriteUnavailable'
  | 'favoriteLimitReached'
  | 'favoriteSaveFailed'
  | 'favoriteSaving'
  | 'createFile'
  | 'createFileHint'
  | 'createFilePath'
  | 'createFileFailed'
  | 'createFileAction'
  | 'creatingFile'
  | 'expandAllLimitReached'
  | 'expandAllEntriesOmitted'
  | 'directoryLoadFailed'
  | 'cancel'
  | 'replaceTitle'
  | 'replaceShort'
  | 'replaceHint'
  | 'replaceFind'
  | 'replaceWith'
  | 'replacePreviewAction'
  | 'replacePreviewing'
  | 'replaceAll'
  | 'replaceApplying'
  | 'replaceOccurrences'
  | 'replaceAcross'
  | 'replaceFiles'
  | 'replaceNoMatches'
  | 'replaceBefore'
  | 'replaceAfter'
  | 'replaceSucceeded'
  | 'replaceFailedCount'
  | 'replaceFailed'

const zh: Record<ExplorerKey, string> = {
  viewLabel: '文件',
  emptyWorkspace: '工作区为空',
  settingsTitle: '工作区文件',
  settingsDescription: '文件链接与实验性 Tab 排序',
  settingsOpenLinks: '在原生预览中打开对话内文件链接',
  settingsOpenLinksHint: '拦截会话消息里的工作区路径链接，并在 DSH 原生预览中打开',
  settingsReorderTabs: '实验性：拖拽排序顶部视图 Tab',
  settingsReorderTabsHint: '仅改变 Desktop 的视觉顺序；读屏和焦点顺序仍按原始 Tab 顺序。插件停用后恢复原貌。',
  expand: '展开',
  collapse: '折叠',
  expandAll: '全部展开',
  collapseAll: '全部折叠',
  expandAllLimitReached: '全部展开已达到目录数或条目数上限；其余内容请按需手动展开。',
  expandAllEntriesOmitted: '受全部展开预算限制，部分条目未显示。',
  directoryLoadFailed: '无法加载此目录。',
  readOnly: '当前不可写入设置',
  refresh: '刷新',
  tabClose: '关闭',
  tabCloseRight: '关闭右侧',
  tabCloseAll: '关闭所有',
  editorEmpty: '从左侧目录树打开文件',
  editorSave: '保存',
  editorSource: '源码',
  editorPreview: '预览',
  editorSaved: '已保存',
  editorSaving: '保存中…',
  editorNoChanges: '没有需要保存的改动',
  editorTextareaMode: '文本框模式',
  treeAriaLabel: '工作区文件',
  editorAppearance: '主题',
  editorTheme: '底色',
  editorThemeDark: '深色',
  editorThemeLight: '浅色',
  editorThemeHighContrast: '高对比',
  editorFontSize: '字号',
  editorFontSmaller: '缩小字号',
  editorFontLarger: '放大字号',
  editorCustomColor: '自定义色值',
  editorCustomColorHint: '支持 #RGB / #RRGGBB / #RRGGBBAA',
  editorCustomColorInvalid: '色值无效，请使用 HTML 十六进制颜色',
  editorCustomColorClear: '清除',
  editorScheme: '方案',
  editorSchemeSave: '保存当前方案',
  editorSchemeEmpty: '暂无已保存方案',
  editorSchemeRemove: '删除方案',
  editorFilePath: '文件路径',
  searchWorkspace: '搜索文件内容',
  searching: '正在搜索…',
  searchNoResults: '没有匹配项',
  searchPartial: '结果可能不完整：部分文件过大或超出扫描上限',
  showHiddenFiles: '显示隐藏文件',
  hideHiddenFiles: '不显示隐藏文件',
  searchEnterQuery: '输入文字搜索文件内容',
  editorEdit: '编辑文件',
  editorEditAction: '编辑',
  editorReadFailed: '无法读取文件以开始编辑；请检查会话后重试。',
  codePreviewCopy: '复制',
  codePreviewCopied: '已复制',
  codePreviewTitle: '代码',
  codePreviewWrap: '自动换行',
  codePreviewUnwrap: '取消自动换行',
  editorView: '查看模式',
  editorConflict: '文件已被外部修改，未保存内容已保留；请重新载入后再试。',
  editorFind: '查找',
  editorFindPlaceholder: '查找当前文件',
  editorFindCaseSensitive: '区分大小写',
  editorFindPrevious: '上一个匹配项',
  editorFindNext: '下一个匹配项',
  editorFindClose: '关闭查找',
  quickOpen: '快速打开',
  quickOpenPlaceholder: '按文件名或路径搜索（可加 :行号）',
  quickOpenClose: '关闭快速打开',
  quickOpenEmpty: '输入文件名或路径开始搜索',
  quickOpenPartial: 'Quick Open 结果可能不完整；可缩小搜索范围后重试。',
  favoriteTitle: '收藏',
  favoriteLoading: '正在读取收藏…',
  favoriteClose: '关闭收藏',
  favoriteChecking: '正在检查文件…',
  favoriteAddDeferred: '当前 Files API 未提供文件行右键菜单；暂不能新增收藏。',
  favoriteEmpty: '当前工作区暂无收藏文件',
  favoriteOpen: '打开收藏文件',
  favoriteRemove: '移除收藏',
  favoriteUnavailable: '文件不存在或当前会话无法访问；收藏已保留，可移除后重试。',
  favoriteLimitReached: '单个工作区最多收藏 200 个文件。',
  favoriteSaveFailed: '收藏保存失败，请检查设置权限后重试。',
  favoriteSaving: '正在保存收藏…',
  createFile: '新建文件',
  createFileHint: '输入工作区根目录下的相对路径；父目录必须已存在。',
  createFilePath: '相对工作区根目录的文件路径',
  createFileFailed: '创建文件失败',
  createFileAction: '创建',
  creatingFile: '创建中…',
  cancel: '取消',
  replaceTitle: '全局替换',
  replaceShort: '替换',
  replaceHint: '按区分大小写的单行字面文本匹配。先预览，再确认写入。',
  replaceFind: '查找文本',
  replaceWith: '替换为',
  replacePreviewAction: '预览替换',
  replacePreviewing: '正在生成预览…',
  replaceAll: '全部替换',
  replaceApplying: '正在替换…',
  replaceOccurrences: '处匹配',
  replaceAcross: '，涉及',
  replaceFiles: '个文件',
  replaceNoMatches: '没有匹配项',
  replaceBefore: '替换前',
  replaceAfter: '替换后',
  replaceSucceeded: '个文件已完成',
  replaceFailedCount: '个文件失败',
  replaceFailed: '全局替换失败',
}

const en: Record<ExplorerKey, string> = {
  viewLabel: 'Files',
  emptyWorkspace: 'Empty workspace',
  settingsTitle: 'Workspace files',
  settingsDescription: 'File links and experimental tab ordering',
  settingsOpenLinks: 'Open conversation file links in native Preview',
  settingsOpenLinksHint: 'Intercept workspace file links in conversation messages and open the DSH native Preview',
  settingsReorderTabs: 'Experimental: drag to reorder top View tabs',
  settingsReorderTabsHint: 'Visual order only on Desktop; screen-reader and focus order remain unchanged. Disabling the plugin restores the native tabs.',
  expand: 'Expand',
  collapse: 'Collapse',
  expandAll: 'Expand All',
  collapseAll: 'Collapse All',
  expandAllLimitReached: 'Expand All reached its folder or entry limit; expand the remaining content manually as needed.',
  expandAllEntriesOmitted: 'Additional entries are hidden by the Expand All budget.',
  directoryLoadFailed: 'Could not load this directory.',
  readOnly: 'Settings are read-only right now',
  refresh: 'Refresh',
  tabClose: 'Close',
  tabCloseRight: 'Close to the Right',
  tabCloseAll: 'Close All',
  editorEmpty: 'Open a file from the explorer',
  editorSave: 'Save',
  editorSource: 'Source',
  editorPreview: 'Preview',
  editorSaved: 'Saved',
  editorSaving: 'Saving…',
  editorNoChanges: 'No changes to save',
  editorTextareaMode: 'Textarea mode',
  treeAriaLabel: 'Workspace files',
  editorAppearance: 'Theme',
  editorTheme: 'Background',
  editorThemeDark: 'Dark',
  editorThemeLight: 'Light',
  editorThemeHighContrast: 'High contrast',
  editorFontSize: 'Font size',
  editorFontSmaller: 'Decrease font size',
  editorFontLarger: 'Increase font size',
  editorCustomColor: 'Custom color',
  editorCustomColorHint: 'Accepts #RGB / #RRGGBB / #RRGGBBAA',
  editorCustomColorInvalid: 'Invalid color — use an HTML hex value',
  editorCustomColorClear: 'Clear',
  editorScheme: 'Schemes',
  editorSchemeSave: 'Save current scheme',
  editorSchemeEmpty: 'No saved schemes yet',
  editorSchemeRemove: 'Remove scheme',
  editorFilePath: 'File path',
  searchWorkspace: 'Search file contents',
  searching: 'Searching…',
  searchNoResults: 'No matches',
  searchPartial: 'Results may be incomplete: some files exceeded the scan limits',
  showHiddenFiles: 'Show hidden files',
  hideHiddenFiles: 'Hide hidden files',
  searchEnterQuery: 'Enter text to search file contents',
  editorEdit: 'Edit file',
  editorEditAction: 'Edit',
  editorReadFailed: 'Could not read this file for editing. Check the Session and retry.',
  codePreviewCopy: 'Copy',
  codePreviewCopied: 'Copied',
  codePreviewTitle: 'Code',
  codePreviewWrap: 'Wrap lines',
  codePreviewUnwrap: 'Unwrap lines',
  editorView: 'View mode',
  editorConflict: 'The file changed outside the editor. Your unsaved text was kept; reload before saving again.',
  editorFind: 'Find',
  editorFindPlaceholder: 'Find in current file',
  editorFindCaseSensitive: 'Match case',
  editorFindPrevious: 'Previous match',
  editorFindNext: 'Next match',
  editorFindClose: 'Close find',
  quickOpen: 'Quick Open',
  quickOpenPlaceholder: 'Search file name or path (optional :line)',
  quickOpenClose: 'Close Quick Open',
  quickOpenEmpty: 'Enter a file name or path to search',
  quickOpenPartial: 'Quick Open results may be incomplete; try a narrower query.',
  favoriteTitle: 'Favorites',
  favoriteLoading: 'Loading Favorites…',
  favoriteClose: 'Close Favorites',
  favoriteChecking: 'Checking file…',
  favoriteAddDeferred: 'The current Files API has no file-row context menu; adding Favorites is deferred.',
  favoriteEmpty: 'No Favorites for this workspace yet.',
  favoriteOpen: 'Open favorite file',
  favoriteRemove: 'Remove favorite',
  favoriteUnavailable: 'This file is missing or unavailable in the current Session; the favorite is kept so you can remove or retry it.',
  favoriteLimitReached: 'A workspace can have at most 200 Favorites.',
  favoriteSaveFailed: 'Could not save Favorites. Check profile settings access and retry.',
  favoriteSaving: 'Saving Favorite…',
  createFile: 'New file',
  createFileHint: 'Enter a path relative to the workspace root. Parent directories must already exist.',
  createFilePath: 'File path from workspace root',
  createFileFailed: 'Could not create file',
  createFileAction: 'Create',
  creatingFile: 'Creating…',
  cancel: 'Cancel',
  replaceTitle: 'Replace in workspace',
  replaceShort: 'Replace',
  replaceHint: 'Case-sensitive, single-line literal match. Review the preview before confirming writes.',
  replaceFind: 'Find text',
  replaceWith: 'Replace with',
  replacePreviewAction: 'Preview replacement',
  replacePreviewing: 'Building preview…',
  replaceAll: 'Replace all',
  replaceApplying: 'Replacing…',
  replaceOccurrences: 'occurrences',
  replaceAcross: 'across',
  replaceFiles: 'files',
  replaceNoMatches: 'No matches found',
  replaceBefore: 'Before',
  replaceAfter: 'After',
  replaceSucceeded: 'files succeeded',
  replaceFailedCount: 'files failed',
  replaceFailed: 'Global replacement failed',
}

export const dictionaries = { zh, en }

export type ExplorerTranslate = (key: ExplorerKey, vars?: Record<string, string>) => string

export function explorerT(locale: string): ExplorerTranslate {
  const table = locale.startsWith('zh') ? zh : en
  return (key, vars) => {
    let text = table[key]
    if (vars !== undefined) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, value)
      }
    }
    return text
  }
}
