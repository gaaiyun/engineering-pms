param(
  [string]$PocketBaseUrl = $env:VITE_PB_URL
)

# 构建可安装的 Debug APK（Capacitor）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Capacitor 5 / Android Gradle Plugin 7.4 使用 JDK 17。较新的系统默认 JDK
# （例如 JDK 23）会在 android-33 的 JdkImageTransform 阶段失败。
function Get-JavaMajorVersion {
  try {
    $versionLine = (& java -version 2>&1 | Select-Object -First 1) -join ''
    if ($versionLine -match 'version "(?<major>\d+)') { return [int]$Matches.major }
  } catch { }
  return 0
}

if ((Get-JavaMajorVersion) -ne 17) {
  $jdk17Candidates = @($env:JAVA17_HOME)
  if (Test-Path 'G:\dev-cache\jdks') {
    $jdk17Candidates += Get-ChildItem 'G:\dev-cache\jdks' -Directory -Filter 'jdk-17*' |
      Sort-Object Name -Descending |
      Select-Object -ExpandProperty FullName
  }
  $jdk17 = $jdk17Candidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) } | Select-Object -First 1
  if (-not $jdk17) {
    throw 'Android 构建需要 JDK 17。请设置 JAVA17_HOME，或在 G:\dev-cache\jdks 安装 jdk-17。'
  }
  $env:JAVA_HOME = $jdk17
  $env:Path = "$jdk17\bin;$env:Path"
}

if (-not $env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME = 'G:\dev-cache\gradle'
}
Write-Host ">> Java: $((& java -version 2>&1 | Select-Object -First 1) -join '')" -ForegroundColor Yellow

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

if (-not $PocketBaseUrl) {
  throw '必须通过 -PocketBaseUrl 或 VITE_PB_URL 显式指定 App 后端地址，避免误打包 localhost 或旧生产地址。'
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
