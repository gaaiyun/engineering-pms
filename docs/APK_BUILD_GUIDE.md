# Android APK 打包指南 (v2.0)

本指南将协助您将前端项目 (`frontend`) 打包为可安装的 Android APK 文件。

## 1. 准备工作

确保您的开发环境已安装：
*   **Android Studio** (推荐 Hedgehog 或更高版本)
*   **JDK 17** (Android Studio 通常自带)
*   **项目依赖**: 已执行 `npm install`

## 2. 快速启动

在 `frontend` 目录下，我们已经配置好了自动化命令：

```bash
# 1. 构建前端资源 (生成 dist 目录)
npm run build

# 2. 同步资源到 Android 项目 (将 dist 复制到 android/app/src/main/assets)
npx cap sync

# 3. 打开 Android Studio
npx cap open android
```

## 3. 在 Android Studio 中打包 APK

## 方式 A: 命令行直接打包 (推荐)
如果您不想打开 Android Studio，可以直接使用 Gradle 命令行：

```bash
cd android
# Windows Powershell
.\gradlew assembleDebug

# Windows CMD
gradlew assembleDebug
```
构建完成后，APK 文件位于: `android/app/build/outputs/apk/debug/app-debug.apk`

## 方式 B: 使用 Android Studio 界面
Android Studio 打开后，请等待底部的 Gradle Sync 完成 (首次可能需要几分钟下载依赖)。

### 测试运行 (模拟器/真机)
1. 连接手机 (开启 USB 调试) 或启动 AVD 模拟器。
2. 点击顶部工具栏的绿色 **Run (▶)** 按钮。
3. 应用将自动安装并启动。

### 生成正式 APK (Signed APK)
1. 菜单栏点击 **Build** -> **Generate Signed Bundle / APK**.
2. 选择 **APK** -> Next.
3. **Key store path**:
   *   如果是第一次，点击 **Create new...** 创建一个密钥库 (.jks 文件)。
   *   记住设置的密码 (Password) 和别名 (Alias)。
4. 填写密码后 -> Next.
5. 选择 **release** 版本 (勾选 V1 和 V2 Signature) -> Finish.
6. 等待构建完成，右下角会提示 "Locate"，点击即可找到 `.apk` 文件。

## 4. 常见问题 (Troubleshooting)

### Q1: App 显示 "Webpage not available" 或白屏?
*   **原因**: API 请求失败或路由错误。
*   **解决**:
    *   确保 `capacitor.config.ts` 中的 `cleartext: true` 已启用 (允许 HTTP)。
    *   如果您连接的是本地后端 (PocketBase)，请确保手机和电脑在**同一局域网**。
    *   **重要**: 手机无法访问 `localhost`。
        - **推荐做法（打包前设置）**：用环境变量指定后端地址：`VITE_PB_URL=http://<YOUR_LAN_IP>:8090`（示例为局域网 IP）
        - **临时做法（运行时覆盖）**：在 App 的 WebView 控制台执行：`localStorage.setItem('pb_url', 'http://<YOUR_LAN_IP>:8090')`，然后重启 App

### Q2: 无法联网?
*   检查 `AndroidManifest.xml` 是否包含 INTERNET 权限 (默认已包含)。
*   如果是模拟器，检查模拟器的 WiFi 连接。

### Q3: 图标怎么修改?
*   使用 `capacitor-assets` 工具自动生成:
    *   准备一张 1024x1024 的 `logo.png` 放入 `assets/` 目录。
    *   运行 `npx capacitor-assets generate --android`.

---
> **提示**: `EngineeringPMS` 已预配置为 `com.engineering.pms`。如需发布到应用市场，请务必保管好您的 `.jks` 密钥文件。
