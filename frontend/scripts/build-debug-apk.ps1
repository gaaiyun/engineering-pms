param(
  [string]$PocketBaseUrl = $(if ($env:VITE_PB_URL) { $env:VITE_PB_URL } else { 'http://8.134.9.77:8090' })
)

# 构建可安装的 Debug APK（Capacitor）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label 执行失败，退出码：$LASTEXITCODE"
  }
}

if ($PocketBaseUrl -notmatch '^https?://') {
  throw "PocketBaseUrl 必须是完整的 http(s) URL：$PocketBaseUrl"
}
$env:VITE_PB_URL = $PocketBaseUrl
Write-Host ">> PocketBase: $PocketBaseUrl" -ForegroundColor Yellow

Write-Host ">> npm run build" -ForegroundColor Cyan
Invoke-NativeChecked 'npm run build' { npm run build }

$builtJs = Get-ChildItem (Join-Path $root 'dist\assets') -Filter '*.js' -File
if (-not ($builtJs | Select-String -SimpleMatch $PocketBaseUrl -Quiet)) {
  throw "构建产物中未找到 PocketBase 地址，停止 APK 打包"
}

Write-Host ">> npx cap sync android" -ForegroundColor Cyan
Invoke-NativeChecked 'npx cap sync android' { npx cap sync android }

$android = Join-Path $root "android"
Set-Location $android

Write-Host ">> gradlew assembleDebug" -ForegroundColor Cyan
$apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
  Remove-Item -LiteralPath $apk -Force
}
if ($IsWindows -or $env:OS -match "Windows") {
  Invoke-NativeChecked 'gradlew assembleDebug' { .\gradlew.bat assembleDebug }
} else {
  Invoke-NativeChecked 'gradlew assembleDebug' { ./gradlew assembleDebug }
}

if (-not (Test-Path $apk)) {
  throw "APK 未生成：$apk"
}
Write-Host ""
Write-Host "Debug APK: $apk" -ForegroundColor Green
