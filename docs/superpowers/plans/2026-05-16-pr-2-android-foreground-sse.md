# PR 2: Android 前台服务 + PocketBase Realtime SSE 长连 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`.

**Goal:** Android 在后台/锁屏/被部分杀死场景下仍能收到通知，完全不用 Firebase/FCM。原生 OkHttp 维护 SSE 长连到 PocketBase `/api/realtime`，前台服务保活。

**Architecture:** Capacitor Plugin（Java，注解需要）+ Foreground Service（Kotlin）+ OkHttp `okhttp-sse` 客户端 + LocalBroadcastManager 桥 + JS 端 `realtimeBridge` 单例。

**Spec：** `docs/superpowers/specs/2026-05-16-pms-notification-and-desktop-design.md` §4 PR 2（已基于研究做 6 处调整）
**Research：** `docs/superpowers/research/2026-05-16-pr2-tech-reference.md` — 协议骨架、坑点、12 家 OEM ComponentName

---

## 0. 文件结构

| 文件 | 状态 |
|---|---|
| `frontend/android/app/build.gradle` | 修改 — 加 okhttp/okhttp-sse/gson deps + 权限 |
| `frontend/android/app/src/main/AndroidManifest.xml` | 修改 — FOREGROUND_SERVICE + service 声明 |
| `frontend/android/app/src/main/java/com/engineering/pms/realtime/PbSseClient.kt` | 新建 — OkHttp SSE 客户端 + 重连 |
| `frontend/android/app/src/main/java/com/engineering/pms/realtime/RealtimeService.kt` | 新建 — Foreground Service |
| `frontend/android/app/src/main/java/com/engineering/pms/realtime/RealtimePlugin.java` | 新建 — Capacitor plugin |
| `frontend/android/app/src/main/java/com/engineering/pms/MainActivity.java` | 修改 — registerPlugin |
| `frontend/src/native/realtime.ts` | 新建 — TS plugin 定义 |
| `frontend/src/lib/realtimeBridge.ts` | 新建 — React 集成 |
| `frontend/src/lib/pushNotifications.ts` | 修改 — 移除 FCM，改调 startRealtime |
| `frontend/src/App.tsx` | 修改 — 登录后启动 realtime |
| `backend/pb_hooks/realtime.pb.js` | 新建 — idleTimeout=30min |
| `frontend/android/app/build.gradle` | 修改 — versionCode 38 / versionName 2.98 |

---

## Task 1: build.gradle 加 OkHttp + Kotlin 依赖

加 implementation：
- `com.squareup.okhttp3:okhttp:4.12.0`
- `com.squareup.okhttp3:okhttp-sse:4.12.0`
- `com.google.code.gson:gson:2.10.1`
- `androidx.localbroadcastmanager:localbroadcastmanager:1.1.0`
- 启用 Kotlin

## Task 2-5: Android 原生代码

PbSseClient.kt → RealtimeService.kt → RealtimePlugin.java → MainActivity.java 注册

## Task 6: AndroidManifest 权限 + service

## Task 7-8: JS 端 plugin 定义 + bridge

## Task 9: 接入 App.tsx login lifecycle

## Task 10: PocketBase hooks idleTimeout

## Task 11: gradle assembleDebug + 拷贝 v2.98 APK

## Task 12: commit + push

---

**Note：** 实机验证需要用户在 Android 真机上做（开发机无 device）。所有自动化能跑的（gradle assembleDebug 编译通过 + JS 端 tsc/test）必须先通过。
