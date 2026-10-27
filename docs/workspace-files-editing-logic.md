# workspace-files 插件 · 早期文件编辑设计档（历史架构参考）

> **历史架构参考，不是 0.0.3 的完整能力说明。** 本文保留早期编辑器调用链；部分文件编辑和文件创建流程已在 0.0.3 重新启用，但行号及入口装配可能与当前工作区不同。全局替换仍未注册。
>
> 当前 0.0.3 的能力和限制以 [`plugins/workspace-files/README.md`](../plugins/workspace-files/README.md) 与 [`plugins/workspace-files/VALIDATION.md`](../plugins/workspace-files/VALIDATION.md) 为准：Quick Open 星标已撤下；收藏列表只支持查看/打开/移除，新增收藏等 DSH 提供原生文件行右键 Slot 后再实现；Recent 继续延期。

## 1. 总览

`dsh-workspace-enhanced` 插件为 DSH Desktop 提供会话级（Session-scoped）工作区文件浏览与文本编辑。文件编辑功能分两层：

- **Host 侧**（Node 进程）：通过 Typert RPC 暴露 `explorerFs` 服务，负责路径防护、读/写/建文件、全工作区搜索，一切文件系统访问都经由 DSH 的 `fs` 服务与沙箱策略。
- **Client 侧**（桌面 Web 渲染）：「文件」标签页的搜索/打开/新建动作、右栏 Preview 的 Markdown/纯文本渲染、以及内嵌的编辑表面（Monaco，失败时回退 textarea）。

```
原生 Files 标签动作          右栏 Preview（只读）         编辑表面 EditorSurface
   └ 双击 / Edit 按钮 ──► requestOpenPath ──► 打开标签并加载缓冲
                                                      │
Client  ── createExplorerApi ──► ctx.remote.explorerFs ──► Typert RPC ──► Host ExplorerFsService
                                                     │
Host ── resolveScope/resolvePath（guardPath）──► DSH @deepseek-ai/dsh-fs（沙箱 + 版本守卫）
```

装配入口：`src/index.ts:11-12`（Host 注册服务）、`src/client/index.tsx:50-121`（Client 挂载 RPC 与 UI 扩展）。

## 2. RPC 契约（shared/host/client 三处定义）

方法清单及契约常量见 `src/shared/rpc-contract.ts`、`src/typert.host.ts:85-100`、`src/client/rpc.ts:110-121`：

| 方法 | 入参 | 成功返回 | 说明 |
|---|---|---|---|
| `getRoot` | 无 | `{ root }` | 取会话工作区根（`fs-service.ts:175-180`） |
| `list` | `path` | `{ entries }` | 列目录，过滤 symlink / `other`/截断（`fs-service.ts:183-210`） |
| `read` | `path` | `{ content, version }` | 读文本文件，返回观察版本（`fs-service.ts:213-215`） |
| `write` | `path, content, expectedVersion` | `{ version }` | 按版本守卫写回（`fs-service.ts:394-430`） |
| `createFile` | `path, content` | `{ path, version }` | 仅 `createIfAbsent`（`fs-service.ts:337-391`） |
| `search` | `query, options` | `{ results, truncated? }` | 全工作区文本搜索（`fs-service.ts:261-334`） |
| `quickOpen` | `query` | `{ results }` | 路径模糊打开（`fs-service.ts:218-258`） |

**输入上限**（拒绝超限请求）：

- `path` ≤ 1024 字符；`content` ≤ 2 MiB（`rpc.ts:114-119`、`typert.host.ts:87-99`）
- `query` ≤ 512（搜索）/ ≤ 256（quickOpen）；glob 过滤共 ≤ 20 个模式且总字符有上限（`fs-service.ts:267-271`，`MAX_GLOB_FILTER_CHARS` 见 `search.mts`）
- 搜索超时 10s、结果 ≤ 100、文件 ≤ 2000、行 ≤ 5000、单文件 ≤ 1 MiB、总扫描 ≤ 32 MiB（`fs-service.ts:316-324`）

**失败码**（`shared/rpc-contract.ts:15-24`）：`OUT_OF_ROOT` / `NOT_FOUND` / `IS_BINARY` / `IS_DIR` / `TOO_LARGE` / `CONFLICT` / `SANDBOX_DENIED` / `NO_SESSION` / `IO`。Host 将 DSH fs 的底层错误码映射为这些业务码（`fs-service.ts:47-59`）。

**会话绑定**：所有方法第一个参数走 Typert `workspaceFileScope` lookup（`rpc.ts:73-85`），由平台按 Session 解析；Client 的 `createExplorerApi` 支持把 API 绑定到固定 session（`boundSessionId`），防止延时保存漂移到别的会话（`rpc.ts:160-191`）。

## 3. 打开与加载

### 3.1 打开入口

- **会话中的文件链接**：`open-links.ts:34-56` 拦截 capture 阶段点击，符合路径形态（绝对路径 / `./`、`../` / 含斜杠的相对路径 / `file:` URL）的 `<a>` 在设置 `openLinksInEditor` 开启时被拦截，转成 `dsh-resource://file/session/<sessionId>/<path>` 地址交给原生右栏（`open-links.ts:39-53`）；地址编解码见 `workspace-address.ts:1-35`，只解析 `session` 作用域地址（`workspace-address.ts:38-55`）。
- **搜索/quickOpen/新建结果**：`native-files-actions.tsx` 与 `native-files-enhancements.tsx:194-199` 通过 `sidebarRight.openResource(address, { params: { line } })` 打开原生 Preview。
- **原生 Preview 进入编辑**：只读 Preview 正文双击或点 **Edit file** 按钮 → `enterEdit`（`native-files-enhancements.tsx:356-360`）→ `requestOpenPath(path, undefined, true, sessionId)`（`EditorSurface.tsx:547-551`）→ 派发 `file-explorer:open` 事件；事件带 sessionId 过滤，未挂载时暂存 `pendingOpen`，编辑器挂载后由 `takePendingOpen` 消费（`EditorSurface.tsx:158-167, 169-183, 536-544`）。Markdown 进入编辑前会强制切到 `source` 模式（`EditorSurface.tsx:123-125`）。

### 3.2 加载流程（`EditorSurface.tsx:123-156`）

1. `tabs.open(path)`：已在标签列表则仅激活（`tabs.ts:47-59`）。
2. 缓冲已存在（`buffers.get` 命中）则直接进入编辑模式，**不重新读盘**。
3. 否则走 `api.read(path)`（并发去重：`loadInFlight` Map，`EditorSurface.tsx:95, 130-154`）：
   - 失败 → 显示错误横幅并 `tabs.close(path)`；
   - 成功 → `buffers.load(path, content, version)`，`savedContent = content`，dirty 清零（`buffers.ts:33-36`）。

### 3.3 Host 读文件校验（`fs-service.ts:124-158`）

- 非文件（目录）→ `IS_DIR`；`type !== 'file'` → `IS_BINARY`（`:139-140`）。
- 大小 > 2 MiB → `TOO_LARGE`（`:141-143`）。
- 二进制探测：取前 8192 字节样本（`SAMPLE_BYTES`，`:28`），NUL 字节即判二进制；无已知扩展名时控制字符占比 > 30% 也判二进制（`content-type.ts:46-60`）。已知文本扩展名清单见 `content-type.ts:7-17`。
- UTF-8 严格解码（`fatal: true`），解码失败 → `IS_BINARY`（`:150-153`）。
- 成功返回 `{ content, version }`，`version` 取自 DSH fs 的 `info.version`（`:154`）。

## 4. 编辑状态模型

### 4.1 缓冲与脏跟踪（`client/state/buffers.ts`）

`BufferEntry = { path, content, savedContent, version }`（`:5-10`）。

- `load`：读盘成功时整体替换，dirty 清零（`:33-36`）。
- `setContent`：只有内容真正变化才写 Map 并通知（`:39-45`）。
- `isDirty = content !== savedContent`（`:55-59`）。
- `markSaved`：写成功后把 `savedContent` 推进到提交的内容、version 换成磁盘新版本（`:48-53`）。
- `drop` / `rename`：关标签 / 重命名时同步（`:61-73`）。

### 4.2 标签与模式

- `TabsStore`（`client/state/tabs.ts`）：打开/激活/关闭（关闭后激活右邻，无则左邻，再空）；`getSnapshot` 返回稳定引用以配合 `useSyncExternalStore`（`:20, 34-37`）。重命名沿用 `tabs.rename`（`:87-93`）。
- `MdModeStore`（`client/state/md-mode.ts`）：每路径的 `source | preview`；`.md`/`.markdown` 才参与（`:9-12`）。
- **按会话隔离**：`editorStoresForSession`（`client/state/session-stores.ts:14-20`）以 sessionId 为键缓存 `{ tabs, buffers, mdModes }`，不同会话的打开标签与未保存草稿互不串扰。

### 4.3 编辑器实例

- 首选 Monaco（jsDelivr CDN 0.52.2 加载，12s 超时，见 `editor/monaco-loader.ts:42-103`）；加载失败回退 `<textarea>`（`EditorSurface.tsx:510-523`）。
- 语言映射按扩展名（`monaco-loader.ts:106-119`）；主题跟随 Desktop `color-scheme`，否则按 body 背景亮度推断（`EditorSurface.tsx:36-50, 114-121`）。
- 内容双向同步：Monaco `onDidChangeModelContent` → `buffers.setContent`；外部缓冲变化 → 置 `applyingExternal` 标志后 `setValue` 回填，防止回环（`EditorSurface.tsx:336-339, 369-379`）。
- **只读↔编辑**：默认 `readOnly: true`（浏览态），进入编辑模式 `updateOptions({ readOnly: false })`（`:329, 365-367, 426-441`）；「保存」按钮 = 保存并退出编辑模式（`saveAndExit`，`:245-248, 442-451`）。

## 5. 保存逻辑

### 5.1 Client 保存（`EditorSurface.tsx:185-221`）

1. **并发去重**：同路径进行中的保存共用同一 Promise（`saveInFlight`，`:186-187`）。
2. **无改动短路**：`content === savedContent` 直接返回 true，不发 RPC（`:190`）。
3. 提交时**快照内容** `submittedContent = entry.content`（防止保存期间继续输入造成不一致）。
4. `api.write(path, submittedContent, entry.version)` —— 携带**读取时的观察版本**。
5. 失败：`CONFLICT` 显示冲突提示（`editorConflict`，`:199`），**缓冲保留**，用户可改后重试；其他错误显示错误消息。
6. 成功：`buffers.markSaved(path, submittedContent, result.value.version)`，状态栏短暂显示「已保存」（`:203-206, 465-467`）。

### 5.2 触发时机

- 工具栏「保存」按钮（编辑模式下）→ `saveAndExit`（`EditorSurface.tsx:245-248`）。
- 快捷键 **Ctrl/Cmd+S**（仅焦点在编辑器内时，`:279-294`）。
- Monaco **失焦** `onDidBlurEditorWidget`（`:340-342`）与 textarea `onBlur`（`:519`）——失焦即自动保存。
- **关闭脏标签**：`onClosePaths` 逐个保存脏缓冲，任何保存失败或仍脏则**中止关闭**（`:400-408`）。

### 5.3 Host 写（`fs-service.ts:394-430`）

1. `expectedVersion` 非空校验（`:402-404`）；内容 ≤ 2 MiB（`:405-407`）。
2. 需要**存活会话的沙箱策略**与 `fs.sandboxMode`，否则 `NO_SESSION` / `SANDBOX_DENIED`（`:410-415`）——即不能对冷会话或非沙箱文件系统写文件。
3. 目标校验：symlink 拒绝；目录拒绝 `IS_DIR`；文件消失 → `CONFLICT`（`:417-423`）。
4. 写意图 `{ kind: 'replaceIfVersion', version: FsVersion(expectedVersion) }`（`:424`）交给 `fs.writeText`。磁盘版本与观察版本不一致时 DSH fs 报 `FS_STALE_VERSION` / `FS_NOT_OBSERVED`，映射为 `CONFLICT`（`fs-service.ts:52-53`）——**乐观并发控制**，避免覆盖他人的修改。

### 5.4 创建文件

- `CreateFileDialog`（`explorer/CreateFileDialog.tsx:20-38`）→ `api.createFile(path, '')`。
- Host（`fs-service.ts:337-391`）：路径非空、无 NUL；父目录必须存在；目标已存在 → `CONFLICT`；写意图 `createIfAbsent`，绝不覆盖已有文件（`:380-386`）；同样要求存活会话策略 + 沙箱（`:360-365`）。
- 成功后 `sidebarRight.openResource` 打开新文件（`native-files-actions.tsx:263-267`）。

## 6. 查找、搜索与全局替换

### 6.1 编辑器内查找（`EditorSurface.tsx:250-277, 472-501`）

- 只对活动标签当前缓冲做**字面量**子串匹配，上限 10000 处（`editor/find.ts:1-17`）；支持大小写切换、↑/↓ 循环跳转、Enter/Shift+Enter；跳转时若在 preview 模式先切回 source。
- Monaco 用 `setSelection + revealRangeInCenter` 定位；textarea 用 `setSelectionRange`（`EditorSurface.tsx:52-64, 267-276`）。

### 6.2 工作区搜索 / Quick Open

- 搜索弹窗（`native-files-enhancements.tsx:46-228`）：180ms 防抖 + AbortController 取消；命中项 `openResource(fileAddressFor(...), { line })` 跳到行。
- 早期实现的 Quick Open（`native-files-actions.tsx` 历史快照）支持 `路径:行号` 后缀，也曾在空查询时展示最近 50 个标签。0.0.3 已移除 Recent 回退：空查询提示用户输入路径；Recent 仍按 [`VALIDATION.md`](../plugins/workspace-files/VALIDATION.md#L20) 延期。

### 6.3 全局替换（preview/confirm 流，`explorer/replace-preview.ts`）

**预览阶段（零写入）** `createReplacementPreview`（`:94-154`）：

- 大小写敏感、字面量、单行匹配（`:103-106`）；搜索结果被截断或打满 100 条 → 拒绝（`:108-110`）。
- 涉及文件 > 50 个 → 拒绝（`:112-115`）；扫描/输出总字节 > 16 MiB → 拒绝（`:127-142`）；单文件输出 > 2 MiB → 拒绝（`:134-138`）。
- 任一目标文件存在**脏缓冲** → 拒绝（`:122-124`）。
- 每个文件捕获 `read` 时的版本与替换前后内容（`:125-152`）。

**应用阶段** `applyReplacementPreview`（`:157-192`）：

- 开始前再查一次脏缓冲（`:162-165`）。
- 逐文件 `api.write(path, after, 预览时版本)`，**不用最新版本重读**；写失败（含版本冲突）记入该文件结果，继续处理其余文件 → **部分成功**语义（`:168-190`）。
- 写成功后：缓冲仍脏（用户在替换期间又改了）→ 仅 `markSaved` 推进版本、保留更新草稿；否则 `buffers.load` 替换为写入内容（`:179-186`）。
- 对话框 UI 与确认流见 `explorer/GlobalReplaceDialog.tsx`（预览摘要、前后 diff excerpt、结果播报）。

## 7. 路径与安全防线（Host，`host/path-guard.ts` + `host/fs-service.ts`）

1. **作用域校验** `resolveScope`（`fs-service.ts:61-82`）：`workspaceFileScope` 必须携带非空 sessionId + workspaceRoot；有存活会话时，解析后的根必须与 `session.header.cwd`（或策略 `workspaceRoot`）是**同一 fs target**（比较 `targetKey`），否则 `OUT_OF_ROOT` / `NO_SESSION`。
2. **相对路径规范化** `normalizeRelativeInput`（`path-guard.ts:28-37`）：拒绝绝对路径、`..` 逃逸、> 1024 字符；`\` 归一为 `/`。
3. **逐段 symlink 检查** `resolvePath`（`fs-service.ts:84-117`）：从根开始逐段 `lstat`，任何一段是 symlink 即拒绝；最终 `fs.resolve` 后必须 `fs.contains(root, target)`。
4. **通用守卫** `guardPath`（`path-guard.ts:46-90`）：`resolve(root, rel)` 后必须在根内，并提供可选 realpath 二次校验；当前 Host 的 `resolvePath` 调用未传 realpath 回调（`fs-service.ts:87-103`），因此不能声称有父目录 realpath 兜底。路径校验与后续操作之间的 TOCTOU 限制见当前 README。
5. **失败关闭**：无存活会话策略 / 无沙箱 fs 时，写、建一律拒绝（`fs-service.ts:360-365, 410-415`）。

**上限汇总**：读/写/建单文件 ≤ 2 MiB；列目录 ≤ 1000 条且截断即整单失败（`fs-service.ts:190-192`）。

**已知限制**（见插件 `README.md`「Security limitation」）：当前 DSH fs 契约对读取与基于路径的写入不保证原子 no-follow 隔离，路径校验与操作之间存在并发 symlink 交换的理论窗口；`createIfAbsent` 只防最终目标被覆盖、不钉住父目录遍历。仅建议在可信、无并发改动的 workspace 使用。

## 8. 典型时序

**打开并编辑**

```
双击 Preview / Edit 按钮
  → requestOpenPath(path, edit=true)        EditorSurface.tsx:547-551
  → tabs.open(path)                          tabs.ts:47-59
  → api.read(path)                           fs-service.ts:213-215
      → guardPath + symlink 逐段检查 + 二进制/大小/UTF-8 校验
  → buffers.load(content, version)           buffers.ts:33-36
  → 编辑模式 readOnly=false                   EditorSurface.tsx:426-441
```

**保存**

```
Ctrl/Cmd+S / Save 按钮 / 失焦
  → savePath(path)                           EditorSurface.tsx:185-221
  → api.write(path, content, expectedVersion) fs-service.ts:394-430
      → replaceIfVersion(版本守卫) → 冲突 = CONFLICT（缓冲保留）
  → buffers.markSaved(content, newVersion)   buffers.ts:48-53
```

**关闭脏标签**

```
关闭标签 → onClosePaths                        EditorSurface.tsx:400-408
  → 逐标签 savePath：失败或仍脏 → 中止关闭
  → 全部成功 → tabs.close + buffers.drop + mdModes.drop
```

## 9. 相关测试

- 编辑器 UI/交互：`test/editor-ui.test.mjs`（打开、保存快捷键、失焦保存、冲突提示等）
- 缓冲/标签/模式状态：`test/editor-state.test.mjs`
- 全局替换：`test/global-replace.test.mjs`
- RPC 会话绑定：`test/rpc-session.test.mjs`
- 路径守卫：`test/path-guard.test.mjs`；文件系统服务：`test/fs-service.test.mjs`
- 原生 Files 增强（搜索/quickOpen/编辑入口）：`test/native-files-enhancements.test.mjs`

> 本文档描述最初编写时的历史实现快照；不要用它推断当前 0.0.3 页面是否实际调用这些编辑接口。源码路径行号按该历史快照整理，当前行为请查阅上方 README / VALIDATION。
