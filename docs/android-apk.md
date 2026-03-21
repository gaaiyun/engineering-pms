# Android APK 构建说明

## 日常分发给手机安装（推荐）

未配置 release 签名时，**不要**依赖 `assembleRelease`：产物常为未签名包，安装时可能出现「解析软件包失败 / packageInfo is null」等错误。

使用 **Debug 构建**（自带 debug 签名，可直接安装）：

```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

Windows（PowerShell）也可用仓库脚本：

```powershell
cd frontend
.\scripts\build-debug-apk.ps1
```

安装包路径：

`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

可复制并重命名为带版本号的文件名后分发。

## Release 构建（可选）

1. 在 `frontend/android/` 下复制 `keystore.properties.example` 为 `keystore.properties`，填写真实 keystore 路径与口令（**勿提交** `keystore.properties` 与 `.jks` 到 git）。
2. 执行：

```bash
cd frontend/android
./gradlew assembleRelease
```

已签名产物一般在：`app/build/outputs/apk/release/app-release.apk`。

## 与 PocketBase 迁移

Web/App 功能依赖服务端 schema；部署新前端前请在 PocketBase 服务器执行迁移，至少包含：

- `audit_logs`：`review_status` 含 `rejected`、`reject_note` 字段（如 `1772400000_*.js`）
- `notifications.type` 含 `audit_rejected`（如 `1772500000_*.js`，否则拒绝复核后给操作人的通知可能创建失败）

否则「审核拒绝」或消息链路仍可能在服务端失败。

**生产库（如 127.0.0.1）如何执行这两步**：见 [pocketbase-apply-migrations-production.md](./pocketbase-apply-migrations-production.md)。
