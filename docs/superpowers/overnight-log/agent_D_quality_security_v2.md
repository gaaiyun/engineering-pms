# Agent D — 代码质量 + 安全审计（v2）

审计范围：`frontend/src/**`, `frontend/android/app/src/main/java/com/engineering/pms/realtime/**`, `vite.config.ts`。
基线日期：2026-05-16。

---

## CRITICAL 安全问题（必修）

### C1. 第三方 API Key 明文存于 localStorage，且被多处读取（HIGH-CRITICAL）

**位置**：
- `frontend/src/pages/admin/AIConsole.tsx:42,47,119,261,266`
- `frontend/src/pages/ManagerDashboard.tsx:312`
- `frontend/src/pages/SettingsPage.tsx:65`

```ts
const [apiKey, setApiKey] = useState(localStorage.getItem('sf_api_key') || '')
...
onChange={v => { setApiKey(v); localStorage.setItem('sf_api_key', v) }}
```

**风险**：
- siliconflow API Key 以明文长期保存在 localStorage（无过期、无加密）。
- 一旦发生任何 XSS（哪怕是未来引入的依赖漏洞），密钥即被外泄；攻击者可代用户调用付费 LLM API，账单可能爆炸。
- 当前虽未发现 `dangerouslySetInnerHTML` / `eval` / 全局 `window.pb`，但前端是 React 19 + Capacitor WebView，未来引入新依赖时风险面会变化。

**修复建议**（按优先级）：
1. **最佳**：把 LLM 调用搬到 PocketBase 后端 hook，前端只发任务，密钥由服务端持有（环境变量）。
2. **过渡方案**：把密钥放到 `sessionStorage`（关浏览器即清），并加最低限度的混淆。
3. **最低限**：在 manager-only 角色检查通过前不允许读，且每次使用后立即清空 state 中的 plaintext。

---

### C2. "不勾选记住登录"时 token 仍残留在 localStorage（HIGH）

**位置**：`frontend/src/pages/Login.tsx:132-153`

```ts
if (!rememberMe) {
  localStorage.removeItem('pocketbase_auth')  // 登录前清
}

const authData = await pb.collection('users').authWithPassword(...)
// ↑ PB SDK 默认会再次写入 localStorage['pocketbase_auth']

if (rememberMe) {
  localStorage.setItem('savedUsername', ...)
} else {
  localStorage.removeItem('savedUsername')
  localStorage.removeItem('rememberMe')
  sessionStorage.setItem('pocketbase_auth', localStorage.getItem('pocketbase_auth') || '')
  // ⚠️ 复制完没有 localStorage.removeItem('pocketbase_auth')
}
```

**风险**：用户取消勾选"记住登录"，但 token 仍在 localStorage（跨浏览器会话保留）。设计意图明显是"关闭浏览器后清除"，实际未生效。

**修复**：在 sessionStorage 复制完成后，立即 `localStorage.removeItem('pocketbase_auth')`。或直接让 PB SDK 用 sessionStorage（配置 `authStore` storage）。

---

### C3. AIConsole 把"项目全量数据快照"写入数据库未脱敏（MED-HIGH）

**位置**：`frontend/src/pages/admin/AIConsole.tsx:165`

```ts
input_snapshot: JSON.stringify(data)  // 完整项目聚合
```

**风险**：`ai_summaries.input_snapshot` 包含全部项目、任务、成员信息。如该集合 ACL 配置不严（PB List/View rule 写错），其他用户/未授权用户可能读到敏感聚合。

**建议**：核实 `ai_summaries` collection 的 PB rule 是否限制 `target_user = @request.auth.id`；如未限制，立即在 PB Admin 后台补上。

---

## HIGH 内存泄漏 / 错误吞噬

### H1. audit_logs 创建静默吞噬错误（HIGH，合规风险）

**位置**：`frontend/src/lib/api.ts:447, 679` 及多处类似

```ts
await pb.collection('audit_logs').create({...}).catch(() => {})
```

**风险**：审计日志失败应当被记录或上报到 Sentry，而不是 silent fail。在合规审计场景中，"我们写了日志但写失败了"是关键证据丢失。

**修复**：
```ts
await pb.collection('audit_logs').create({...}).catch((e) => {
  console.error('[audit-log-fail]', e)  // 至少留个面包屑
  // 可选：上报到 Sentry / 后端 metric
})
```

注：业务侧的 `notifyProjectMembers(...).catch(() => {})` 等通知类静默吞噬是 acceptable（通知失败不应阻塞主流程）。但审计日志和数据库写入需要至少 log + 上报。

---

### H2. AIConsole `useEffect` 内 `aggregateProjectData()` 没有 cleanup（MED）

**位置**：`frontend/src/pages/admin/AIConsole.tsx:69`

```ts
aggregateProjectData().then(setStats).catch(console.error)
```

**风险**：组件卸载后 `setStats` 仍会被调用，触发 React 警告，但更重要的是若 `aggregateProjectData` 内部还在 `await` PocketBase 调用，会引用旧组件上下文。

**修复**：用 React Query 或 AbortController + ignore 标志。

---

### H3. Login 锁定计数器存于 localStorage，可绕过（LOW-MED）

**位置**：`frontend/src/pages/Login.tsx:46-77`

锁定/失败计数完全在客户端，devtools 一行 `localStorage.clear()` 即可绕过。已假定服务端有限流（PB 默认每 IP 限流），但若未配置，暴力破解只受网络往返时间限制。

**建议**：核实 PocketBase 实例是否启用 `--rateLimit`，或在 PB hook 中加 5 次失败锁账户的逻辑。

---

## MED 其他

### M1. PB filter 在 Register 中插入未转义用户输入（LOW）

**位置**：`frontend/src/pages/Register.tsx:50`

```ts
const tryName = suffix === 0 ? baseUsername : `${baseUsername}${suffix}`
const existing = await pb.collection('users').getList(1, 1, { filter: `username="${tryName}"` })
```

`tryName` 来自 `values.email.split('@')[0]` —— 若邮箱前缀含 `"`，filter 语法会被破坏。**不是 RCE**（PB 不暴露 SQL），最坏结果是查询失败/抛错，后续 `pb.collection('users').create` 会因唯一约束直接拒绝重复用户名，所以业务上有兜底。

**建议**：把用户名生成改为 `baseUsername.replace(/[^a-zA-Z0-9_-]/g, '')`，既修该问题又防止奇怪邮箱产生畸形用户名。

其他 16 处 `filter: \`...${id}\`` 全部使用 PB 自生成 ID（15 字符 base32），**没有用户可控注入风险**。

### M2. `pb_url` localStorage 覆盖（无校验）（LOW）

**位置**：`frontend/src/lib/pocketbase.ts:18`

若攻击者通过 XSS 写入 `localStorage['pb_url']`，则后续所有 PB 流量被劫持到攻击者域名。当前没有 UI 暴露写入，但建议加白名单（仅允许已知 IP/域名前缀），或仅在 dev build 启用。

### M3. console.info 输出 status 对象（LOW）

`frontend/src/lib/realtimeBridge.ts:102` 直接 `console.info('status', e)`，目前 status 不含 token，但建议白名单字段输出。

---

## Android 原生层风险

### A1. RealtimeService 字段非线程安全（HIGH，潜在崩溃）

**位置**：`frontend/android/app/src/main/java/com/engineering/pms/realtime/RealtimeService.java:67-72`

```java
private PbSseClient client;
private String currentBaseUrl;
private String currentToken;
private int businessNotifSerial = 0;
```

`onStartCommand`（Binder 线程）、`onDestroy`（主线程）、`onTimeout`（系统线程）、`onTaskRemoved`（主线程）都会读写这些字段。`UPDATE_TOKEN` 路径中：

```java
client.stop();
client = null;
startSseClient();  // 创建新 client
```

不是原子操作 —— 在并发 ACTION_UPDATE_TOKEN 调用下，两个线程可能同时进入此块，导致 `client.stop()` 被调两次或漏调。

**修复**：用 `synchronized(this)` 包住所有 `client` 读写，或将所有命令路由到单线程 HandlerThread。

### A2. PbSseClient `reconnectAttempts` 非 volatile（MED）

**位置**：`PbSseClient.java:69`

```java
private int reconnectAttempts = 0;
```

`scheduleReconnect` 在 OkHttp 工作线程调用，`reconnectNow()` 在外部调用（可能不同线程）。`reconnectAttempts++` 不是原子操作。最坏后果：重连计数偏差导致提前 `onPermanentFailure` 或推过 10 次上限。

**修复**：改成 `AtomicInteger`，或加 `volatile + synchronized`。

### A3. NetworkCallback 未 unregister 时序（LOW）

`onDestroy` 中调用 `unregisterNetworkCallback()`，但若 Service 通过 `stopSelf()` 在 `ACTION_STOP` 路径中销毁，`onDestroy` 仍会被调用 —— 此处实现 OK，没有泄漏。

### A4. WakeLock 缺失（INFO/LOW）

Foreground Service + SSE long-poll 模式下，Android 在 idle 时仍可能进入 Doze 切断网络。已通过 `setForegroundServiceType(DATA_SYNC)` 缓解，但建议在 SSE 重连时短暂持有 PARTIAL_WAKE_LOCK（< 1 分钟），提高弱网环境的重连成功率。

### A5. `submitSubscriptions` 失败后 EventSource 未取消（LOW-MED）

**位置**：`PbSseClient.java:176-191`

POST 订阅失败时 `scheduleReconnect`，但 `currentSource`（GET /api/realtime）仍在运行。`scheduleReconnect` → `connect()` 又会创建新 EventSource，旧的可能泄漏直至 OkHttp 自然超时。

**修复**：在 `scheduleReconnect` 开头 cancel `currentSource`。

---

## Bundle 优化建议（最高 ROI：路由级 React.lazy）

**当前状态**：
- `frontend/vite.config.ts` 完全没有 `manualChunks` 配置。
- `frontend/src/App.tsx:1-21` 所有 17 个页面（Login、Register、Home、AdminDashboard、DataImportCenter、TaskCreate、TaskDetail、ProjectTimeline、ProjectKanban、MyProjects、MyTasks、SettingsPage、Notifications、ReviewCenter、AIConsole 等）全部静态 import，无 `React.lazy`。
- bundle 1.55 MB / gzip 474 KB —— **绝大多数用户永远不进的页面也被打进首屏**：
  - `AdminDashboard` / `DataImportCenter` / `AIConsole` 仅 admin/manager 访问，应在 employee 端完全不加载。
  - `ProjectTimeline` 含 antd 复杂图表，体积大但只在项目详情页使用。
  - `ReviewCenter` 只 reviewer 进。

**最高 ROI 修复**：路由级懒加载，预估 **gzip 474 KB → 280-320 KB**（首屏减 30-40%）。

```tsx
// App.tsx
import React, { Suspense } from 'react'

const Login = React.lazy(() => import('./pages/Login'))
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'))
const AIConsole = React.lazy(() => import('./pages/admin/AIConsole'))
const DataImportCenter = React.lazy(() => import('./pages/admin/DataImportCenter'))
const ProjectTimeline = React.lazy(() => import('./pages/ProjectTimeline'))
const ReviewCenter = React.lazy(() => import('./pages/ReviewCenter'))
// ...保留 Login / Home 同步以避免首屏闪烁

<Suspense fallback={<div>Loading...</div>}>
  <Routes>...</Routes>
</Suspense>
```

**次优**：在 `vite.config.ts` 加 `build.rollupOptions.output.manualChunks`，把 antd-mobile、react-icons、tanstack-query 拆到独立 vendor chunk，方便 long-term caching。

---

## 总结

**关键发现**：
- **3 个 CRITICAL**：C1（API Key 明文 localStorage）、C2（无记住登录 token 残留）、C3（AI 输入快照可能未限 ACL）。
- **3 个 HIGH**：H1（audit_logs 静默吞噬错误）、A1（Android Service 字段非线程安全）、Bundle 优化（影响首次启动 + 流量）。
- **零** XSS / `dangerouslySetInnerHTML` / `eval` / `console.log(token)` —— 这部分代码卫生良好。
- **零** PB filter injection 可利用入口 —— 17 处模板字符串 filter 全部使用 PB 生成 ID，未用用户输入。

**建议修复顺序**（按 ROI）：
1. **C2（Login.tsx 一行修复）**：1 分钟，立刻消除"无记住登录"token 残留 → `localStorage.removeItem('pocketbase_auth')` 加到 152 行后。
2. **C1（AI Key 迁服务端）**：1-2 天，但风险面缩到 0。过渡期至少改成 sessionStorage（5 分钟）。
3. **A1（Android Service 加 synchronized）**：30 分钟，防止多线程 race 崩溃。
4. **Bundle React.lazy 路由级拆分**：1 小时，gzip 474 KB → ~300 KB，移动端首屏明显加速。
5. **H1（audit_logs 错误至少打 console.error）**：5 分钟，合规取证留痕。
