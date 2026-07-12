param(
  [string]$PocketBaseUrl = $(if ($env:VITE_PB_URL) { $env:VITE_PB_URL } else { 'http://8.134.9.77:8090' })
)

# 构建可安装的 Debug APK（Capacitor）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($PocketBaseUrl -notmatch '^https?://') {
  throw "PocketBaseUrl 必须是完整的 http(s) URL：$PocketBaseUrl"
}
$env:VITE_PB_URL = $PocketBaseUrl
Write-Host ">> PocketBase: $PocketBaseUrl" -ForegroundColor Yellow

Write-Host ">> npm run build" -ForegroundColor Cyan
npm run build

$builtJs = Get-ChildItem (Join-Path $root 'dist\assets') -Filter '*.js' -File
if (-not ($builtJs | Select-String -SimpleMatch $PocketBaseUrl -Quiet)) {
  throw "构建产物中未找到 PocketBase 地址，停止 APK 打包"
}

Write-Host ">> npx cap sync android" -ForegroundColor Cyan
npx cap sync android

$android = Join-Path $root "android"
Set-Location $android

Write-Host ">> gradlew assembleDebug" -ForegroundColor Cyan
if ($IsWindows -or $env:OS -match "Windows") {
  .\gradlew.bat assembleDebug
} else {
  ./gradlew assembleDebug
}

$apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
Write-Host "Debug APK: $apk" -ForegroundColor Green
