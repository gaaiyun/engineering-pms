# PR 2 技术参考手册 —— Android 前台服务 + PocketBase Realtime SSE

> 调研日期：2026-05-16
> 目标：让 EngineeringPMS 安卓端在后台/锁屏下能收到通知，**完全不用 Firebase/FCM**
> 路线：Android Foreground Service 保活 OkHttp SSE 长连接订阅 PocketBase `/api/realtime`
> 调研边界：WebFetch + WebSearch 共 ~14 次（远低于 60 次预算）；每个技术点均做了 ≥2 源交叉验证

---

## 1. PocketBase Realtime API 细节

### TL;DR
PB Realtime 是 **HTTP SSE**（不是 WebSocket）；`GET /api/realtime` 建连拿 `clientId`，再 `POST /api/realtime` 提交订阅列表；鉴权用普通 `Authorization: <token>` 头；**默认 5 分钟无消息服务端会主动断开**（可在 hooks 里配置 `idleTimeout`）；不原生支持 `Last-Event-ID` 断点续传，需 client 重连后客户端用业务字段对齐。

### 关键参考
- [PocketBase Docs — API Realtime](https://pocketbase.io/docs/api-realtime/) — 协议层面定义
- [Discussion #3054 "How do you keep the SSE connection open longer than 5 mins?"](https://github.com/pocketbase/pocketbase/discussions/3054) — 5 分钟 idle timeout 的官方解释 + `onRealtimeConnectRequest` hook 调整方法（v0.17.2+ 引入）
- [Discussion #2323 "Realtime API lost connection"](https://github.com/pocketbase/pocketbase/discussions/2323) — 反向代理超时也会引起断开
- [Discussion #4639 "How to detect SSE connection lost in dart"](https://github.com/pocketbase/pocketbase/discussions/4639) — 推荐订阅虚拟主题 `PB_CONNECT` 监测重连
- [PocketBase JS SDK README](https://github.com/pocketbase/js-sdk) — `pb.collection(...).subscribe(topic, callback)` API

### 协议格式（按官方文档）

**Step 1 — 建立 SSE 流：**
```
GET /api/realtime HTTP/1.1
Accept: text/event-stream
Authorization: <user_or_admin_token>     # 可选；首条订阅请求设置即可
```
服务端立即推一个 `PB_CONNECT` 事件，data 体含 `{ "clientId": "<uuid>" }`。

**Step 2 — 订阅（HTTP POST，与 SSE 流独立的请求）：**
```
POST /api/realtime HTTP/1.1
Authorization: <token>
Content-Type: application/json

{
  "clientId": "<from PB_CONNECT>",
  "subscriptions": [
    "notifications/*",
    "notifications/RECORD_ID",
    "messages/*?options={\"query\":{\"abc\":\"123\"}}"
  ]
}
```

**Step 3 — 服务端按订阅 push 事件：**
```
event: notifications/RECORDID
data: {"action":"create","record":{...}}
```
客户端 SDK 把它转成回调：`{ action: 'create'|'update'|'delete', record: {...} }`。

### 代码骨架（JS SDK，参考用，Android Kotlin 见 §3）
```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://pb.example.com');
await pb.collection('users').authWithPassword(email, password);

// 主动监测重连（任何 reconnect 之后回调都会被触发一次）
pb.realtime.subscribe('PB_CONNECT', (e) => {
  console.log('connected, clientId =', pb.realtime.clientId);
});

// 订阅业务数据
const unsubscribe = await pb.collection('notifications').subscribe(
  '*',
  (e) => handle(e.action, e.record),
);
```

### 坑点 & 注意事项
- **5 分钟 idle timeout 是硬约束**：服务端没有 ping 帧；如果 5 分钟内业务无任何 event，连接被 server 端关闭。SDK 会**自动重连**，但移动场景下重连过程中漏的事件需业务自己用 `updated > lastSeenAt` 补偿。
- **服务端调长 idleTimeout（推荐）**：在 PB hooks（`pb_hooks/*.pb.js`）里：
  ```js
  onRealtimeConnectRequest((e) => { e.idleTimeout = 30 * 60 * 1e9; }); // 30 分钟（纳秒）
  ```
  调到 30 分钟可大幅降低重连频率，但**不可设无限**（会留 zombie 连接，作者明确反对）。
- **Topic filter（`?options={...}`）只是把额外参数传到 collection 的 List/View Rule 表达式里**，**不是** SQL filter；服务端鉴权依然走 ListRule/ViewRule。要做"只推自己的消息"，应在 collection rules 里写 `user = @request.auth.id`，subscribe `notifications/*` 即可，PB 会自动按当前 token 做行级过滤。
- **没有原生 Last-Event-ID**：协议层不带 `id:` 字段。断网重连后客户端必须自己拉一次 `GET /api/collections/notifications/records?filter=updated>{lastSeen}` 补差。
- **反向代理超时**：Nginx 默认 `proxy_read_timeout 60s` 会先于 PB 的 5 分钟切断。部署时必须设：
  ```nginx
  location /api/realtime {
    proxy_buffering off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
  }
  ```
- **v0.22 vs 最新（0.23/0.24）**：0.17.2 已引入 `idleTimeout` 可配置；0.22 协议层稳定，对外行为与最新版一致。**0.22 的 `pb_hooks` 已支持 JS hooks**，迁移到新版前不需要协议级改造。

### 决策建议（针对我们项目）
1. **Android 端走原生 OkHttp SSE，不用 JS SDK**（避免 WebView 后台被冻结）；通过手写 POST `/api/realtime` 实现订阅。
2. **PB 端调 `idleTimeout` 到 10–30 分钟**（hooks 一行配置），降低移动端重连频率与流量。
3. **行级权限走 ListRule**，订阅时只写 `notifications/*`，不依赖 `?options={...}` 做过滤。
4. **每次重连后由客户端拉一次"未读差集"**（`updated > localLastSeenAt`）作为兜底。

---

## 2. Android Foreground Service（API 26-35）最佳实践

### TL;DR
Android 14（API 34）起必须**声明 `foregroundServiceType` + 对应权限**；我们的场景应选 **`dataSync`** 类型，但要承受 **Android 15 (API 35) 起 6 小时/24 小时的硬上限**——必须配合 `onTimeout()` + WorkManager 周期唤醒，或在用户重新打开 app 时复位计时器。Android 12+ 默认禁止从后台启动前台服务，必须通过 `BOOT_COMPLETED` / 用户点 notification / 电池白名单 等 11 种豁免之一启动。

### 关键参考
- [Foreground services overview](https://developer.android.com/develop/background-work/services/fgs)
- [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) — 14 种类型完整列表（含 dataSync 的运行时前置条件 = 无）
- [Service timeout (Android 15)](https://developer.android.com/develop/background-work/services/fgs/timeout) — 6 小时/24 小时上限的精确语义
- [Restrictions on starting from background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) — 11 类豁免清单
- Android 16 (2025 稳定) 进一步强制 type 匹配，否则崩溃（搜索引擎结果）

### Manifest 权限清单
```xml
<!-- 通用 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.INTERNET" />
<!-- 跨厂商电池白名单引导用，不一定授予 -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

<application>
  <service
      android:name=".RealtimeService"
      android:exported="false"
      android:foregroundServiceType="dataSync" />

  <receiver
      android:name=".BootReceiver"
      android:exported="true">
    <intent-filter>
      <action android:name="android.intent.action.BOOT_COMPLETED" />
      <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
    </intent-filter>
  </receiver>
</application>
```

### Service 骨架（处理 Android 15 onTimeout）
```kotlin
class RealtimeService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY
    }
    val notif = buildOngoingNotification()  // channel importance = LOW, ongoing=true
    startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    connectSse()  // 见 §3
    return START_STICKY
  }

  // Android 15+ dataSync 6 小时超时
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()  // 必须几秒内停掉，否则系统抛 RemoteServiceException
    scheduleWorkManagerWakeup()  // 用 WorkManager 在 15 分钟后试图重启
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // 用户从最近任务划掉时，Android 8+ 会停掉 FGS；我们用 alarm 重启自己
    val pi = PendingIntent.getService(this, 0,
        Intent(this, RealtimeService::class.java),
        PendingIntent.FLAG_IMMUTABLE)
    getSystemService(AlarmManager::class.java)
        .set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime()+1000, pi)
  }
}
```

### 坑点 & 注意事项
- **Android 15 的 6 小时是 dataSync 整个 app 的总和**，多个 dataSync service 共享配额。计时器在 app **进入前台时重置**——意味着用户每次打开 app，timer 复位。
- **`shortService`（3 分钟）和 `specialUse` 不适合我们**：shortService 太短；specialUse 需要 Play Console 审核（说明用途）。
- **`dataSync` vs `specialUse` 的取舍**：`dataSync` 在 Android 15 受 6 小时限制，但权限简单；`specialUse` 不受 6 小时限制但需要在 manifest 声明 subtype 并提交 Play 审核理由。**国内分发场景（华为/小米应用市场）也对 `specialUse` 不友好**。**推荐先用 `dataSync`，被 timeout 命中靠 WorkManager 唤醒。**
- **后台启动豁免我们能用的**：① `BOOT_COMPLETED`（开机自启）② 用户点持久通知 ③ 用户已加入电池白名单 ④ exact alarm 唤醒。**不能用 FCM 高优先级**——那需要 Firebase。
- **WakeLock 不要常驻**：FGS 自带 partial wake lock 等价物（CPU 不睡）；不要再额外 `WakeLock.acquire()`，只在收到事件需要做 IO 时短暂获取。
- **Notification Channel**：用 `IMPORTANCE_LOW`（无声）做持久通知，避免常驻打扰；真正的业务通知用 `IMPORTANCE_HIGH` 单独频道。

### 决策建议（针对我们项目）
1. **类型选 `dataSync`**，承认 6 小时上限是常态约束；不去走 `specialUse` 审核路径。
2. **不去做 `onTaskRemoved` 后立刻重启自己**（这种小动作在国产 ROM 上无效，反而耗电）；让用户感知"被杀了"靠下次开 app 自动恢复 + 退出登录前必须 stop。
3. **持久通知用 IMPORTANCE_LOW** + 文案"消息接收中（点击打开）"。
4. **BootReceiver 仅在已登录 + 用户开过电池白名单提示 后才启动 service**，避免给未登录用户造成耗电。

---

## 3. OkHttp SSE 客户端

### TL;DR
Android 端用 **Square 官方 `com.squareup.okhttp3:okhttp-sse`**（小、与 okhttp 同进程，与 Capacitor WebView 网络栈无冲突）；**它本身不做自动重连**，需要在 `onFailure()` / `onClosed()` 里手写指数退避重连；`readTimeout` 必须设 0（无限），并要手动维护 `Last-Event-ID`（虽然 PB 不发 id，仍可作为 idempotency 兜底）。

### 关键参考
- [Square OkHttp `okhttp-sse` 模块源码](https://github.com/square/okhttp/tree/master/okhttp-sse) — 官方 SSE 实现，标 Experimental 但已稳定多年
- [`EventSourceListener` Kotlin 源](https://github.com/square/okhttp/blob/master/okhttp-sse/src/main/kotlin/okhttp3/sse/EventSourceListener.kt) — 4 个回调 onOpen/onEvent/onClosed/onFailure
- [Issue #5471 "Auto reconnect sse like browser does"](https://github.com/square/okhttp/issues/5471) — 官方确认**不自动重连**，需用户层实现
- [LaunchDarkly okhttp-eventsource](https://github.com/launchdarkly/okhttp-eventsource) — 替代库，自带 backoff + jitter；但多 30KB 体积、API 不同

### 依赖
```gradle
implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")
```
（okhttp 5.x 已 GA，但与 Capacitor 5 的 minSdk 24 配合 4.12 更稳。）

### 代码骨架
```kotlin
class PbSseClient(
    private val baseUrl: String,
    private val token: () -> String,
    private val onEvent: (action: String, record: JsonObject) -> Unit,
) {
  private val client = OkHttpClient.Builder()
      .readTimeout(0, TimeUnit.MILLISECONDS)     // 关键：SSE 不允许 read timeout
      .connectTimeout(15, TimeUnit.SECONDS)
      .pingInterval(0, TimeUnit.SECONDS)         // SSE 不用 ping
      .retryOnConnectionFailure(true)
      .build()

  private var source: EventSource? = null
  private var clientId: String? = null
  private var backoffSec = 1L

  fun start() {
    val req = Request.Builder()
        .url("$baseUrl/api/realtime")
        .header("Accept", "text/event-stream")
        .header("Authorization", token())
        .build()
    source = EventSources.createFactory(client).newEventSource(req, listener)
  }

  fun stop() { source?.cancel(); source = null }

  private val listener = object : EventSourceListener() {
    override fun onOpen(es: EventSource, response: Response) { backoffSec = 1 }

    override fun onEvent(es: EventSource, id: String?, type: String?, data: String) {
      val json = JsonParser.parseString(data).asJsonObject
      if (type == "PB_CONNECT") {
        clientId = json["clientId"].asString
        submitSubscriptions()                    // POST /api/realtime
      } else {
        onEvent(json["action"].asString, json["record"].asJsonObject)
      }
    }

    override fun onClosed(es: EventSource) { scheduleReconnect() }
    override fun onFailure(es: EventSource, t: Throwable?, r: Response?) { scheduleReconnect() }
  }

  private fun scheduleReconnect() {
    val delay = backoffSec
    backoffSec = (backoffSec * 2).coerceAtMost(30)
    Handler(Looper.getMainLooper()).postDelayed({ start() }, delay * 1000)
  }
}
```

### 坑点 & 注意事项
- **`readTimeout` 必须 0**：默认 10 秒会让 SSE 流被认为 idle 而断开。
- **OkHttp 不解析 SSE 的 `id:` 字段为 last-event-id 自动重发**——但 `onEvent` 的 `id` 参数会传给你，业务自己存即可。PB 没发 id，所以这条不重要。
- **网络切换（WiFi↔4G）**：OkHttp 的连接池会感知到 `EHOSTUNREACH`，触发 `onFailure`；走我们自己的 backoff 即可。**建议额外注册 `ConnectivityManager.NetworkCallback`，网络可用瞬间立刻重连（不等 backoff）**。
- **TLS**：PB 默认 Let's Encrypt 证书 OK；自签证书时需 `OkHttpClient.Builder().sslSocketFactory(...).hostnameVerifier(...)`。
- **指数退避建议**：1s → 2s → 4s → 8s → 16s → 30s 上限；外加 ±20% jitter 避免雪崩。
- **后台线程**：OkHttp EventSource 回调在 OkHttp dispatcher 线程，不要直接 UI；进 Service 的 Handler 或 coroutine。

### 决策建议（针对我们项目）
1. **采用 Square okhttp-sse 而非 LaunchDarkly 库**——后者 backoff 不可定制、版本依赖陈旧、与项目 OkHttp 4.12 易冲突。
2. **重连策略自写**：1s/2s/4s/8s/16s/30s + jitter；外加 NetworkCallback 触发即时重连。
3. **不用 `Last-Event-ID`**：依靠重连后业务侧拉差集补漏（见 §1）。

---

## 4. Capacitor 5.x 自定义 Plugin

### TL;DR
最小骨架：① 一个 `@CapacitorPlugin(name="RealtimeService")` 注解的 Java 类继承 `Plugin`，② 在 `MainActivity.onCreate()` 里 `registerPlugin(...)` ③ TS 端 `registerPlugin('RealtimeService')` 拿到代理对象 ④ Java 用 `notifyListeners("event", data)` 推事件给 JS。**Capacitor 5 plugin lifecycle 跟随 Activity，不跟 Service**——所以 Service 必须独立运行，plugin 只负责 start/stop/订阅事件转发。

### 关键参考
- [Creating Capacitor Plugins](https://capacitorjs.com/docs/plugins/creating-plugins) — 总览
- [Capacitor v5 Android Plugin Guide](https://capacitorjs.com/docs/v5/plugins/android) — `@CapacitorPlugin` + `@PluginMethod` + `notifyListeners`
- [Saving Plugin Calls](https://capacitorjs.com/docs/v5/core-apis/saving-calls) — `call.setKeepAlive(true)` 用于流式回调

### 代码骨架

**Android — `RealtimePlugin.java`：**
```java
@CapacitorPlugin(name = "Realtime")
public class RealtimePlugin extends Plugin {

  @PluginMethod
  public void start(PluginCall call) {
    String baseUrl = call.getString("baseUrl");
    String token   = call.getString("token");
    Intent svc = new Intent(getContext(), RealtimeService.class)
        .putExtra("baseUrl", baseUrl).putExtra("token", token);
    ContextCompat.startForegroundService(getContext(), svc);
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getContext().stopService(new Intent(getContext(), RealtimeService.class));
    call.resolve();
  }

  // Service 通过 LocalBroadcast 推过来，转给 JS
  private final BroadcastReceiver receiver = new BroadcastReceiver() {
    @Override public void onReceive(Context c, Intent i) {
      JSObject data = new JSObject();
      data.put("action", i.getStringExtra("action"));
      data.put("record", i.getStringExtra("recordJson"));
      notifyListeners("notification", data);
    }
  };

  @Override public void load() {
    LocalBroadcastManager.getInstance(getContext())
        .registerReceiver(receiver, new IntentFilter("PB_SSE_EVENT"));
  }
}
```

**`MainActivity.java`：**
```java
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle s) {
    registerPlugin(RealtimePlugin.class);
    super.onCreate(s);
  }
}
```

**TS — `realtime.ts`：**
```typescript
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface RealtimePlugin {
  start(opts: { baseUrl: string; token: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'notification',
    cb: (e: { action: string; record: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const Realtime = registerPlugin<RealtimePlugin>('Realtime');
```

### 坑点 & 注意事项
- **Plugin lifecycle ≠ Service lifecycle**：Activity 被销毁时 Plugin 实例也销毁；Service 必须能独立活下去；通过 LocalBroadcast / 静态单例 / Bound Service 通信，**不要在 Plugin 持有 Service 引用**。
- **`notifyListeners` 在 Activity 进入 STOPPED 状态时会被 Capacitor 缓存**（webView 还活着但 JS engine 暂停）——意味着锁屏期间累积的事件会在 webView 恢复后一次性触发；业务层要做去重 + 时序处理。
- **Capacitor 5 不需要 `capacitor.config.json` 注册插件**（自动扫描注解）；只需 `registerPlugin` 一行。
- **`call.setKeepAlive(true)`** 适合流式：但我们用 `addListener`/`notifyListeners` 模式更标准，不需要 keepAlive。
- **混淆**：Plugin 类需在 `proguard-rules.pro` 加 `-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }`。

### 决策建议（针对我们项目）
1. **Plugin 只做"代理"**：`start/stop` + 订阅 LocalBroadcast 转 JS 事件；真正的网络栈在 Service 里。
2. **JS 端封装一个 `RealtimeBridge` 单例**：监听 `notification` 事件 → 写入 IndexedDB → 触发 React 状态更新。
3. **退出登录时**：JS 调 `Realtime.stop()` → Plugin stop Service → Service 在 `onDestroy` 里 `source.cancel()` + 清通知。

---

## 5. 国产 ROM 杀后台规避

### TL;DR
**没有银弹**。持久通知 + `dataSync` FGS 在原生 Android / Pixel / 三星上能保活几小时到几天；但**小米 MIUI / 华为 EMUI / OPPO ColorOS / vivo OriginOS 必须由用户手动加白名单**，否则 1–30 分钟内必被冻结。最实用的方法是：① 引导用户加电池白名单（标准 Intent）② 用 OEM 专用 ComponentName 跳到"自启动管理"页（无 API，全靠硬编码） ③ 提供 `dontkillmyapp.com` 教程链接作兜底。

### 关键参考
- [dontkillmyapp.com — Xiaomi](https://dontkillmyapp.com/xiaomi) + 其它厂商页 —— 各家行为白皮书
- [squareetlabs/capacitor-dont-kill-my-app](https://github.com/squareetlabs/capacitor-dont-kill-my-app) — Capacitor 现成插件，源码含 11 家 OEM ComponentName 表
- [moopat gist on OEM intents](https://gist.github.com/moopat/e9735fa8b5cff69d003353a4feadcdbc) — 社区维护的 ComponentName 大全
- [XomaDev/MIUI-Autostart](https://github.com/XomaDev/MIUI-autostart) — 通过反射检查 MIUI 自启动权限状态

### OEM ComponentName 速查表（来自 squareetlabs 源码实测）

| 品牌 | 包名 | Activity |
|---|---|---|
| 小米 | `com.miui.securitycenter` | `com.miui.permcenter.autostart.AutoStartManagementActivity` |
| 华为/荣耀 | `com.huawei.systemmanager` | `com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity` |
| 荣耀(老) | `com.huawei.systemmanager` | `com.huawei.systemmanager.optimize.process.ProtectActivity` |
| OPPO/真我 | `com.coloros.safecenter` | `com.coloros.safecenter.permission.startup.StartupAppListActivity` |
| OPPO 备用 | `com.oppo.safe` | `com.oppo.safe.permission.startup.StartupAppListActivity` |
| vivo/iQOO | `com.iqoo.secure` | `com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity` |
| vivo 备用 | `com.vivo.permissionmanager` | `com.vivo.permissionmanager.activity.BgStartUpManagerActivity` |
| 三星 | `com.samsung.android.lool` | `com.samsung.android.sm.ui.battery.BatteryActivity` |
| 一加 | `com.oneplus.security` | `com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity` |
| 魅族 | `com.meizu.safe` | `com.meizu.safe.permission.SmartBGActivity` |
| ASUS | `com.asus.mobilemanager` | `com.asus.mobilemanager.powersaver.PowerSaverSettings` |
| LeTV | `com.letv.android.letvsafe` | `com.letv.android.letvsafe.AutobootManageActivity` |

### 代码骨架
```kotlin
// 标准电池优化白名单（所有 Android 6+）
fun requestIgnoreBatteryOpt(ctx: Context) {
  val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
      .setData(Uri.parse("package:${ctx.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  ctx.startActivity(intent)
}

// OEM 自启动管理（用上表，每家 try/catch）
fun openAutoStart(ctx: Context) {
  val brand = Build.BRAND.lowercase()
  val (pkg, cls) = OEM_AUTOSTART_MAP[brand] ?: run { openAppDetails(ctx); return }
  try {
    ctx.startActivity(Intent().setComponent(ComponentName(pkg, cls))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  } catch (e: Exception) { openAppDetails(ctx) }  // 兜底打开应用详情页
}
```

### 坑点 & 注意事项
- **ComponentName 频繁失效**：MIUI/ColorOS 每个大版本都可能改类名。生产环境必须 try/catch 并降级到 `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`。
- **持久通知能挡多少**：原生 Android / Pixel ≈ 100%；三星 ≈ 90%（深度睡眠会断 ~10 分钟）；小米 ≈ 50%（电池保护模式开启时被杀）；华为 ≈ 20%（默认禁止后台联网）。
- **不要伪装持久通知为业务通知**：Google Play 政策禁止；国内分发可以但用户讨厌。
- **MIUI "神隐模式" / 华为 "应用启动管理"**：不在标准电池白名单内，必须二次引导。
- **测试矩阵建议**：Pixel 8 / 小米 14 / 华为 P60 / OPPO Find X7 / vivo X100 / 三星 S24 六台。

### 决策建议（针对我们项目）
1. **首次启动 + 登录后弹一次"开启后台通知"引导**：第一步 `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`；第二步根据 `Build.BRAND` 跳 OEM 自启动页；第三步显示截图教程。
2. **设置页加"诊断"按钮**：检测 ① `isIgnoringBatteryOptimizations()` ② Service 是否运行 ③ 上次成功收到事件时间，三项有问题就高亮。
3. **不要试图通过反射绕过白名单**——分发市场风控会拦截。
4. **文案中明确"国产 ROM 限制是系统行为，本应用无法绕过"**——管理用户预期。

---

## 6. PocketBase Realtime 替代方案对比（短论）

### TL;DR
**坚持用 PB Realtime SSE**——其他方案在我们项目规模（<200 在线用户）下都更差。但要准备好两个降级路径：① 应用前台时启用 30s 轮询作为 SSE 失败时的兜底；② 不可用 PB 时的临时切到自建 SSE 网关。

### 三个备选 + 调研到的 PB issue

| 方案 | 实现难度 | 实时性 | 流量/电量 | 兼容性 | 推荐度 |
|---|---|---|---|---|---|
| **PB Realtime SSE（当前选择）** | 低（SDK 内置） | 秒级 | 中 | HTTP/1.1 + HTTP/2 通用 | ⭐⭐⭐⭐⭐ |
| **WebSocket** | 高（PB 不原生支持，需自建 ws gateway） | 秒级 | 低 | 国内某些代理不通 ws | ⭐⭐ |
| **轮询 + ETag/If-Modified-Since** | 极低 | 30s–5min | 高（无活动时也轮询） | 任何网络都行 | ⭐⭐⭐（作为兜底） |
| **自建 SSE 网关在 PB 前** | 中（Caddy/Cloudflare 反代专门处理 `/api/realtime`） | 秒级 | 中 | 同 SSE | ⭐⭐⭐ |

### PB Realtime 已知 issue（GitHub Discussions 抽样 5 条）

1. **[#3054 — 5 分钟 idle timeout](https://github.com/pocketbase/pocketbase/discussions/3054)**：硬编码，已支持 hook 配置；社区高频报问题。
2. **[#2323 — Realtime API lost connection](https://github.com/pocketbase/pocketbase/discussions/2323)**：服务端有反向代理时 60s 超时导致频繁断开；解决：配 Nginx `proxy_read_timeout 1h`。
3. **[#4639 — 静默断开检测难](https://github.com/pocketbase/pocketbase/discussions/4639)**：移动网络切换时 SDK 不知道连接已死，要靠监听 `PB_CONNECT` 主题或轮询 `pb.realtime.clientId`。
4. **[#6378 — PocketHost 平台空闲时关连接](https://github.com/pocketbase/pocketbase/discussions/6378)**：托管商行为，自建 PB 无此问题。
5. **[#4539 — Windows 上 SSE 被某些防火墙阻断](https://github.com/pocketbase/pocketbase/discussions/4539)**：Android 不涉及，桌面端要关注。

### 决策建议（针对我们项目）
1. **主链路 SSE，前台轮询作 secondary**：前台时每 30 秒额外拉一次 `/api/collections/notifications/records?filter=updated>{last}` 作为"软兜底"——即使 SSE 静默断开也最多漏 30 秒。
2. **不上 WebSocket**：PB 不原生支持，工程量与收益不匹配。
3. **保留"自建 SSE 网关"作为 Plan B**——若一年后流量超过 1000 并发，再考虑 Caddy 前置 + 连接复用。

---

## 7. JS 端调原生 Plugin

### TL;DR
React 项目用 `registerPlugin<T>('Realtime')` 拿代理对象 → `Realtime.start({baseUrl, token})` 启动 Service → `Realtime.addListener('notification', cb)` 接收事件 → 退出登录调 `Realtime.stop()`。**生命周期管理是关键**：login 后才 start，logout 前必须 stop，避免离线 token 残留。

### 关键参考
- [Capacitor 5 Custom Native Android Code](https://capacitorjs.com/docs/android/custom-code) — 引用本地 plugin 的方式
- [Capacitor v5 Plugins (creating)](https://capacitorjs.com/docs/plugins/creating-plugins) — addListener / removeListener 模式

### 代码骨架

**`src/native/realtime.ts`（plugin 定义，见 §4）**

**`src/lib/realtimeBridge.ts`（React 集成）：**
```typescript
import { Realtime } from '../native/realtime';
import { useAuthStore } from '../store/auth';
import { useNotificationStore } from '../store/notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

let handle: PluginListenerHandle | null = null;

export async function startRealtime() {
  if (Capacitor.getPlatform() !== 'android') return;     // Web 用 EventSource fallback
  const { baseUrl, token } = useAuthStore.getState();
  if (!token) return;
  await Realtime.start({ baseUrl, token });
  handle = await Realtime.addListener('notification', (e) => {
    const record = JSON.parse(e.record);
    useNotificationStore.getState().pushIncoming(record);
  });
}

export async function stopRealtime() {
  await handle?.remove();
  handle = null;
  if (Capacitor.getPlatform() === 'android') await Realtime.stop();
}
```

**`src/App.tsx`：**
```typescript
useEffect(() => {
  if (auth.isLoggedIn) startRealtime();
  return () => { stopRealtime(); };
}, [auth.isLoggedIn]);
```

### 坑点 & 注意事项
- **退出登录顺序**：先 `Realtime.stop()` 再清 token；反过来会让 Service 用旧 token 重连失败一次。
- **TypeScript 类型**：`registerPlugin<RealtimePlugin>(name)` 必须显式给泛型，否则方法签名是 `any`。
- **Web fallback**：浏览器 dev / PWA 模式下 plugin 会回退到默认 web 实现（不存在则报 unimplemented）；用 `Capacitor.getPlatform() === 'web'` 提前 short-circuit。
- **重复 addListener**：每次 `startRealtime()` 都新增一个 listener，必须先 `handle?.remove()`。
- **token 续期**：access token 过期后 SDK 用 refresh 更新，但 Service 里的 token 是 start 时 snapshot——必须在 `pb.authStore.onChange` 里 stop + restart Service，或加个 `Realtime.updateToken(newToken)` 方法。

### 决策建议（针对我们项目）
1. **加 `Realtime.updateToken(token)` 方法**避免 token 刷新时整个 Service 重启。
2. **`useEffect` 监听 login 状态 + 监听 `pb.authStore.onChange`** 两层联动。
3. **错误事件也通过 notifyListeners 推 JS**：`{ type: 'error', code: 'auth_failed' }`，前端据此引导重登或开权限。
4. **Web/iOS 完全分支**：本期仅 Android 走 Service；Web 直接用 PB JS SDK；iOS 后续再做（iOS BGTask + PushKit 是另一篇 spec）。

---

# PR 2 设计调整建议（基于上述调研）

下面针对 `docs/superpowers/specs/*pr2*` §4 的设计提出 6 条具体调整：

### A. 前台服务类型：`dataSync` 而非 `specialUse`
原 spec 若选 `specialUse`，会触发 Play Console 审核理由提交；国内分发市场也不友好。**改用 `dataSync`**，承认 Android 15 的 6 小时上限是常态，配合 `onTimeout()` + WorkManager 周期检查代替"永生 Service"幻觉。

### B. 协议层：原生 OkHttp SSE，不复用 PB JS SDK
原 spec 若假定让 JS SDK 在 Service 的 WebView 里跑，**不可行**——Capacitor 5 的 WebView 在 Activity STOPPED 后会冻结 JS engine。**必须在原生 Service 里用 OkHttp `okhttp-sse` 4.12 自行实现 SSE 协议 + 订阅协议**（POST /api/realtime）。

### C. 重连策略明确化
原 spec 如只写"自动重连"，需具体化：**指数退避 1/2/4/8/16/30s + ±20% jitter；监听 `ConnectivityManager.NetworkCallback` 触发即时重连；连续失败 ≥10 次后停 Service 并推一条 "连接异常请重启" 通知**。

### D. 服务端配套：PB hooks + Nginx 配置不可省
原 spec 若只描述客户端，需补充服务端：① `pb_hooks/realtime.pb.js` 设 `idleTimeout = 30 * 60 * 1e9`；② Nginx `proxy_read_timeout 1h; proxy_buffering off;`。**这两项任意缺失都会导致重连风暴**。

### E. 国产 ROM 引导流程独立成一节
原 spec 若混在"权限申请"里，**应抽出独立用户故事**：登录后弹引导 → 标准电池白名单 → OEM 自启动页（按 `Build.BRAND`） → 截图教程兜底 → 设置页"诊断"按钮。配套 12 家 OEM ComponentName 表落库。

### F. 兜底轮询作为 secondary 链路
原 spec 若 100% 依赖 SSE，**应加 secondary 轮询**：前台时每 30 秒 `GET /api/collections/notifications/records?filter=updated>{last}` 补差；后台时不轮询（依赖 SSE）。**这条把 PB Realtime 静默断开问题压到肉眼不可见**。

### 一句话总结
PR 2 spec 需要从"启动一个永生 Service"调整为"启动一个尽力保活的 dataSync Service + 客户端自管重连 + 服务端调长 idleTimeout + Nginx 不切流 + 前台轮询兜底 + 国产 ROM 用户教育"的六位一体方案；任何一环缺失都会让"无 FCM 推送"在生产环境上失效。
