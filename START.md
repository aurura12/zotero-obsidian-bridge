# Zotero 插件打包

改完配置后，在项目根目录打开 **PowerShell**，运行：

```powershell
.\scripts\package-zotero.ps1
```

如需指定版本号：

```powershell
.\scripts\package-zotero.ps1 -Version 0.1.1
```

产物在 `release/<版本号>/zotero/` 目录下，将 `.xpi` 文件拖入 Zotero 窗口即可安装。
