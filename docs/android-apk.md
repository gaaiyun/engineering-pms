# Android APK 构建与验收

当前应用：`EngineeringPMS`，applicationId `com.engineering.pms`，versionName `3.05`，versionCode `45`。

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

2026-07-13 最终候选产物：

- 大小：`7,210,637` bytes
- SHA-256：`7D78A618DCCD13498F3C3A6EAB279AE3823B5D4B8AECEFE460D15DD6FB8A6447`
- `aapt dump badging`：`com.engineering.pms` / versionName `3.05` / versionCode `45`
- 内嵌后端：直接生产 PocketBase URL；实际值不在公开文档重复记录

该产物包含最新姓名字标头像与看板拖拽修复，并指向已完成 3.05 后端增量发布的生产 PocketBase。手机在最终重建前已断开，因此最终候选包已完成构建与静态校验，尚待下次 USB 连接后覆盖安装复验；不能用 Web 已发布替代 APK 真机验收。

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
