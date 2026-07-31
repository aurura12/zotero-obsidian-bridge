核心基于 Zotero integration 的 import format。

这里使用了一个叫 Paper Note 的自定义工具。它会调用这里的 [paper-note-template.md](paper-note-template.md)。

在 Zotero Integration 中推荐这样配置：

- `Name`：`Paper Note`
- `Output path`：`ZoteroLib/{{citekey}}.md`

其中 `Paper Note` 需要和 Obsidian 端插件默认 format 名完全一致；`ZoteroLib` 是 Obsidian vault 内的文件夹名。它必须和 Zotero 端插件配置中的 `folder: "ZoteroLib"` 对应；Obsidian vault 名则必须和 Zotero 端插件配置中的 `vaultName: "ObsidianVault"` 对应。

接下来我会在里面增加版本号。然后调用zotero integration的时候模板里面做一些检查

- 版本的兼容
- 不要删去我的已有笔记
