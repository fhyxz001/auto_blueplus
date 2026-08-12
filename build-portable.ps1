﻿<#
.SYNOPSIS
  Build auto_blueplus portable package — bundle Node.js + Playwright Chromium
  Output: .\dist\auto_blueplus_portable\
  Run: double-click dist\auto_blueplus_portable\一键启动.bat
#>

$ErrorActionPreference = 'Stop'
$DistDir = Join-Path $PSScriptRoot 'dist'
$PortableDir = Join-Path $DistDir 'auto_blueplus_portable'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  auto_blueplus Portable Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ------ Clean old output ------
if (Test-Path $PortableDir) {
    Write-Host "[1/6] Cleaning old output directory ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $PortableDir
}

# ------ Create directories ------
Write-Host "[1/6] Creating directory structure ..." -ForegroundColor Yellow
$null = New-Item -ItemType Directory -Force -Path $PortableDir
$null = New-Item -ItemType Directory -Force -Path (Join-Path $PortableDir 'ms-playwright')

# ------ Download portable Node.js ------
Write-Host "[2/6] Downloading portable Node.js (v20.20.0 win-x64) ..." -ForegroundColor Yellow
$NodeVersion = 'v20.20.0'
$NodeZip = "node-$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/$NodeVersion/$NodeZip"
$NodeZipPath = Join-Path $DistDir $NodeZip

if (-not (Test-Path $NodeZipPath)) {
    Write-Host "  Downloading $NodeUrl ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZipPath -UseBasicParsing
    Write-Host "  Download complete" -ForegroundColor Green
} else {
    Write-Host "  Cache hit: $NodeZipPath" -ForegroundColor Green
}

Write-Host "  Extracting node.exe ..." -ForegroundColor Gray
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($NodeZipPath)
$entry = $zip.Entries | Where-Object { $_.FullName -eq "node-$NodeVersion-win-x64/node.exe" }
if ($entry) {
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $PortableDir 'node.exe'), $true)
    Write-Host "  node.exe extracted" -ForegroundColor Green
} else {
    throw "node.exe not found in zip"
}
$zip.Dispose()

# Verify
$nodeExe = Join-Path $PortableDir 'node.exe'
if (-not (Test-Path $nodeExe)) { throw "node.exe extraction failed" }
$nodeVer = & $nodeExe --version
Write-Host "  Node.js version: $nodeVer" -ForegroundColor Green

# ------ Copy project files ------
Write-Host "[3/6] Copying project files ..." -ForegroundColor Yellow
$AppFiles = @(
    'server.js', 'southplus.js', 'settings.js',
    'index.html', 'vue.global.prod.js',
    'settings.json', 'auth.json',
    'package.json'
)

$missingFiles = @()
foreach ($file in $AppFiles) {
    $src = Join-Path $PSScriptRoot $file
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $PortableDir $file)
        Write-Host "  OK $file" -ForegroundColor Gray
    } else {
        Write-Host "  SKIP $file (not found)" -ForegroundColor DarkYellow
        $missingFiles += $file
    }
}

# Copy history directory if exists
$historySrc = Join-Path $PSScriptRoot 'history'
if (Test-Path $historySrc) {
    Copy-Item -Recurse $historySrc (Join-Path $PortableDir 'history')
    Write-Host "  OK history/" -ForegroundColor Gray
}

# ------ Copy node_modules ------
Write-Host "[4/6] Copying node_modules ..." -ForegroundColor Yellow
$nmSrc = Join-Path $PSScriptRoot 'node_modules'
$nmDst = Join-Path $PortableDir 'node_modules'
if (Test-Path $nmSrc) {
    $fileCount = (Get-ChildItem $nmSrc -Recurse -File | Measure-Object).Count
    Write-Host "  Copying $fileCount files ..." -ForegroundColor Gray
    Copy-Item -Recurse $nmSrc $nmDst
    Write-Host "  node_modules copied" -ForegroundColor Green
} else {
    Write-Host "  node_modules not found, running npm install ..." -ForegroundColor DarkYellow
    Push-Location $PortableDir
    & $nodeExe (Join-Path $PortableDir 'node_modules\npm\bin\npm-cli.js') install --production
    Pop-Location
    Write-Host "  npm install complete" -ForegroundColor Green
}

# ------ Copy Chromium browser ------
Write-Host "[5/6] Copying Chromium browser ..." -ForegroundColor Yellow
$PlaywrightCacheDir = "$env:USERPROFILE\AppData\Local\ms-playwright"
$PlaywrightBrowsersDst = Join-Path $PortableDir 'ms-playwright'

# 应用只用 Chromium，只复制 chromium-* 目录即可，避免把 firefox/webkit 也打进包
$browserDirFilter = '^chromium-'

if (Test-Path $PlaywrightCacheDir) {
    $browsers = Get-ChildItem $PlaywrightCacheDir -Directory | Where-Object { $_.Name -match $browserDirFilter }
    $totalSize = 0
    foreach ($b in $browsers) {
        $dst = Join-Path $PlaywrightBrowsersDst $b.Name
        Write-Host "  Copying $($b.Name) ..." -ForegroundColor Gray
        Copy-Item -Recurse $b.FullName $dst
        $size = (Get-ChildItem $dst -Recurse -File | Measure-Object -Property Length -Sum).Sum
        $sizeMB = [math]::Round($size / 1MB, 1)
        $totalSize += $size
        Write-Host "    OK ($sizeMB MB)" -ForegroundColor Green
    }
    $totalSizeMB = [math]::Round($totalSize / 1MB, 1)
    Write-Host "  Chromium total: $totalSizeMB MB" -ForegroundColor Green
} else {
    Write-Host "  Playwright cache not found, installing Chromium via npx ..." -ForegroundColor DarkYellow
    Push-Location $PortableDir
    $env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsersDst
    & $nodeExe (Join-Path $PortableDir 'node_modules\playwright\cli.mjs') install chromium
    Pop-Location
    Write-Host "  Chromium installed" -ForegroundColor Green
}

# Check if any browser was copied
$anyBrowser = Get-ChildItem $PlaywrightBrowsersDst -Directory | Select-Object -First 1
if (-not $anyBrowser) {
    Write-Host "  WARNING: No Playwright browsers found. Run manually: npx playwright install chromium" -ForegroundColor Red
}

# ------ Create launcher ------
Write-Host "[6/6] Creating launcher script ..." -ForegroundColor Yellow

$launcherContent = @'
@echo off
chcp 65001 >nul
title 南+ 自动扫描控制台
color 0A

set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
set "SP_NO_SANDBOX=1"

echo ========================================
echo     南+ 自动扫描控制台
echo ========================================
echo.
echo 正在启动服务，请稍候...
echo.

REM 后台任务：3秒后自动打开浏览器
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:4567"

REM 前台运行服务器，所有日志在此窗口显示
echo 按 Ctrl+C 可停止服务。
echo.
"%~dp0node.exe" "%~dp0server.js"

echo.
echo ========================================
echo  服务器已停止。按任意键退出。
echo ========================================
pause >nul
'@

$launcherPath = Join-Path $PortableDir '一键启动.bat'
Set-Content -Path $launcherPath -Value $launcherContent -Encoding UTF8
Write-Host "  Launcher created: 一键启动.bat" -ForegroundColor Green

# ------ Build report ------
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$totalSize = (Get-ChildItem $PortableDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
$fileCount = (Get-ChildItem $PortableDir -Recurse -File | Measure-Object).Count

Write-Host ""
Write-Host "  Output dir: $PortableDir" -ForegroundColor White
Write-Host "  Total size: $([math]::Round($totalSize, 1)) MB" -ForegroundColor White
Write-Host "  File count: $fileCount" -ForegroundColor White
Write-Host ""
Write-Host "  How to use:" -ForegroundColor Yellow
Write-Host "    1. Copy 'auto_blueplus_portable' folder to any Windows PC" -ForegroundColor Yellow
Write-Host "    2. Double-click '一键启动.bat'" -ForegroundColor Yellow
Write-Host "    3. Browser opens at http://localhost:4567" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Notes:" -ForegroundColor DarkYellow
Write-Host "    - auth.json contains login session; ensure it is valid on target PC" -ForegroundColor DarkYellow
Write-Host "    - To re-login: delete auth.json and re-run; Chromium will show login page" -ForegroundColor DarkYellow
Write-Host ""

# Save build info
$buildInfo = @{
    BuildTime = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    NodeVersion = $nodeVer
    TotalSizeMB = [math]::Round($totalSize, 1)
    FileCount = $fileCount
}
$buildInfo | ConvertTo-Json | Set-Content (Join-Path $PortableDir 'build-info.json') -Encoding UTF8