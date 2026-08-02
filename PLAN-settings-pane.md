# 给 Zotero 插件添加可配置设置面板

## 目标

让用户在 Zotero 内（编辑 → 设置 → Zotero Citekey Bridge）直接修改 `vaultName`、`folder`、`extraLabel`，不再需要改代码 + 重新打包安装。

## 已确认的决策

- 默认值保留用户当前配置（`论文` / `maic`）
- `vaultName`、`folder`、`extraLabel` 三个都可配置
- 版本号升到 `0.2.0`

## 背景

当前 `plugins/zotero/obsidian-zotero-link.js` 顶部有 `config: Object.freeze({...})` 硬编码配置，6 处 `this.config.xxx` 引用。Zotero 7 提供 `Zotero.PreferencePanes.register()` + `preferences.xhtml` + `prefs.js` + `Zotero.Prefs.get(name, true)` 机制（已通过 make-it-red 官方示例和 zotero-plugin-dev 文档确认）。

## 改动清单

### 1. 新增 `plugins/zotero/prefs.js`
默认偏好值（保留用户当前配置 论文/maic）：
```js
pref("extensions.zotero-citekey-bridge.vaultName", "论文");
pref("extensions.zotero-citekey-bridge.folder", "maic");
pref("extensions.zotero-citekey-bridge.extraLabel", "Obsidian Link");
```

### 2. 新增 `plugins/zotero/preferences.xhtml`
设置面板，三个输入框，用 `preference="extensions.zotero-citekey-bridge.<key>"` 直接绑定：
- vaultName（Vault 名称）
- folder（笔记文件夹）
- extraLabel（Extra 标签名）

### 3. 修改 `plugins/zotero/bootstrap.js`
在 `startup()` 中注册面板：
```js
Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + "preferences.xhtml"
});
```

### 4. 修改 `plugins/zotero/obsidian-zotero-link.js`
- `config` 对象保留作为 fallback 默认值（不再 `Object.freeze` 也可，保留无妨）
- 新增 `getConfigValue(name)` 方法：`Zotero.Prefs.get("extensions.zotero-citekey-bridge." + name, true)`，取到空值/异常时回退到 `this.config[name]`
- 替换全部 6 处引用：
  - L349 `this.config.createBaseURL`
  - L354 `this.config.folder`
  - L357 `this.config.vaultName`
  - L366 / L385 / L391 `this.config.extraLabel`
  - 注意：`buildOpenURL` 中 `this.config.vaultName` 和 `this.config.folder` 在模板字符串拼接处
- `createBaseURL` 不放进设置面板（Obsidian 端协议处理器固定为 `obsidian://zotero-note`），保持默认值

### 5. 修改 `scripts/release.mjs`
`packageRelease()` 的 `zoteroFiles` 数组加入：
- `"plugins/zotero/prefs.js"`
- `"plugins/zotero/preferences.xhtml"`

### 6. 打包
```bash
.\scripts\package-zotero.ps1 -Version 0.2.0
```
（release.mjs 的 syncVersions 会自动把 package.json / 两个 manifest 同步到 0.2.0）

### 7. 可选：更新 `README.zh-CN.md`
"默认配置" 小节改为说明"配置现在在 Zotero 设置面板中修改"，并指出旧位置的 fallback 值。

## 验证

1. 打包产物 `release/0.2.0/zotero/zotero-citekey-bridge-0.2.0.xpi` 内含 `prefs.js` 和 `preferences.xhtml`
2. 在 Zotero 中安装后，编辑 → 设置 → Zotero Citekey Bridge 应出现三个输入框
3. 修改 vaultName/folder 后右键创建笔记，Extra 字段写入的链接应使用新值
4. 升级场景：已安装 0.1.1 直接覆盖安装 0.2.0，因 getConfigValue 有 fallback 不会报错
