# v0.0.4 迭代 · 源码盘点与实现计划（A01/A05 交付物）

> 日期：2026-11-02
> 基线：`main @ 35d230c`（`dsh-workspace-enhanced v0.0.3`，188 测试通过）
> 需求基线：`dsh-enhanced-optimization-dev-spec-v0.0.4-v0.0.5.md`（1.0 版）
> 状态：源码盘点完成；本文件是 A01 交付物与最小差异实现计划。

---

## 1. 已核实的既有实现（原则保留）

以下结论来自源码核对（非文档推测），行号以 `main @ 35d230c` 为准：

| 能力 | 证据（源码位置） | 与 spec 的关系 |
|---|---|---|
| Host RPC：`getRoot/list/read/write/createFile/search/quickOpen`，Typert 会话作用域 | `src/host/fs-service.ts`（`resolveScope:66-87`、`resolvePath:89-122`） | 3.5 已满足 |
| 写入守卫：`replaceIfVersion`（`write:407-447`）、`createIfAbsent`（`createFile:346-404`）；空/超长版本令牌拒绝（`hasUsableVersionToken:31-33`，1–256 字符） | `fs-service.ts` | 3.5.4 / 3.5.5 ✓ |
| 写入前提：活 Session 策略 + 沙箱 fs（`NO_SESSION`/`SANDBOX_DENIED`），提交前复查 | `fs-service.ts:423-428`、`360-365` | 3.5.1/3.5.2 ✓ |
| 路径边界：相对路径规范化、`..`/绝对/盘符拒绝、逐段 `lstat` 拒绝 symlink、`fs.contains` 收尾 | `path-guard.ts:28-37`、`fs-service.ts:96-107` | 3.5.2 ✓ |
| 文本格式：扩展名白名单 + 前 8192 字节 NUL/控制字符探测 + UTF-8 fatal 解码；读/写 2 MiB 上限 | `content-type.ts`、`fs-service.ts:139-163` | 3.5.3 ✓（AC-11） |
| 错误码映射：`FS_STALE_VERSION`/`FS_NOT_OBSERVED` → `CONFLICT` 等 | `fs-service.ts:46-64` | 3.4 冲突分支 ✓ |
| 会话/文件唯一键：`editorStoresForSession(sessionId)`，tabs/buffers/mdModes 按会话隔离 | `client/state/session-stores.ts` | 3.1 & 3.3 ✓ |
| Dirty 派生：`content !== savedContent`；`markSaved` 推进版本 | `client/state/buffers.ts:39-59` | 3.2.3 基础 ✓ |
| 保存并发去重（`saveInFlight`）、无改动短路、提交内容快照、`Ctrl/Cmd+S` 焦点内保存 | `client/editor/EditorSurface.tsx:217-253, 337-352` | 3.2.4/3.2.6 ✓ |
| 保存成功：`markSaved` + 「已保存」状态 + 返回预览体（inline 方案，不切 Tab） | `EditorSurface.tsx:277-283`、`native-files-enhancements.tsx:397-426` | 3.2.4 ✓ |
| Skip 旧响应：已保存路径绑定（retarget 保存）、陈旧预读失败不泄漏 | `EditorSurface.tsx`、`native-files-enhancements.tsx:439-483` | 3.5.9 ✓ |
| 原生 Preview shell 保留；Markdown/Code/Plain 三体共享 inline 编辑；`.gitignore` 走纯文本 | `native-files-enhancements.tsx:332-426`、`sidebar-files-tab.ts` | UX-09 ✓ |
| 新建文件仅当父目录存在且目标不存在；成功后打开原生 Preview | `fs-service.ts:366-393`、`native-files-actions.tsx:263-267` | AC-09 ✓ |
| Quick Open 会话绑定、`path:line`、搜索预算与截断提示（不伪装零命中） | `fs-service.ts:227-267, 269-343`、`native-files-enhancements.tsx:51-127` | 4.5 部分 ✓ |
| Favorites：按工作区分区、revision fence、200/工作区与 1000/profile 上限、失效提示不自动打开替身 | `host/config.ts`、`client/favorites.ts` | 4.6 ✓ |

## 2. 需求矩阵（A01 结论）

### 2.1 已实现（无需改动，仅回归）

| 条目 | 结论 |
|---|---|
| 3.1 一文件一会话状态（sessionId + 相对路径键） | 已实现（按会话隔离；workspace 由表面隐含）。spec 的 `workspaceKey` 不单独成键——同一 session 的根在同一 fs target（`fs-service.ts:80-82`），因此会话键已隐含工作区键。 |
| 3.2.4/3.2.6 保存流程、版本推进、同 Tab 保持、⌘S | 已实现 |
| 3.2.7 默认不自动进入编辑；关闭插件后原生 Preview 可用 | 已实现 |
| 3.5 Host 全部 9 项硬约束 | 已实现（见 §1） |
| 3.7 部分门槛：写入失败/冲突/会话过期不丢草稿；文件缺失/版本改变/symlink 越界/无权限/格式不支持不写入；新建不覆盖；卸载防重复监听 | 已实现并有测试（`fs-service.test.mjs`、`editor-ui.test.mjs`、`global-replace.test.mjs`、SlotCore 测试等） |

### 2.2 缺口（本次 v0.0.4 实施）

| 编号 | spec 要求 | 现状 | 缺口 |
|---|---|---|---|
| G1 | 3.2.7 / 固定决策 2：**默认不自动保存** | ~~Monaco 失焦（`EditorSurface.tsx:398-400`）与 textarea 失焦（`586`）均自动保存~~ | **设计冲突**：移除失焦自动保存 → **已实现**（`EditorSurface.tsx` 两处失焦处理器均删除；blur 测试反转为「不写、仍编辑、状态栏显示未保存」） |
| G2 | 3.2.5 / UX-06：**Cancel/返回预览**；Clean 直接退出，Dirty 三选一（保存/放弃修改/继续编辑，默认焦点「继续编辑」） | 编辑中只有 Save；无 Cancel 入口 | 新增 Cancel（编辑器工具栏 + 原生 Preview 动作区）与 Dirty 确认面板 → **已实现**（`data-workspace-document-cancel-action` + `data-dirty-leave-dialog`，默认焦点 Keep；放弃=丢缓冲，保存=版本化写入并退出） |
| G3 | 3.4 / 5.2 流程 B / AC-07：冲突时不覆盖、草稿保留，且提供**复制草稿 / 重新加载（重读新版后重新基线）/ 手工合并入口** | `CONFLICT` 仅显示错误横幅，草稿保留但无操作 | 新增冲突横幅动作：复制草稿（剪贴板）、重新加载（确认后重读 rebase）、继续编辑 → **已实现**（含 reload 确认对话框与取消） |
| G4 | 3.2.3 / UX-03：真实 dirty 才显示未保存点/状态 | 无 dirty 指示（状态栏仅在保存动作时显示文本） | 状态栏加「未保存」指示（编辑中且 dirty） → **已实现**（`publishPreviewEditorActionState` 携带 `dirty`，状态栏 `data-editor-status` 显示 Unsaved） |
| G5 | 3.3 离开合同：关 Tab / 切 Session 不丢缓冲；异常时草稿可复制 | 草稿按会话保留（切回可恢复 ✓）；关 Tab 当前实现为自动保存+失败中止（`EditorSurface.tsx:472-480`），无三选一确认；TabStrip 在 0.0.3 生产路径未挂载（`EditorSurface` 仅以 `preview-toolbar` 使用） | ① 原生 shell 的 Tab 关闭无法可靠拦截（RC.2 无公开钩子）→ 记录限制并依托「草稿跨 Tab 关闭保留 + Cancel 三选一」满足 3.3 最低交付（**维持限制**，README/VALIDATION 已记录）；② `onClosePaths` 保持自动保存语义（非生产路径，不改） |

### 2.3 部分实现（仅记录，不在 v0.0.4 改动）

| 条目 | 说明 |
|---|---|
| 3.4 首行：Preview 态外部变更自动刷新 | RC.2 无公开文件变更事件（同 Recent 延期的依据）；记录为限制，v0.0.5 候选 |
| 3.2.2 / UX-02：进入编辑保持滚动位置 | 现仅 `path:line` 跳转锚点；滚动比例恢复列入 v0.0.5 B02 |
| 4.x（v0.0.5 全部） | 本次不实施，单独立项 |

### 2.4 非目标确认（不在本迭代做）

- 不新增观察者/文件树/第二套 Tab；不动 DSH 核心；不注册 Global Replace（`sidebar-files-tab.ts` 已确认未注册）；不加 Obsidian 能力。
- 不做 Base/Current/Draft 三方可视 Diff 组件（spec 4.x 之外；v0.0.4 以「复制草稿 + 重新加载」提供三份内容入口：草稿=编辑器缓冲、磁盘=重新加载后基线、进入编辑时原文=版本快照）。

## 3. 最小差异实现计划（v0.0.4）

全部为 Client 侧改动，不新增 RPC、不暴露新磁盘写路径：

| 步骤 | 文件 | 内容 |
|---|---|---|
| S1 | `src/client/editor/EditorSurface.tsx` | 移除 2 处失焦自动保存；新增 Cancel 流程（clean 退出 / dirty 三选一面板）、冲突横幅（复制草稿 / 重新加载 / 继续编辑）、dirty 状态栏指示、相关状态清理（切文件/退出编辑时清 conflict/confirm） |
| S2 | `src/client/state/preview-editor-actions.ts` | 发布状态扩展 `dirty` 字段（供动作区判断，原生工具栏不变） |
| S3 | `src/client/native-files-enhancements.tsx` | 编辑中动作区新增「取消」按钮 → 派发 `file-explorer:cancel-preview`；`WorkspaceDocumentBody` 监听取消事件返回预览体（`onCancelEdit`） |
| S4 | `src/client/locales.ts` | 新增：editorCancel / editorDirty / editorSaveChanges / editorDiscardChanges / editorKeepEditing / editorConflictTitle / editorCopyDraft / editorDraftCopied / editorDraftCopyFailed / editorReloadDisk / editorReloadDiscardsDraft 等（zh/en） |
| S5 | `src/client/editor/editor.module.css`、`native-files-enhancements.module.css` | 确认面板、冲突横幅、次要按钮样式（沿用宿主 token，不引入新主题层） |
| S6 | 测试 | `editor-ui.test.mjs`：改写失焦保存测试为「失焦不保存」；新增 Cancel 三选一、冲突横幅（复制/重新加载/继续编辑）、dirty 指示、剪贴板 mock。`native-files-enhancements.test.mjs`：原生动作区 Cancel、取消后回预览体、冲突保留草稿 |
| S7 | 文档 | `docs/research/v004-current-state.md`（本文件）；`VALIDATION.md`、`README.md` 补 v0.0.4 行为与限制 |

依赖顺序：S4 → S1/S5 → S3 → S6 → S7（S2 随 S1）。

## 4. A05 风险与 TOCTOU 说明（核对结论）

- 历史警告的「祖先符号链接 TOCTOU」在用户实际运行环境（installed DSH 0.2.1-rc.2 路径式 fs）**仍是文档化限制**（README §21、VALIDATION §49）：`lstat` 逐段预检查 + `fs.contains` 不构成后端级原子 no-follow 保证。本次不改动，风险表述维持现状（授权目标解析与原语由 DSH 提供；本插件无法单方面消除）。
- Host 复制检查点（v0.0.4 验证范围）：`write` 在提交前复查 lstat（symlink/目录）+ stat（存在性）+ 版本；`createFile` 复查父目录与目标存在性。测试 `fs-service.test.mjs`、`path-guard.test.mjs` 覆盖。
- 日志：Host 侧无正文/凭据记录（无 logger 写文件内容），符合 3.5.8。

## 5. 验收映射（本次交付覆盖）

AC-02 ✓（既有）、AC-03 ✓（既有，「无改动不产生写入」）、AC-04 ✓（既有）、AC-05 ◐（Cancel 三选一 + 草稿跨 Tab 保留已落地；原生 Tab 硬关闭无法弹窗已在 §2.2 记录）、AC-06 ✓（会话隔离 + retarget 守卫，既有测试）、AC-07 ✓（CONFLICT 保留草稿 + 复制草稿 / 重新加载 rebase / 继续编辑，新增 editor-ui 与 native 测试）、AC-08 ✓（既有 retarget/会话失效拒绝）、AC-09/AC-10/AC-11/AC-12 ✓（既有）。AC-01/AC-13+ 属 v0.0.5。
