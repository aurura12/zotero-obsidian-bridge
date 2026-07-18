# Zotero Obsidian Bridge

这是一个面向个人文献工作流的小型开源项目：用一对插件把 Zotero 和 Obsidian 通过 citekey 接起来。

项目包含两个一起维护、一起发版的插件：

- **Zotero Citekey Bridge**：Zotero 7+ 插件。它从 Zotero 条目读取 citation key，调用 Obsidian URL，并把 Obsidian 笔记链接写回 Zotero 条目的 `Extra` 字段。
- **Citekey Import Bridge**：Obsidian 桌面端插件。它接收 `obsidian://zotero-note?citekey=...`，再调用 Zotero Integration 的导入流程创建文献笔记。

## 依赖

- Zotero 7 或更新版本。
- Better BibTeX for Zotero；如果你的 Zotero 已提供原生 `citationKey` 字段，也可以由插件优先读取原生字段。
- Obsidian 桌面版。
- Obsidian 的 Zotero Integration 插件，插件 ID 为 `obsidian-zotero-desktop-connector`。
- 一个名为 `Paper Note` 的 Zotero Integration import format；也可以在 URL 里传入 `format` 参数覆盖默认值。

## 工作流

1. 在 Zotero 中选择一条普通文献条目。
2. 右键选择 `创建并关联 Obsidian 笔记`。
3. Zotero 端读取 citekey，并打开 `obsidian://zotero-note?citekey=<citekey>`。
4. Obsidian 端接收 citekey，调用 Zotero Integration 的 `runImport(format, citekey, library)`。
5. Zotero 端在该条目的 `Extra` 中写入 `Obsidian Link:`，之后可以直接从 Zotero 打开对应笔记。

## Zotero 右键菜单

- `创建并关联 Obsidian 笔记`：创建笔记并写回链接；如果已经存在 `Obsidian Link:`，会停止以避免重复创建。
- `调试：删除 Obsidian 跳转链接`：只删除插件写入的 `Obsidian Link:` 行，不影响其他 `Extra` 内容。
- `打开 Obsidian 笔记`：读取保存的链接并交给系统打开。

## 默认配置

Zotero 端默认配置在 [plugins/zotero/obsidian-zotero-link.js](plugins/zotero/obsidian-zotero-link.js) 顶部：

```js
config: Object.freeze({
  vaultName: "ObsidianVault",
  folder: "ZoteroLib",
  extraLabel: "Obsidian Link",
  createBaseURL: "obsidian://zotero-note"
})
```

Obsidian 端默认 import format 是 `Paper Note`，默认 library 是 `1`。可以通过 URL 覆盖：

```text
obsidian://zotero-note?citekey=smithExample2026&format=Paper%20Note&library=1
```

## 目录结构

```text
plugins/
  zotero/      Zotero Citekey Bridge 源码
  obsidian/    Citekey Import Bridge 源码
docs/zh/       开发笔记和 Zotero Integration 模板
scripts/       发版脚本
release/       生成的发布文件，已加入 .gitignore
```

## 打包与发版

如果安装了 Make：

```sh
make release VERSION=0.1.0 GITHUB_REPO=YuxuanQi/zotero-obsidian-bridge
```

如果没有 Make：

```sh
node scripts/release.mjs --version 0.1.0
```

脚本会同步更新：

- [package.json](package.json)
- [plugins/zotero/manifest.json](plugins/zotero/manifest.json)
- [plugins/obsidian/manifest.json](plugins/obsidian/manifest.json)
- [plugins/obsidian/versions.json](plugins/obsidian/versions.json)

并输出：

- `release/<version>/zotero/zotero-citekey-bridge-<version>.xpi`
- `release/<version>/zotero/zotero-updates.json`
- `release/<version>/obsidian/main.js`
- `release/<version>/obsidian/manifest.json`
- `release/<version>/obsidian/versions.json`
- `release/<version>/obsidian/citekey-import-bridge-<version>.zip`

GitHub Release 中，Zotero 端上传 `.xpi` 和 `zotero-updates.json`；Obsidian 端上传 `main.js`、`manifest.json`，也可以附带 `versions.json` 和 zip 方便手动安装。

## 说明

Obsidian 端插件 ID 保留为 `citekey-import-bridge`，因为当前 Obsidian 社区插件提交规则要求 `id` 不能包含 `obsidian`。

`Citekey Import Bridge` 调用了 Zotero Integration 的 `runImport()` 方法。这个方法很适合当前工作流，但不是正式稳定 API；如果 Zotero Integration 之后改动内部接口，可能需要做一次很小的兼容更新。

## 许可证

MIT
