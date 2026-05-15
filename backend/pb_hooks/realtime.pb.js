/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Realtime Hooks — PR 2
 *
 * 调整 SSE 连接的 idle timeout：默认 5 分钟，改为 30 分钟。
 *
 * 原因（详见 docs/superpowers/research/2026-05-16-pr2-tech-reference.md §1）：
 *   - 5 分钟 idle 会导致移动端频繁断线重连
 *   - 调到 30 分钟可显著降低重连频率与流量
 *   - 不可设为无限（会留 zombie 连接）
 *
 * Android 原生 SSE 客户端（PbSseClient.java）已实现指数退避重连，
 * 30 分钟 idle 配合 ConnectivityManager.NetworkCallback 已经足够稳。
 *
 * 此 hook 在 PB 0.22+ 有效（onRealtimeConnectRequest 自 v0.17.2 引入）。
 */
onRealtimeConnectRequest((e) => {
  e.idleTimeout = 30 * 60 * 1e9 // 30 minutes in nanoseconds
})
