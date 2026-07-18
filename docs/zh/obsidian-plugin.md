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

依赖 obsidian-zotero-desktop-connector 中的 runImport `zoteroIntegration.runImport()`。它并不是一个稳定发布的API。但是调用的是zotero integration，我这里自己创建了一个叫做 Paper Note 的 Import format。

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