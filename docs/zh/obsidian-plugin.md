Version: 0.1.0

管理的文件在
ObsidianVault\.obsidian\plugins\citekey-import-bridge
下。里面有两个文件：

# main.js

接口格式为：

```
obsidian://zotero-note?citekey=[citekey]
```

例子：

```
obsidian://zotero-note?citekey=panditFrequencySupportElectric2025
```

1. **Registers a custom protocol handler** for `zotero-note://` URLs
    
2. **Extracts parameters** from the URL: citekey, format, and library number
    
3. **Validates the citekey** (removes @ prefix if present)
    
4. **Finds the Zotero Integration plugin** in Obsidian
    
5. **Calls the Zotero Integration's import function** with the extracted parameters
    
6. **Shows success/failure notifications** to the user

依赖 [Zotero Integration](https://community.obsidian.md/plugins/obsidian-zotero-desktop-connector) 中的 runImport `zoteroIntegration.runImport()`。它并不是一个稳定发布的API。但是调用的是zotero integration，我这里自己创建了一个叫做 Paper Note 的 Import format。

安装依赖时，小白可以先按 Obsidian 官方 [Community plugins](https://obsidian.md/help/community-plugins) 文档打开社区插件，再搜索安装 Zotero Integration。Zotero 侧需要先装好 [Better BibTeX](https://retorque.re/zotero-better-bibtex/installation/)，因为 Zotero Integration 本身也要求 Better BibTeX。

## Obsidian 端必须配置的地方

这里的 `ObsidianVault` 是 Obsidian vault 名，不是 GitHub 仓库名。默认配置假设：

- Obsidian vault 名为 `ObsidianVault`。
- vault 内有一个文件夹 `ZoteroLib`。
- Zotero Integration 中有一个 import format，`Name` 为 `Paper Note`。
- 这个 import format 的 `Output path` 为 `ZoteroLib/{{citekey}}.md`。

`Paper Note` 是插件默认调用的 format 名，需要完全一致。如果你把它命名成别的，需要修改 Obsidian 端插件里的默认 format，或在 URL 中传入 `format=...`。

Zotero 端插件会把打开链接保存为：

```text
obsidian://open?vault=ObsidianVault&file=ZoteroLib%2F[citekey]&paneType=tab
```

因此 Zotero 端 `config.vaultName`、`config.folder` 必须和 Obsidian 端的 vault 名、输出文件夹保持一致。

这样能在zotero integration中测试好，使用这个东西来外部调用，而跳过zotero integration的UI打断。

```
const { Notice, Plugin } = require("obsidian");

module.exports = class CitekeyImportBridge extends Plugin {
  onload() {
    this.registerObsidianProtocolHandler(
      "zotero-note",
      async (params) => {
        const citekey = String(params.citekey || "")
          .trim()
          .replace(/^@/, "");

        const format = String(params.format || "Paper Note").trim();

        const parsedLibrary = Number(params.library || 1);
        const library = Number.isFinite(parsedLibrary)
          ? parsedLibrary
          : 1;

        if (!citekey) {
          new Notice("Missing citekey parameter");
          return;
        }

        try {
          const pluginManager = this.app.plugins;

          const zoteroIntegration =
            pluginManager.getPlugin?.(
              "obsidian-zotero-desktop-connector"
            ) ||
            pluginManager.plugins?.[
              "obsidian-zotero-desktop-connector"
            ];

          if (!zoteroIntegration) {
            throw new Error("Zotero Integration plugin not found");
          }

          if (typeof zoteroIntegration.runImport !== "function") {
            throw new Error(
              "Current Zotero Integration does not have a usable runImport method"
            );
          }

          await zoteroIntegration.runImport(
            format,
            citekey,
            library
          );

          new Notice(`Successfully imported reference: ${citekey}`);
        } catch (error) {
          console.error("Citekey import failed:", error);

          const message =
            error instanceof Error
              ? error.message
              : String(error);

          new Notice(`Reference import failed: ${message}`, 8000);
        }
      }
    );
  }
};
```

manifest.json

```
{
  "id": "citekey-import-bridge",
  "name": "Citekey Import Bridge",
  "version": "0.1.0",
  "minAppVersion": "1.1.1",
  "description": "Create Zotero literature notes from external Obsidian URLs.",
  "author": "Yuxuan Qi",
  "isDesktopOnly": true
}
```
