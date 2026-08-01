# Zotero Citekey Bridge 打包脚本
# 用法: .\scripts\package-zotero.ps1 [-Version "0.1.1"]

param(
    [string]$Version
)

$root = (Get-Item $PSScriptRoot).Parent.FullName
$manifestPath = Join-Path $root "plugins" "zotero" "manifest.json"

# 默认从 manifest 读取当前版本
if (-not $Version) {
    $manifest = Get-Content $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
    $Version = $manifest.version
}

Write-Host "===== Zotero Citekey Bridge 打包 =====" -ForegroundColor Cyan
Write-Host "版本: $Version" -ForegroundColor Yellow
Write-Host ""

Push-Location $root

try {
    & "node" (Join-Path $root "scripts" "release.mjs") --version $Version

    $output = Join-Path $root "release" $Version "zotero"
    $xpiFile = Join-Path $output "zotero-citekey-bridge-$Version.xpi"
    $updateFile = Join-Path $output "zotero-updates.json"

    Write-Host ""
    Write-Host "===== 打包完成 =====" -ForegroundColor Green
    Write-Host "插件: $xpiFile"
    Write-Host "更新: $updateFile"
    Write-Host ""
    Write-Host "安装方式：把 .xpi 文件拖入 Zotero 窗口即可。" -ForegroundColor Cyan
}
catch {
    Write-Host "打包失败: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
