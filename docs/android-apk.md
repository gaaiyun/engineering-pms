# Android APK 构建、连接后端与验收

> 当前版本：EngineeringPMS 3.04（versionCode 44）
> 当前可自动构建的是 debug APK；正式 release 需要项目所有者提供并保管 release keystore。
> APK 不上传到宝塔才能运行。宝塔只负责 Web 和 PocketBase；APK 在 Windows 本地构建后直接安装或分发。

## 1. 当前后端地址

APK 在构建时把 PocketBase 地址写入 Web 资源和原生实时通知配置。换服务器或切换 `/pb` 反代后必须重新构建 APK。

当前生产地址：

```text
http://8.134.9.77:8090
```

链路如下：

```text
-PocketBaseUrl
  → VITE_PB_URL
  → npm run build 写入 frontend/dist
  → npx cap sync android 复制进 Android 工程
  → Gradle 打包进 APK
```

不要用 `setx VITE_PB_URL`：它会永久影响后续终端。每次构建都显式传 `-PocketBaseUrl`。

## 2. 一键构建 debug APK

PowerShell 执行：

```powershell
Set-Location 'G:\项目管理软件_v2\frontend'

$env:npm_config_cache = 'G:\dev-cache\npm'
$env:GRADLE_USER_HOME = 'G:\dev-cache\gradle'
$env:JAVA_HOME = 'G:\dev-cache\jdks\jdk-17.0.19+10'

.\scripts\build-debug-apk.ps1 `
  -PocketBaseUrl 'http://8.134.9.77:8090'
```

脚本会严格按以下顺序执行，并检查每个外部命令的退出码：

1. `npm run build`
2. 检查构建资源确实包含指定 PocketBase URL
3. `npx cap sync android`
4. 删除旧的 debug APK
5. `gradlew assembleDebug`
6. 确认产生新的 APK

产物：

```text
frontend\android\app\build\outputs\apk\debug\app-debug.apk
```

debug APK 使用 Android Debug 证书，只适合内部测试，不能称为正式 release。

## 3. 验证 APK

先从 `frontend/android/local.properties` 的 `sdk.dir` 找 Android SDK，再使用最新 `build-tools`：

```powershell
$apk = 'G:\项目管理软件_v2\frontend\android\app\build\outputs\apk\debug\app-debug.apk'
$sdk = '<Android SDK 目录>'
$buildTools = Get-ChildItem "$sdk\build-tools" -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1

& "$($buildTools.FullName)\aapt.exe" dump badging $apk |
  Select-String 'package:|application-label:|sdkVersion|targetSdkVersion'

& "$($buildTools.FullName)\apksigner.bat" verify --verbose --print-certs $apk
Get-FileHash $apk -Algorithm SHA256
```

当前应看到：

- package：`com.engineering.pms`
- application label：`EngineeringPMS`
- versionName：`3.04`
- versionCode：`44`
- debug 签名：`CN=Android Debug`

还要检查 APK 内没有 `localhost`、`127.0.0.1` 或错误服务器地址。

## 4. 安装与真机测试

手机开启开发者模式和 USB 调试：

```powershell
adb devices
adb install -r 'G:\项目管理软件_v2\frontend\android\app\build\outputs\apk\debug\app-debug.apk'
```

至少验证：

- 全新安装、覆盖升级、卸载重装；
- 桌面名称/图标/版本正确；
- employee、manager、admin 登录；
- 工作台、任务、项目、审核、通知、我的、系统管理数据流；
- 竖屏、横屏、刘海安全区、系统返回键；
- 断网恢复、Wi-Fi/蜂窝切换、退出/换账号不串号；
- Android 13+ 通知授权允许/拒绝；
- 前台、后台、锁屏、划掉任务后的通知不重复；
- PocketBase Realtime SSE 能断线重连。

仓库中还没有自动化真机证据时，不得把“Gradle 构建成功”写成“真机验收完成”。

## 5. 正式 release APK

release 前必须由项目所有者创建并离线备份 keystore。不要把 keystore、密码或 `keystore.properties` 提交 Git。

在 `frontend/android/keystore.properties` 配置本机路径和密码后：

```powershell
Set-Location 'G:\项目管理软件_v2\frontend'
$env:VITE_PB_URL = 'https://最终生产域名/pb'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed' }

Set-Location '.\android'
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { throw 'Release build failed' }
```

标准产物目录：

```text
frontend\android\app\build\outputs\apk\release\
```

发布前必须再次执行 `apksigner verify --verbose --print-certs`，确认不是 Debug 证书，并记录 SHA-256。首次 release 的签名证书必须永久保留；以后升级必须使用同一证书。

## 6. 已知边界

- 当前生产直连 HTTP 8090，因此 Android 暂时启用了 cleartext；安全收口应迁移到 HTTPS `/pb` 后重新打包。
- target/compile SDK 当前为 33；上应用商店前需单独升级并测试 API 34/35。
- 当前没有 BootReceiver，不能宣称手机重启后自动恢复通知服务。
- 电池白名单引导、国产 ROM 自启动引导和通知诊断页尚未全部实现。
