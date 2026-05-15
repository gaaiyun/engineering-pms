# 👋 早上好 — 看这一份就够了

夜间自动化完成的内容总览（2026-05-16 凌晨）。

## ✅ 已完成的 5 个 PR + 文档

| PR | 内容 | APK | 状态 |
|---|---|---|---|
| **PR 1** | 通知一期收尾（统一全局 hook） | `EngineeringPMS_v2.97_notification_consolidated.apk` | ✅ commit + push |
| **PR 2** | Android 前台服务 + PocketBase Realtime SSE 长连（**不用 Firebase**） | `EngineeringPMS_v2.98_sse_foreground_service.apk` | ✅ commit + push |
| **PR 3** | 响应式 AppShell（桌面 Sidebar+顶栏） | 含在 v2.97 / v2.98 | ✅ commit + push |
| **PR 4** | 桌面任务表格 + 批量操作 | 含在 v2.97 / v2.98 | ✅ commit + push |
| **PR 5** | 看板桌面体验 + 拖拽脉冲动画 | 含在 v2.97 / v2.98 | ✅ commit + push |
| **PR 6** | 文档收尾（架构图 + 11 家 ROM 保活引导 + changelog + README） | — | ✅ commit + push |

GitHub 仓库（私有）：https://github.com/gaaiyun/engineering-pms
最近一次 push：见 `git log --oneline -20`。

---

## 🚦 你接下来做什么

### 1. 浏览器验证（5 分钟）
```bash
cd "G:/项目管理软件_v2/frontend" && npm run dev
# 另一终端
cd "G:/项目管理软件_v2/backend" && ./pocketbase.exe serve
```
浏览器开 http://localhost:5173 → 登录 → 检查：
- [ ] 桌面 ≥1024px 看到 Sidebar + 顶栏（PR 3）
- [ ] 我的任务里看到表格视图 + 多选 + 批量按钮（PR 4）
- [ ] 进入项目看板，拖任务到另一列看到呼吸光晕（PR 5）

详细清单：[docs/superpowers/manual-qa/2026-05-16-pr-1-and-pr-3-qa.md](./docs/superpowers/manual-qa/2026-05-16-pr-1-and-pr-3-qa.md) 和 [docs/superpowers/manual-qa/2026-05-16-pr-2-4-5-qa.md](./docs/superpowers/manual-qa/2026-05-16-pr-2-4-5-qa.md)。

### 2. 手机真机验证（30 分钟）
**这是最重要的**，PR 2 我无法自动化测（无 device）。

1. 把 `EngineeringPMS_v2.98_sse_foreground_service.apk` 装到真机
2. 按 [docs/android-background-keepalive.md](./docs/android-background-keepalive.md) 给你的 ROM 加电池白名单 + 自启动（**重要**，国产 ROM 不加白名单会被杀）
3. 登录后看到持久通知 "工程结算管理 · 消息接收中"
4. 锁屏 30 分钟 → 让另一账号建任务 → 应在 30 秒内收到推送

如果**没收到**：
- 持久通知还在 → 加更深的白名单（华为/小米要进 i 管家 / 手机管家 二次设置）
- 持久通知消失 → Service 被杀，加电池白名单等级
- 详细排查：QA checklist 末尾"失败处理"表

### 3. 服务端配置（如果用了 Nginx 反代 PocketBase）
确保 `/api/realtime` 路由有：
```nginx
proxy_buffering off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
```
否则 Nginx 60s 默认 timeout 会切断 SSE。**自建 PB 直连可跳过这步**。

---

## 📂 重要文件索引

### 设计 / 计划
- **总设计**：[docs/superpowers/specs/2026-05-16-pms-notification-and-desktop-design.md](./docs/superpowers/specs/2026-05-16-pms-notification-and-desktop-design.md)
- **PR plans**：[docs/superpowers/plans/](./docs/superpowers/plans/)（6 份）
- **v3.0 changelog**：[docs/v3.0-changelog.md](./docs/v3.0-changelog.md)

### 调研报告（很有信息量，建议至少扫一眼）
- **GitHub PM 项目调研**：[docs/superpowers/research/2026-05-16-github-search-results.md](./docs/superpowers/research/2026-05-16-github-search-results.md)
  - **5⭐ 推荐**：SVAR React Gantt（MIT, React 19, 153⭐）能替代我们 667 行自研甘特，省 3-4 周
  - 关键空集确认：PocketBase 生态没有现成的完整 PM 项目，**我们做的是这条赛道的早期玩家**
- **PR 2 技术参考**：[docs/superpowers/research/2026-05-16-pr2-tech-reference.md](./docs/superpowers/research/2026-05-16-pr2-tech-reference.md)
  - PB Realtime SSE 协议 + FGS 类型选择 + OkHttp SSE 实现 + Capacitor plugin 骨架 + 12 家 OEM ComponentName 表

### 用户文档
- **架构总览**：[docs/notification-push-phase2.md](./docs/notification-push-phase2.md)（已重写 v3.0）
- **OEM 保活引导**：[docs/android-background-keepalive.md](./docs/android-background-keepalive.md)（11 家 ROM）

---

## 🛠 技术债 / 待办（v3.1+）

按优先级：
1. **真机验证 PR 2 后台推送** — 你今早做
2. **Lint 128 errors 全是 `any` 类型** — 单独 PR 清理（与本次改造无关）
3. **Bundle 1.55MB 警告** — 加 code splitting / manualChunks
4. **SVAR React Gantt 替换 ProjectTimeline** — 调研已说明，等你决定要不要做
5. **iOS APNs 适配** — 独立 spec，工作量大
6. **通知偏好 UI**（全开/仅振动/关闭） — v3.1
7. **国产 ROM 自动诊断按钮**（检测电池白名单状态） — 设置页加入口

---

## 📊 自动化指标

- npm test：**132/132 全绿**（+17 新增）
- tsc -b：**0 errors**
- gradle assembleDebug：**编译通过**
- 自动化 commit：**17+ 个**
- Push 到 origin/main：**全部成功**

---

## 🔧 用到的工具链

按 superpowers 方法论严格执行：
1. `brainstorming` skill → 出 master spec
2. `writing-plans` skill → 每个 PR 一份 plan
3. `executing-plans` skill → inline 执行 + 频繁 commit
4. `verification-before-completion` 隐含约束 → 每步 lint+tsc+test+build 才 commit
5. `dispatching-parallel-agents` → 后台 2 个 research agent + 后台 gradle build

Skills 通过 Windows junction 链接到 ~/.claude/skills/，重启 Claude Code 后仍可用。
