# Android/iOS App 打包指南

本指南将教你如何将写好的 React 网页打包成真正的 Android APK 安装包。

## 前置准备

1. **安装 Node.js** (你已经有了)
2. **安装 Android Studio**: [下载地址](https://developer.android.com/studio) (打包安卓必须)
   - 安装时一路 Next，安装完成后打开，配置 SDK。
3. **安装 Java JDK**: Android Studio 通常会自带，或者安装 JDK 17。

## 第一步：构建前端代码

在 `v2/frontend` 目录下运行：

```bash
npm run build
```

这将生成一个 `dist` 文件夹，里面是打包好的网页文件。

## 第二步：同步到原生工程

运行以下命令，将 `dist` 的内容复制到 Android 项目中：

```bash
npx cap add android  # 第一次运行时执行
npx cap sync         # 每次修改代码后执行
```

## 第三步：使用 Android Studio 打包

1. 运行命令打开 Android Studio：

   ```bash
   npx cap open android
   ```

2. 等待 Android Studio 加载项目（第一次可能需要下载很多依赖，看右下角的进度条，耐心等待）。
3. **修改 App 图标和名称** (可选):
   - 在 `app/src/main/res` 目录下替换图标。
   - 在 `strings.xml` 中修改应用名称。
4. **测试运行**:
   - 连接你的安卓手机 (开启开发者模式 -> USB调试)。
   - 点击顶部绿色的 ▶️ 运行按钮。
5. **生成 APK 安装包**:
   - 菜单栏 -> **Build** -> **Generate Signed Bundle / APK**.
   - 选择 **APK** -> Next.
   - 创建一个新的 Key store (密钥库)，记住密码。
   - 选择 Release 版。
   - 完成后，在 `android/app/release` 目录下就能找到 `.apk` 文件了。

## 常见问题

### 1. 手机上显示 "无法连接服务器"

这是因为 App 运行在手机上，而 PocketBase 运行在你的电脑或服务器上。

- **正式发布（推荐）**：打包前用环境变量指定 PocketBase 地址（避免每次改代码）：
  - Windows（PowerShell）示例：

    ```bash
    setx VITE_PB_URL "http://<YOUR_PB_HOST>:8090"
    ```

    重新打开终端后执行：

    ```bash
    cd v2/frontend
    npm run build
    npx cap sync
    ```

- **本地调试**：手机和电脑连同一个 WiFi 时，可临时设置为电脑的局域网 IP（如 `http://<YOUR_LAN_IP>:8090`），同理通过 `VITE_PB_URL` 来控制。

### 2. 允许 HTTP 请求

Android 9+ 默认禁止 HTTP (只允许 HTTPS)。如果你的服务器没有 SSL 证书，需要修改 `android/app/src/main/AndroidManifest.xml`:

在 `<application>` 标签里添加:

```xml
android:usesCleartextTraffic="true"
```

> 如果你的站点是 `http://<YOUR_DOMAIN>/login`（HTTP 模式），打包到手机时更容易遇到“明文 HTTP 被禁用”的问题，建议：
>
> - 要么给站点上 https + /pb 反代（最稳）
> - 要么按上面方式开启 cleartext（仅建议内测阶段使用）
