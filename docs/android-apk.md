# Android APK 构建与验收

当前应用：`EngineeringPMS`，applicationId `com.engineering.pms`，versionName `3.06`，versionCode `46`。

## Debug APK

要求：Node.js、Android SDK、JDK 17。缓存放在 G 盘：

```powershell
Set-Location frontend
$env:npm_config_cache = 'G:\dev-cache\npm'
$env:GRADLE_USER_HOME = 'G:\dev-cache\gradle'
$env:JAVA_HOME = 'G:\dev-cache\jdks\jdk-17.0.19+10'
$env:PLAYWRIGHT_BROWSERS_PATH = 'G:\ClaudeData\ms-playwright'

npm ci
npm test -- --run
npm run build
npx cap sync android

.\scripts\build-debug-apk.ps1 -PocketBaseUrl 'https://<server-host>/pb'
```

构建脚本要求显式后端 URL，并检查产物 JS 包含该 URL，防止误打包 localhost 或旧地址。脚本会检测 JDK 主版本；系统默认 JDK 不是 17 时，会优先使用 `JAVA17_HOME` 或 G 盘现有 JDK 17，避免 JDK 23 在 Android 33 `JdkImageTransform` 阶段失败。

APK 输出：`frontend/android/app/build/outputs/apk/debug/app-debug.apk`。

2026-08-20 的 3.06 候选产物：

- `aapt dump badging`：`com.engineering.pms` / versionName `3.06` / versionCode `46`
- 内嵌后端：生产 PocketBase URL
- 大小：`7,210,979` bytes
- SHA-256：`C445196B7574C63CDE4F3E90E14EB6CAD4929EDF4717DE41B7D78C2FF52B87ED`

该产物对应提交 `c4c298f`，已通过 metadata 和 `aapt dump badging` 静态校验。APK 以“Android 内测包”随交付材料提供；`adb devices` 当前为空，尚未执行真机覆盖安装和下方验收，不能用 3.05 的真机结果或 Web 验收替代 3.06 APK 真机验收。

## 安装

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
& $adb install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

`adb devices` 必须显示状态 `device`。只有 MTP/存储设备、`unauthorized` 或空列表都不算已连接。

## 真机验收

- 登录、保持登录、退出和返回键。
- 工作台、任务、项目、通知、我的五入口。
- 项目详情、看板抽屉、时间轴筛选/缩放与横屏。
- 键盘弹起、系统字体缩放、安全区、底部导航不遮挡内容。
- 前台 Realtime、后台通知、网络断开恢复和杀进程后恢复。
- 管理员新增/停用账号，员工任务交接和卡点流程。
- App icon、启动图、通知小图标在浅色/深色桌面清晰。

## Release

Debug 签名不能用于正式发布。Release 需要在未跟踪的 `frontend/android/keystore.properties` 配置私有 keystore。Gradle 会在配置缺失时拒绝伪 Release 构建。

发布前还需决定 compile/target SDK 升级策略；当前工程为 SDK 33，升级要同时验证前台服务、通知权限和 Android 14/15 行为。

不得提交 `.jks`、`.keystore`、`keystore.properties` 或密码。
