# zotero-obsidian-bridge 项目状态总结

> 最后更新：2026-08-02

## 一、项目简介

这是一个面向个人文献工作流的小型开源项目，用一对插件把 **Zotero** 和 **Obsidian** 通过 citekey（引用键）连接起来：

- **Zotero Citekey Bridge**（Zotero 7+ 插件）：从 Zotero 条目读取 citation key，调用 `obsidian://` URL，并把 Obsidian 笔记链接写回 Zotero 条目的 `Extra` 字段。
- **Citekey Import Bridge**（Obsidian 桌面端插件）：接收 `obsidian://zotero-note?citekey=...`，调用 Zotero Integration 插件的 `runImport(format, citekey, library)` 创建文献笔记。

核心工作流：
1. 在 Zotero 中选择文献 → 右键「创建并关联 Obsidian 笔记」
2. Zotero 端读取 citekey → 打开 `obsidian://zotero-note?citekey=<citekey>`
3. Obsidian 端接收 citekey → 调 Zotero Integration 导入生成笔记
4. Zotero 端在 `Extra` 写入 `Obsidian Link: obsidian://open?vault=...&file=...`，之后可直接从 Zotero 打开笔记

相关文件：
- Zotero 插件：`plugins/zotero/`（`obsidian-zotero-link.js`、`bootstrap.js`、`manifest.json`、`prefs.js`、`preferences.xhtml`）
- Obsidian 插件：`plugins/obsidian/`（`main.js`、`manifest.json`、`versions.json`）
- 打包脚本：`scripts/release.mjs`、`scripts/package-zotero.ps1`
- 使用说明：`START.md`

## 二、历史目标与进展

### 目标 1：让 Zotero 插件配置可改（免重新打包）

**需求**：最初 `vaultName`、`folder` 等配置硬编码在 `plugins/zotero/obsidian-zotero-link.js` 顶部的 `config: Object.freeze({...})` 里。每次换 Obsidian 仓库/文件夹都要改代码 → 重新打包 → 重新安装，非常麻烦。

**方案**：给 Zotero 插件添加**设置面板**（编辑 → 设置 → Zotero Citekey Bridge），用 Zotero 7 的 `Zotero.PreferencePanes.register()` + `preferences.xhtml` + `prefs.js` 机制，运行时用 `Zotero.Prefs.get(name, true)` 动态读取配置。

**已确认的决策**（用户拍板）：
- 默认值保留用户当前配置：`vaultName='论文'`，`folder='maic'`，`extraLabel='Obsidian Link'`
- `vaultName`、`folder`、`extraLabel` 三个都可配置
- `createBaseURL` 不进设置面板（Obsidian 端协议固定为 `obsidian://zotero-note`）
- 版本号升到 `0.2.0`

**实现状态**：✅ 已完成（见第三节）

### 目标 2：不同 Zotero 分组 → 不同 Obsidian 仓库/文件夹

**需求**：Zotero 里不同分组（collection）的文献，希望笔记创建到**不同的 Obsidian 仓库（vault）和文件夹**。

**可行性调研结论**（重要）：
- Obsidian 的 `obsidian://` URI 支持 `vault=<仓库名>` 参数，Obsidian 会**按 vault 参数路由**到对应仓库的窗口实例执行，而不是当前活跃窗口。`registerObsidianProtocolHandler` 回调收到的 `params.vault` 可读到。
- 目标 vault 未打开时会静默打开该仓库，再把 URI 派发过去；已打开则聚焦其窗口。
- ⚠️ **Obsidian 1.13.0（2026-05-28）起**：外部程序触发 `obsidian://` URI 会**先弹出确认对话框**，选「不再询问」后加入白名单。这会影响从 Zotero 触发的首次调用体验。

**用户已确认的设计**：
- 映射来源：设置面板维护 JSON 映射表（如 `{"论文组": {"vault": "论文", "folder": "maic"}}`）
- 条目同时属于多个分组时：**每次弹窗让用户选择**用哪个分组的配置
- 映射表存放：在 Zotero 设置页面里维护（可视化编辑，不手写 JSON 文件）

**实现状态**：⏳ 尚未实现（仅完成调研，等待本轮 bug 解决后实施）

### 目标 3：Git 仓库管理（fork + upstream）

**需求**：用户 fork 了自己的仓库，需要正确的 remote 配置。

**实现状态**：✅ 已完成
- `origin` → `git@github.com:aurura12/zotero-obsidian-bridge.git`（用户 fork）
- `upstream` → `git@github.com:KeiYuHin/zotero-obsidian-bridge.git`（原仓库）
- 已同步上游最新代码到本地（`3aacbf0` Document update about path matching）
- 已提交本地改动并推送到 fork（`8a252ec`）

### 目标 4：一键打包脚本

**需求**：在 PowerShell 里方便地重新打包 Zotero 插件。

**实现状态**：✅ 已完成
- `scripts/package-zotero.ps1`：运行 `.\scripts\package-zotero.ps1 [-Version x.y.z]` 即可打包
- `START.md`：根目录的使用说明文档

## 三、已实现的部分（详细）

### 3.1 设置面板功能（0.2.0）

改动清单：

| 文件 | 操作 | 内容 |
|---|---|---|
| `plugins/zotero/prefs.js` | 新增 | 默认偏好：`vaultName='论文'`、`folder='maic'`、`extraLabel='Obsidian Link'` |
| `plugins/zotero/preferences.xhtml` | 新增 | 设置面板界面，3 个输入框，用 `preference="extensions.zotero-citekey-bridge.<key>"` 绑定 |
| `plugins/zotero/bootstrap.js` | 修改 | `startup()` 中调用 `Zotero.PreferencePanes.register({pluginID: id, src: rootURI + "preferences.xhtml"})` |
| `plugins/zotero/obsidian-zotero-link.js` | 修改 | 新增 `getConfigValue(name)` 方法；替换全部 6 处 `this.config.xxx` 引用 |
| `scripts/release.mjs` | 修改 | `zoteroFiles` 数组加入 `prefs.js` 和 `preferences.xhtml` |
| 三个 manifest / package.json | 修改 | 版本号全部同步为 `0.2.0` |

**`getConfigValue` 实现要点**：
```js
getConfigValue(name) {
    try {
        const value = Zotero.Prefs.get(
            `extensions.zotero-citekey-bridge.${name}`,
            true   // global=true，避免自动加 "extensions.zotero." 前缀
        );
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    } catch (error) {
        Zotero.debug(...);
    }
    return this.config[name];  // fallback 到硬编码默认值
}
```

被替换的 6 处引用：
- `buildCreateURL`：`this.config.createBaseURL` → `this.getConfigValue('createBaseURL')`
- `buildOpenURL`：`this.config.folder`、`this.config.vaultName`
- `getStoredLink`：`this.config.extraLabel`
- `setStoredLink`：`this.config.extraLabel`
- `removeLinkLines`：`this.config.extraLabel`

### 3.2 右键菜单去重（幂等修复）

**问题**：用户「remove 旧版 → 重装新版」后，右键菜单出现重复的插件菜单项。

**原因**：`addToWindow` 的防重复检查基于窗口对象引用（`this.windows.has(win)`），新旧插件实例各自维护独立的 `windows` Map，旧实例残留的菜单项没清掉，新实例又加一份 → 重复。

**修复**：`addToWindow` 开头按固定 ID 清理残留菜单项（幂等）：
```js
for (const element of popup.querySelectorAll(
    `#${this.MENU_PREFIX}-separator, #${this.MENU_PREFIX}-create, ` +
    `#${this.MENU_PREFIX}-delete, #${this.MENU_PREFIX}-open`
)) {
    element.remove();
}
```

**实现状态**：✅ 代码已改，已重新打包 0.2.0（但当前存在新问题，见第四节）

### 3.3 打包产物

- `release/0.2.0/zotero/zotero-citekey-bridge-0.2.0.xpi`（内含 6 个文件：manifest.json、bootstrap.js、obsidian-zotero-link.js、prefs.js、preferences.xhtml、LICENSE）
- `release/0.2.0/zotero/zotero-updates.json`

## 四、当前遇到的问题（重点）

### 问题 A：Obsidian 提示「无法识别」（未解决 🔴）

**现象**：用户安装新版 0.2.0 Zotero 插件后，在 Zotero 里右键创建笔记，Zotero 端显示「已创建并关联 Obsidian 笔记」（通知正常弹出），但 Obsidian 端提示「无法识别」之类。

**用户的判断**：Obsidian 端配置一直没改过，只换了新的 Zotero 插件，所以怀疑是 Zotero 端发出的请求有问题。

**技术分析（待验证）**：
1. Zotero 端 `createAndLink` 流程：`getCitationKey` → `buildCreateURL(citekey)` → `launchObsidianURL(createURL)` → `setStoredLink` → `notify`。通知能弹出说明前面步骤都成功了，URL 已发给系统协议处理器。
2. `buildCreateURL` 生成 `obsidian://zotero-note?citekey=<citekey>`（`createBaseURL` 走 `getConfigValue` fallback）。
3. ⚠️ 疑点：`prefs.js` 里**没有定义 `createBaseURL` 偏好**。`Zotero.Prefs.get('extensions.zotero-citekey-bridge.createBaseURL', true)` 对不存在的偏好——按 Zotero 源码行为应返回 `undefined` 而不抛异常，fallback 应能生效返回 `obsidian://zotero-note`。**但这是推测，需要实际验证**。
4. Obsidian 端可能的原因：
   - Obsidian 第三方插件列表里 `Citekey Import Bridge` 未启用/未安装
   - ⚠️ Obsidian 1.13.0+ 外部 URI 确认对话框：首次从 Zotero 触发 `obsidian://` 会弹确认框，若被忽略/拒绝，Obsidian 会显示无法识别
   - Obsidian 端 `runImport` 执行失败（如 import format 不存在、Zotero Integration 未装）

**待办**：
- [ ] 确认 Obsidian 显示的确切错误文字（`Reference import failed: ...`？系统「没有应用可处理 obsidian://」？还是「无法识别」字样？）
- [ ] 确认 Obsidian 第三方插件列表里 `Citekey Import Bridge` 是否已启用
- [ ] 确认 Zotero 端实际发出的 URL 内容（可临时在 `launchObsidianURL` 加 `Zotero.debug` 打印 URL）
- [ ] 确认 Obsidian 版本是否 ≥ 1.13.0，URI 确认对话框是否已允许

### 问题 B：打开笔记提示「未找到文件」（已定位原因，未解决 ⚠️）

**现象**：之前测试时，从 Zotero 打开笔记，Obsidian 提示找不到 `maic/zhangSimulatingClassroomEducation 2025`。

**原因**：bridge 插件写回的打开链接按 **citekey** 构造文件名（`obsidian://open?vault=论文&file=maic/<citekey>`），但用户把 Zotero Integration 的 Import Format 里 **File Name** 设成了 `{{title}}`，实际创建的文件名是论文标题 → 文件名对不上。

**解决方案**（二选一）：
- 方案 A（推荐）：Zotero Integration 设置里把 File Name 改回 `{{citekey}}`，文件名与 citekey 一致，bridge 链接即可命中。
- 方案 B：改 bridge 的 `buildOpenURL` 用标题打开（不推荐，插件只知道 citekey 不知道标题）。

**注意**：这个问题与问题 A 不同，问题 A 是「创建」阶段 Obsidian 无法识别，问题 B 是「打开」阶段找不到文件。

## 五、相关技术参考

### Zotero 7 插件设置面板机制
- 注册：`Zotero.PreferencePanes.register({ pluginID, src: rootURI + 'preferences.xhtml' })`
- 默认偏好：插件根目录 `prefs.js`，格式 `pref("extensions.<插件名>.<key>", 默认值)`
- 读取：`Zotero.Prefs.get("extensions.<插件名>.<key>", true)`，第二个参数 `true` = 完整键名（不加 `extensions.zotero.` 前缀）
- 写入：`Zotero.Prefs.set(key, value, true)`
- 面板格式：XHTML 片段（无 `<!DOCTYPE>`，默认命名空间 XUL，HTML 标签用 `html:` 前缀），表单控件用 `preference="完整偏好键"` 属性绑定
- 参考：Zotero 官方 make-it-red 示例插件、zotero-plugin-dev 文档、windingwind 的 doc-for-zotero-plugin-dev

### Zotero.Prefs.get 源码行为（已查证）
```js
function get(pref, global) {
    pref = global ? pref : "extensions.zotero." + pref;
    // 按 pref 类型分支：PREF_BOOL / PREF_STRING / PREF_INT
    // 若类型不匹配任何 case，value 保持 undefined 并返回 undefined
}
```
→ 对不存在的偏好返回 `undefined`（不抛异常），所以 `getConfigValue` 的 fallback 理论上有效。

### Obsidian URI 路由（已查证）
- `obsidian://open?vault=<仓库名>&file=<路径>`：带 `vault` 参数会路由到对应仓库窗口，未打开则静默打开。
- 自定义协议 handler（`registerObsidianProtocolHandler`）同样支持 `vault` 参数路由，`params.vault` 可读。
- Obsidian 1.13.0+：外部触发 `obsidian://` URI 会弹确认对话框。

## 六、后续待办（按优先级）

1. **🔴 解决问题 A**：确认 Obsidian 端确切报错 → 定位是 Zotero URL 问题还是 Obsidian 接收问题
2. **⚠️ 解决问题 B**：确认用户是否已将 Zotero Integration 的 File Name 改回 `{{citekey}}`
3. **⏳ 实现目标 2**：分组 → (vault, folder) 映射功能
   - Zotero 端：`getGroupMapping()` 解析设置面板里的 JSON 映射表
   - 创建时根据条目所属分组解析目标 vault/folder，`buildCreateURL` / `buildOpenURL` 带上 `vault` 参数
   - 多分组归属时弹窗让用户选择（可用 `Services.prompt.select`）
   - Obsidian 端：利用 URI 的 `vault` 参数自动路由，`main.js` 可能无需改动
4. **验证**：确保 `createBaseURL` 的 pref fallback 在真实 Zotero 里生效
