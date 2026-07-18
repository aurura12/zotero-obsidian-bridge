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