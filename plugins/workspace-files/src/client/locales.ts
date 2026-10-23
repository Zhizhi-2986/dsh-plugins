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

const zh: Record<ExplorerKey, string> = {
  viewLabel: '文件',
  emptyWorkspace: '工作区为空',
  settingsTitle: '工作区文件',
  settingsDescription: '文件链接与实验性 Tab 排序',
  settingsOpenLinks: '在编辑器中打开对话内文件链接',
  settingsOpenLinksHint: '拦截会话消息里的本地路径链接，并在文件编辑器中打开',
  settingsReorderTabs: '实验性：拖拽排序顶部视图 Tab',
  settingsReorderTabsHint: '仅改变 Desktop 的视觉顺序；读屏和焦点顺序仍按原始 Tab 顺序。插件停用后恢复原貌。',
  expand: '展开',
  collapse: '折叠',
  expandAll: '全部展开',
  collapseAll: '全部折叠',
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
  searchWorkspace: '在工作区中搜索',
  searching: '正在搜索…',
  searchNoResults: '没有匹配项',
  searchPartial: '结果可能不完整：部分文件过大或超出扫描上限',
  showHiddenFiles: '显示隐藏文件',
  hideHiddenFiles: '不显示隐藏文件',
  searchEnterQuery: '输入文字搜索文件内容',
  editorEdit: '进入编辑',
  editorView: '查看模式',
  editorConflict: '文件已被外部修改，未保存内容已保留；请重新载入后再试。',
  editorFind: '查找',
  editorFindPlaceholder: '查找当前文件',
  editorFindCaseSensitive: '区分大小写',
  editorFindPrevious: '上一个匹配项',
  editorFindNext: '下一个匹配项',
  editorFindClose: '关闭查找',
  quickOpen: '快速打开',
  quickOpenPlaceholder: '按名称查找文件（可加 :行号）',
  quickOpenClose: '关闭快速打开',
  quickOpenEmpty: '没有最近文件或匹配文件',
}

const en: Record<ExplorerKey, string> = {
  viewLabel: 'Files',
  emptyWorkspace: 'Empty workspace',
  settingsTitle: 'Workspace files',
  settingsDescription: 'File links and experimental tab ordering',
  settingsOpenLinks: 'Open conversation file links in editor',
  settingsOpenLinksHint: 'Intercept local path links in conversation messages and open them in the file editor',
  settingsReorderTabs: 'Experimental: drag to reorder top View tabs',
  settingsReorderTabsHint: 'Visual order only on Desktop; screen-reader and focus order remain unchanged. Disabling the plugin restores the native tabs.',
  expand: 'Expand',
  collapse: 'Collapse',
  expandAll: 'Expand All',
  collapseAll: 'Collapse All',
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
  searchWorkspace: 'Search workspace',
  searching: 'Searching…',
  searchNoResults: 'No matches',
  searchPartial: 'Results may be incomplete: some files exceeded the scan limits',
  showHiddenFiles: 'Show hidden files',
  hideHiddenFiles: 'Hide hidden files',
  searchEnterQuery: 'Enter text to search file contents',
  editorEdit: 'Edit file',
  editorView: 'View mode',
  editorConflict: 'The file changed outside the editor. Your unsaved text was kept; reload before saving again.',
  editorFind: 'Find',
  editorFindPlaceholder: 'Find in current file',
  editorFindCaseSensitive: 'Match case',
  editorFindPrevious: 'Previous match',
  editorFindNext: 'Next match',
  editorFindClose: 'Close find',
  quickOpen: 'Quick Open',
  quickOpenPlaceholder: 'Find a file by name (add :line)',
  quickOpenClose: 'Close Quick Open',
  quickOpenEmpty: 'No recent or matching files',
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
