# 📱 v3.04 APK 验证手册

**APK：** `EngineeringPMS_v3.04_production_ready.apk`（6.94 MB）
**versionCode：** 44
**versionName：** 3.04
**包含累计成果：** 57 commits（自 v2.96 起夜间所有修复 + 实测验证 + C1/C2/J-2 终极方案）

---

## 安装步骤

### 方式 1：USB 直传
1. 手机用 USB 连电脑 → 选"文件传输"模式
2. 把 `EngineeringPMS_v3.04_production_ready.apk` 拖到手机 Download 目录
3. 手机文件管理器 → Download → 点 APK → 安装

### 方式 2：微信发送
1. 把 APK 发到 "文件传输助手"
2. 手机微信打开 → 点 APK → 用浏览器/文件管理器打开 → 安装

### 方式 3：扫码下载（推荐发员工）
把 APK 上传到 Nginx 静态目录，然后生成下载链接的二维码，员工微信扫码即可。
```bash
# 服务器：
cp deploy/v3.04_*/EngineeringPMS_v3.04_production_ready.apk /www/wwwroot/project_v2/download/
# 链接：http://你的域名/download/EngineeringPMS_v3.04_production_ready.apk
```

### 首次安装时手机会问的事
- 「未知来源应用」→ 允许（设置 → 应用 → 默认应用 → 不安全的应用安装权限）
- 「应用要求权限」→ 同意（通知 / 振动 / 网络 / 唤醒锁 / 前台服务）
- 启动后第一次弹窗 → 允许通知 + 允许后台运行

---

## ✅ 验证 Checklist（共 15 项）

### A. 基础启动（必须全过）
- [ ] 打开 app 看到登录页（绿色"服务器已连接"勾）
- [ ] 用 `zhang_manager / 12345678` 登录成功
- [ ] manager 角色默认进 `/admin` 工作台 5 Tab
- [ ] 退出登录回到 `/login` 页

### B. PR 1 通知主链路（前台收消息）
- [ ] 让另一手机/电脑用别的账号给你的账号发任务
- [ ] 你的 app 顶部出现红色 Toast "收到 N 条新消息"
- [ ] 手机振动两阵
- [ ] 听到三音调提示音（如设备未静音）
- [ ] 全屏红色边框闪烁 2.8 秒
- [ ] 通知 Tab 红点数加 1

### C. PR 2 后台保活（核心功能验证）
- [ ] 登录后通知栏出现持久通知 **"工程结算管理 · 消息接收中"**
- [ ] 按 Home 键回桌面 5 分钟后再让别人发任务 → 应在 30 秒内收到通知栏推送（不需要打开 app）
- [ ] 长按持久通知 → 看到来自 "EngineeringPMS" + 渠道名 "后台保活"
- [ ] 锁屏 30 分钟 → 再让别人发任务 → 仍能收到通知

**如果收不到后台推送：**
1. 设置 → 应用 → EngineeringPMS → 电池 → 不限制（白名单）
2. 设置 → 应用 → EngineeringPMS → 自启动 → 允许（华为/小米/OPPO/vivo 必做）
3. 详细见 `docs/android-background-keepalive.md`

### D. PR 3 + PR 4 桌面 UI（如果在大屏平板/横屏使用）
- [ ] 横屏（如 768+px 宽）时仍能正常显示
- [ ] 经理 `/my-tasks` 页面看到表格视图（5 列序号/标题/项目/状态/截止日）
- [ ] 勾选任一行 checkbox → 底部出现"已选 1 项 / 标记完成 / 删除"工具栏

### E. PR 5 看板拖拽
- [ ] 进入任一项目 → 看板视图（5 列：待开始/进行中/卡点/已逾期/已完成）
- [ ] 长按 + 拖动一个任务卡片到另一列 → 状态自动变更 + 看到"状态已更新"Toast

### F. C2 HybridAuthStore 验证（不强求）
- [ ] 登录时**勾选"记住登录"** → 关闭 app → 重启 → 仍是登录状态
- [ ] 登录时**取消勾选** → 关闭 app（kill）→ 重启 → 跳回 `/login`（token 已被清）

### G. 错误处理（E1）
- [ ] 关闭服务器或断网 → 在 app 内任意操作 → 应弹 "服务器连接失败，请检查网络后重试" Toast（不再静默白屏）

---

## 🚨 如果某项失败

| 现象 | 检查 |
|---|---|
| 登录"服务器未连接" | `frontend/src/lib/pocketbase.ts:4` 的 `PRODUCTION_PB_URL` 是否对得上你的服务器 IP；阿里云安全组放行 8090 |
| 后台 5 min 就收不到推送 | 加电池白名单 + 自启动权限；查 adb logcat 看 `RealtimeService` 是否被杀 |
| 横屏看不到表格 | 横屏 viewport ≥1024px 才会切表格；767-1024 是平板 Sidebar 折叠模式 |
| 拖拽不响应 | 长按 500ms 才触发（防误触）；如果还不行查角色权限 — 只有 manager+admin 能拖 |

---

## 📋 已知限制（v3.04 不在保修范围）

1. **iOS 不支持** — 后台推送 iOS 需要 APNs，未实现
2. **多设备同步红点** — 同一账号在多个手机/浏览器上的红点数不会双向同步（PB Realtime 是事件流，多端各自计数）
3. **离线模式** — 必须有网才能用。完全离线场景需要 IndexedDB 缓存层（未实现）
4. **AI 功能需服务端配置** — 装完 APK 后 AI 功能"未配置 API Key"是正常的，需要在 PB Admin 后台 `app_settings` collection 添加 `siliconflow_api_key`（详见部署指南）

---

## 完整版本号信息

```
applicationId: com.engineering.pms
versionCode: 44
versionName: 3.04
target SDK: 33
min SDK: 22 (Android 5.1+)
APK size: 6.94 MB
```

**Commit ID（自夜间起点 e24c69c）：** 见 `git log --oneline e24c69c..HEAD` 共 57+ commits。
