const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  Modal,
  request,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  serverUrl: "http://127.0.0.1:23119",
  token: "",
};

const UPDATE_LINK_PATH = "/zotero-citekey-bridge/update-link";

// 清洗 citekey：去空白、去 @ 前缀
const cleanCitekey = (value) =>
  String(value || "").trim().replace(/^@/, "");

module.exports = class CitekeyImportBridge extends Plugin {
  async onload() {
    await this.loadSettings();

    // 监听文件移动/重命名，回写新路径给 Zotero
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.handleRename(file, oldPath);
      })
    );

    // 创建协议：obsidian://zotero-note
    // 缺省/action=create → 创建；兼容旧版 Zotero(≤0.3.0) 的 action=open → 打开
    this.registerObsidianProtocolHandler(
      "zotero-note",
      async (params) => {
        console.log("[CitekeyImportBridge] zotero-note handler:", params);
        const citekey = cleanCitekey(params.citekey);

        if (!citekey) {
          new Notice("Missing citekey parameter");
          return;
        }

        const action = String(params.action || "create")
          .trim()
          .toLowerCase();

        if (action === "open") {
          console.warn(
            "[CitekeyImportBridge] legacy action=open via zotero-note; routing to handleOpen"
          );
          await this.handleOpen(citekey, params);
          return;
        }

        await this.handleCreate(citekey, params);
      }
    );

    // 打开协议（0.4.0 起）：obsidian://zotero-open-note 直接打开，无 action 判断
    this.registerObsidianProtocolHandler(
      "zotero-open-note",
      async (params) => {
        console.log("[CitekeyImportBridge] zotero-open-note handler:", params);
        const citekey = cleanCitekey(params.citekey);

        if (!citekey) {
          new Notice("Missing citekey parameter");
          return;
        }

        await this.handleOpen(citekey, params);
      }
    );

    this.addSettingTab(new CitekeyImportBridgeSettingTab(this.app, this));
  }

  // ---------- 设置与数据（共用 data.json） ----------

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.knownCitekeys = this.settings.knownCitekeys || [];
    this.settings.knownNotePaths = this.settings.knownNotePaths || {};
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  addKnownCitekey(citekey) {
    const key = cleanCitekey(citekey);
    if (!key) {
      return;
    }
    if (!this.settings.knownCitekeys.includes(key)) {
      this.settings.knownCitekeys.push(key);
      this.saveSettings();
    }
  }

  isKnownCitekey(basename) {
    return this.settings.knownCitekeys.includes(basename);
  }

  recordNotePath(citekey, path) {
    const key = cleanCitekey(citekey);
    if (!key || !path) {
      return;
    }
    if (this.settings.knownNotePaths[key] !== path) {
      this.settings.knownNotePaths[key] = path;
      this.saveSettings();
    }
  }

  // ---------- 创建笔记（zotero-note 协议） ----------

  async handleCreate(citekey, params) {
    console.log("[CitekeyImportBridge] handleCreate:", citekey);
    const folder = String(params.folder || "maic").trim();
    const format = String(params.format || "Paper Note").trim();

    // 已存在笔记守卫：任何 open→create 误路由的兜底，绝不重复导入
    const existing = this.findNoteByCitekey(citekey, folder);
    if (existing) {
      console.warn(
        `[CitekeyImportBridge] create requested but note exists at "${existing.path}"; opening instead`
      );
      new Notice(`笔记已存在，改为打开：${existing.path}`, 8000);
      await this.handleOpen(citekey, params);
      return null;
    }

    // 防重入锁：同一 citekey 正在导入时忽略重复触发（连点/协议二次触发）
    if (this._importsInFlight?.[citekey]) {
      new Notice(`正在导入 ${citekey}，请稍候…`, 4000);
      return null;
    }
    this._importsInFlight = this._importsInFlight || {};
    this._importsInFlight[citekey] = true;

    const parsedLibrary = Number(params.library || 1);
    const library = Number.isFinite(parsedLibrary) ? parsedLibrary : 1;

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

      await zoteroIntegration.runImport(format, citekey, library);

      this.addKnownCitekey(citekey);
      const created = this.findNoteByCitekey(citekey, folder);
      if (created) {
        this.recordNotePath(citekey, created.path);
      }
      new Notice(`Successfully imported reference: ${citekey}`);
      return created;
    } catch (error) {
      console.error("Citekey import failed:", error);

      const message =
        error instanceof Error ? error.message : String(error);

      new Notice(`Reference import failed: ${message}`, 8000);
      return null;
    } finally {
      delete this._importsInFlight[citekey];
    }
  }

  // ---------- 打开笔记（zotero-open-note 协议） ----------

  async handleOpen(citekey, params) {
    console.log("[CitekeyImportBridge] handleOpen:", citekey, params);
    const folder = String(params.folder || "maic").trim();
    const file = this.findNoteByCitekey(citekey, folder);

    if (!file) {
      // 笔记缺失 → 确认框一键重建；取消则关闭，不做任何事
      new RecreateConfirmModal(this.app, {
        citekey,
        message:
          `未找到笔记（${citekey}）。\n\n` +
          `笔记可能已被删除或重命名，路径已失效。\n\n` +
          `是否基于 Zotero 条目重新创建？确认后将重新生成笔记并自动打开，同时更新 Zotero 中的关联链接。`,
        onConfirm: () => {
          this.rebuildNote(citekey, params);
        },
      }).open();
      return;
    }

    this.addKnownCitekey(citekey);
    this.recordNotePath(citekey, file.path);

    // 打开文件（新 tab），打开不依赖回写成功
    try {
      await this.app.workspace.getLeaf("tab").openFile(file);
    } catch (error) {
      console.error("Failed to open note:", error);
      new Notice(`打开笔记失败：${error.message}`, 8000);
      return;
    }

    // 异步回写新路径（失败静默，不影响打开）
    const vaultName = this.app.vault.getName();
    this.writebackLink(citekey, file.path, vaultName, params.zport);
  }

  // 打开时笔记缺失 → 一键重建（方案 A）
  async rebuildNote(citekey, params) {
    const created = await this.handleCreate(citekey, params);
    if (!created) {
      return; // 导入失败，或已存在笔记（handleCreate 守卫已改为打开）
    }

    try {
      await this.app.workspace.getLeaf("tab").openFile(created);
    } catch (error) {
      console.error("Failed to open rebuilt note:", error);
      new Notice(`打开重建笔记失败：${error.message}`, 8000);
      return;
    }

    // 回写新路径，保持 Zotero Extra 链接有效（与 handleOpen 尾部一致）
    const vaultName = this.app.vault.getName();
    this.writebackLink(citekey, created.path, vaultName, params.zport);
  }

  // 定位笔记：记录路径 → 约定路径 → 全库 basename，多匹配取 mtime 最旧
  findNoteByCitekey(citekey, folder) {
    const cleanFolder = String(folder || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const preferredPath = cleanFolder
      ? `${cleanFolder}/${citekey}.md`
      : `${citekey}.md`;

    const candidates = new Map(); // path -> TFile

    // 1) 记录路径优先（0.4.0 起持久化，由 create/open/rename 维护）
    const recorded = this.settings.knownNotePaths?.[citekey];
    if (recorded) {
      const rec = this.app.vault.getAbstractFileByPath(recorded);
      if (rec instanceof TFile) {
        candidates.set(rec.path, rec);
      }
    }

    // 2) 约定路径 {folder}/{citekey}.md
    const preferred = this.app.vault.getAbstractFileByPath(preferredPath);
    if (preferred instanceof TFile) {
      candidates.set(preferred.path, preferred);
    }

    // 3) 全库 basename 匹配（文件名 = citekey）
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.basename === citekey) {
        candidates.set(file.path, file);
      }
    }

    if (candidates.size === 0) {
      return null;
    }

    const files = [...candidates.values()];
    if (files.length === 1) {
      return files[0];
    }

    // 多匹配：优先记录路径；否则取 mtime 最旧（误建副本通常是新生成的）
    const recordedFile = files.find((f) => f.path === recorded);
    if (recordedFile) {
      return recordedFile;
    }

    files.sort((a, b) => a.stat.mtime - b.stat.mtime);
    console.warn(
      "[CitekeyImportBridge] multiple matches, chose by oldest mtime:",
      files.map((f) => `${f.path} (${new Date(f.stat.mtime).toISOString()})`),
      "->",
      files[0].path
    );
    return files[0];
  }

  // ---------- 回写 Zotero Extra ----------

  getWritebackBaseURL(zport) {
    const parsed = Number(zport);
    if (Number.isInteger(parsed) && parsed > 0) {
      return `http://127.0.0.1:${parsed}`;
    }
    return String(this.settings.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(
      /\/+$/,
      ""
    );
  }

  async writebackLink(citekey, filePath, vaultName, zport) {
    const base = this.getWritebackBaseURL(zport);
    const url = `${base}${UPDATE_LINK_PATH}`;
    const token = String(this.settings.token || "").trim();

    try {
      const response = await request({
        url,
        method: "POST",
        contentType: "application/json",
        headers: {
          "X-Citekey-Bridge-Token": token,
        },
        body: JSON.stringify({
          citekey,
          filePath,
          vaultName,
          token,
        }),
      });

      this.addKnownCitekey(citekey);
      console.debug("Writeback success:", response);
    } catch (error) {
      // 静默失败：Zotero 未运行等情况，不影响 Obsidian 打开笔记
      console.warn("Writeback failed (non-fatal):", error);
    }
  }

  // ---------- 移动/重命名监听 ----------

  handleRename(file, oldPath) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    // 只处理本插件已知的 bridge 笔记（文件名 = citekey）
    if (!this.isKnownCitekey(file.basename)) {
      return;
    }

    this.recordNotePath(file.basename, file.path);
    const vaultName = this.app.vault.getName();
    this.writebackLink(file.basename, file.path, vaultName);
  }
};

class CitekeyImportBridgeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Citekey Import Bridge" });

    new Setting(containerEl)
      .setName("Zotero 回写地址")
      .setDesc("Zotero 本地 HTTP 服务地址（默认 http://127.0.0.1:23119）")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:23119")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("回写令牌")
      .setDesc("与 Zotero 插件设置中的「回写令牌」保持一致；留空表示不校验")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}

// 打开时笔记缺失的确认框：重新创建 / 取消
class RecreateConfirmModal extends Modal {
  constructor(app, { citekey, message, onConfirm }) {
    super(app);
    this.citekey = citekey;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: `未找到笔记（${this.citekey}）` });

    // <p> 内 \n 不换行，需手动拆行
    const body = contentEl.createEl("p");
    String(this.message || "")
      .split("\n")
      .forEach((line, index) => {
        if (index > 0) {
          body.createEl("br");
        }
        body.appendText(line);
      });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("取消").onClick(() => this.close()))
      .addButton((btn) =>
        btn
          .setButtonText("重新创建")
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm?.();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
