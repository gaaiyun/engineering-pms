# 通知系统 v3.0 架构（更新于 2026-05-16）

> **重大更新（PR 2，2026-05-16）**：本文档已根据"不引入 Firebase / FCM"决策**整体重写**。
>
> - 旧版（v2.x）基于 FCM HTTP v1 / APNs 的分发架构 — **已废弃**
> - 新版（v3.0+）基于 **PocketBase Realtime SSE + Android Foreground Service** — **当前实现**
>
> 原 FCM 设计的历史版本可在 git 历史中查看（`git log --diff-filter=D -- docs/notification-push-phase2.md`）。

---

## 1. 设计原则

- **不依赖 Firebase**：避免 google-services.json + Play 审核 + 国内 FCM 不稳的问题
- **依赖现成基础设施**：PocketBase 自带 Realtime SSE 已经可用，不引入新中间件
- **优雅降级**：SSE 失败 → 前台轮询补差；前台服务被杀 → 用户感知"被杀了"，下次开 app 自动恢复
- **三端一致**：Web、Android、iOS（未来）共享同一份"事件即真理"的语义

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                  PocketBase（事件源）                       │
│   notifications 集合 + onRealtimeConnectRequest hook        │
│   （idleTimeout=30min）                                     │
└────────────────────┬────────────────────────────────────────┘
                     │ SSE /api/realtime
        ┌────────────┴────────────┬─────────────────┐
        ▼                          ▼                 ▼
   Web 浏览器               Android 原生         iOS（未来）
   (foreground)            (前台/后台)
   pb.realtime.            ┌──────────────────┐
   subscribe()             │ RealtimeService  │
                           │ (Foreground SVC) │
                           │ dataSync type    │
                           │   ↓ 持有         │
                           │ PbSseClient      │
                           │ (OkHttp SSE)     │
                           │   ↓ 重连 1-30s   │
                           │   ↓ exponential  │
                           │      backoff     │
                           └────────┬─────────┘
                                    │ LocalBroadcast
                                    ▼
                           ┌──────────────────┐
                           │ RealtimePlugin   │
                           │ (Capacitor JS 桥)│
                           └────────┬─────────┘
                                    │ notifyListeners
                                    ▼
                           ┌──────────────────┐
                           │ realtimeBridge   │
                           │ + useNotification│
                           │   Alerts hook    │
                           └──────────────────┘
```

---

## 3. 客户端实现（Android）

### 3.1 进程内组件

| 组件 | 类 | 职责 |
|---|---|---|
| Foreground Service | `RealtimeService.java` | dataSync 类型；持有 PbSseClient；监听 ConnectivityManager；NetworkCallback；OOM 友好的持久通知（IMPORTANCE_LOW） |
| SSE 客户端 | `PbSseClient.java` | OkHttp 4.12 + okhttp-sse；readTimeout=0；指数退避重连 1/2/4/8/16/30s + ±20% jitter；最多 10 次失败后调 onPermanentFailure |
| Capacitor Plugin | `RealtimePlugin.java` | start / stop / updateToken；订阅 Service 的 LocalBroadcast 转 notifyListeners |

### 3.2 协议交互（详见 `docs/superpowers/research/2026-05-16-pr2-tech-reference.md` §1）

```
1) GET /api/realtime
   Headers: Authorization: <token>, Accept: text/event-stream
   → 服务端推 PB_CONNECT 事件含 clientId

2) POST /api/realtime
   Body: { clientId, subscriptions: ["notifications/*"] }
   → 服务端按订阅 push 业务事件

3) event: notifications/<id>
   data: { action: "create"|"update"|"delete", record: {...} }
```

### 3.3 生命周期（JS 端）

```typescript
// realtimeBridge.ts 单例
- pb.authStore.onChange → 登录态变化：
  - login    → Realtime.start({ baseUrl, token })
  - logout   → Realtime.stop()
  - 续 token → Realtime.updateToken({ token })  (避免重启 Service)

- 收 notification 事件 → invalidateNotificationQueries(queryClient, [userId])
  → useNotificationAlerts hook 触发 Toast/振动/声音/红闪/系统通知
```

### 3.4 Android Manifest 权限清单

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<service
    android:name=".realtime.RealtimeService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

---

## 4. 服务端配置

### 4.1 PocketBase hooks（必需）

`backend/pb_hooks/realtime.pb.js`：

```javascript
onRealtimeConnectRequest((e) => {
  e.idleTimeout = 30 * 60 * 1e9 // 30 minutes in nanoseconds
})
```

默认 5 分钟 idle 会导致移动端频繁重连。30 分钟是社区推荐的"既不打扰、又不囤 zombie"的值。

### 4.2 反向代理（如有）

Nginx 配置中 `/api/realtime` 必须独立 location 关闭 buffering 与延长 timeout：

```nginx
location /api/realtime {
  proxy_pass http://127.0.0.1:8090;
  proxy_buffering off;          # 必须！否则 SSE 不流式
  proxy_read_timeout 1h;        # 默认 60s 会切断 SSE
  proxy_send_timeout 1h;
}
```

Caddy / Traefik 用户：在 reverse_proxy 配置中加 `flush_interval -1`。

---

## 5. 边界场景与已知约束

### 5.1 国产 ROM 杀后台
**没有银弹**。详见 `docs/android-background-keepalive.md`。

- 原生 Android / Pixel：保活率 ~100%
- 三星：~90%（深度睡眠会断 ~10 分钟）
- 小米 / 华为 / OPPO / vivo：**必须用户手动加白名单 + 自启动**，否则 1-30 分钟内被冻结

### 5.2 Android 15 dataSync 6 小时上限
Service 实现了 `onTimeout` 回调：超时后 stopSelf + AlarmManager 15 分钟后唤醒。**用户每次打开 app 会重置计时器**。

### 5.3 Web 端
Web 浏览器使用 `pb.collection.subscribe`（PB JS SDK），生命周期跟随 tab。关闭 tab 即断开。**不做 Web Worker 后台保活** — 桌面端用户预期是"打开页面才收推送"。

### 5.4 网络抖动
- OkHttp 内置 `retryOnConnectionFailure(true)`
- 应用层：监听 `ConnectivityManager.NetworkCallback.onAvailable` → 调 `PbSseClient.reconnectNow()`
- 兜底：前台时 useNotificationAlerts 走 `useUnreadNotificationCount` 自动每 30s polling（PR 1 已实现）

### 5.5 token 过期
PB JS SDK 自动 refresh token。`pb.authStore.onChange` 触发后 `realtimeBridge` 调 `Realtime.updateToken` 让 Service 用新 token，不重启长连接。

---

## 6. 验证检查表

实机验证流程（详见 `docs/superpowers/manual-qa/2026-05-16-pr-1-and-pr-3-qa.md` 和 PR 2 即将补充的 qa 文档）：

- [ ] 安装 v2.98 APK，授予通知权限
- [ ] 登录后打开持久通知"消息接收中"
- [ ] 锁屏 30 min，让另一账号建任务 → 应收到通知
- [ ] 飞行模式 10 min → 恢复网络 → 应在 30 秒内补送
- [ ] 小米/华为真机 + 已加白名单：连续 8h 后台后仍能收
- [ ] 退出登录 → 持久通知消失、Service 停止

---

## 7. 未来扩展（v3.1+）

- **iOS 适配**：APNs + BGTask Framework（独立 spec，开发量约 PR 2 的 1.5 倍）
- **通知偏好 UI**：用户可设置"全开 / 仅振动 / 关闭"per 业务类型
- **离线消息箱**：SSE 断开期间用 IndexedDB 缓存差集
- **多设备并发**：device_tokens 表已支持，未来分发器可针对每个设备发不同体验（如只在最近活跃设备响铃）

---

## 8. 关键文件索引

| 文件 | 说明 |
|---|---|
| `frontend/android/app/src/main/java/com/engineering/pms/realtime/PbSseClient.java` | SSE 客户端 |
| `frontend/android/app/src/main/java/com/engineering/pms/realtime/RealtimeService.java` | 前台服务 |
| `frontend/android/app/src/main/java/com/engineering/pms/realtime/RealtimePlugin.java` | Capacitor plugin |
| `frontend/android/app/src/main/AndroidManifest.xml` | 权限 + service 声明 |
| `frontend/src/native/realtime.ts` | TS plugin 定义 |
| `frontend/src/lib/realtimeBridge.ts` | React 集成桥 |
| `frontend/src/App.tsx` | RealtimeBridgeProvider 挂载点 |
| `backend/pb_hooks/realtime.pb.js` | idleTimeout=30min |
| `docs/superpowers/research/2026-05-16-pr2-tech-reference.md` | 调研全文 |
| `docs/android-background-keepalive.md` | OEM 保活引导 |
