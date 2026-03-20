# 构建可安装的 Debug APK（Capacitor）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ">> npm run build" -ForegroundColor Cyan
npm run build

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
