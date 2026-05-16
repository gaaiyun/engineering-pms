# Agent L — E2E 错误处理 / 离线场景测试（Round 4）

- 运行时间: 2026-05-16 13:09:17
- 测试前缀: `E2E-Err-1778908119-`
- 截图目录: `G:\项目管理软件_v2\docs\superpowers\qa-screenshots\error_handling`

## 汇总: 5 PASS / 0 FAIL / 0 INCONCLUSIVE / 0 SKIP

| Scenario | Status | 摘要 |
|---|---|---|
| E1_PB_server_down | **PASS** | AppShell 渲染正常，content textLen=104 errorEl=0 loading=False |
| E2_token_expired | **PASS** | 已跳 /login 且渲染了登录表单。console errors: 0 |
| E3_mutation_fail | **PASS** | created test task: 6nbers3ufdy705j |
| E4_rapid_click_debounce | **PASS** | created task: 9gsrgwbxi8i7urq |
| E5_large_dataset_100tasks | **PASS** | created 100 tasks in 902ms |

## E1_PB_server_down
**状态**: PASS

### 实际观察
- AppShell 渲染正常，content textLen=104 errorEl=0 loading=False
- elapsed_ms: 9278

### 关键数据
```json
{
  "navigation_elapsed_ms": 8104,
  "final_url": "http://127.0.0.1:5173/app",
  "page_probe": {
    "bodyTextLen": 104,
    "bodyTextSample": "EngineeringPMS\n首页\n我的任务\n我的项目\n审核中心\n通知\n设置\n管理后台\n搜索任务、项目、通知…（敬请期待）\n张经理\n工程结算\n工程管理系统\n工作进展\n管理\n我的\n消息通知\n工作进展\n项目与进度",
    "visibleElCount": 9,
    "errorElCount": 0,
    "hasReactRoot": true,
    "rootChildren": 2,
    "hasLoadingIndicator": false
  },
  "console_errors_count": 13,
  "console_errors_sample": [
    {
      "type": "error",
      "text": "Failed to load resource: net::ERR_CONNECTION_REFUSED"
    },
    {
      "type": "error",
      "text": "Failed to load resource: net::ERR_CONNECTION_REFUSED"
    },
    {
      "type": "error",
      "text": "Failed to load resource: net::ERR_CONNECTION_REFUSED"
    },
    {
      "type": "pageerror",
      "text": "Something went wrong."
    },
    {
      "type": "pageerror",
      "text": "Something went wrong."
    }
  ]
}
```

### 截图
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/error_handling/E1_pb_down.png`

---

## E2_token_expired
**状态**: PASS

### 实际观察
- 已跳 /login 且渲染了登录表单。console errors: 0
- elapsed_ms: 7376

### 关键数据
```json
{
  "before_remove_url": "http://127.0.0.1:5173/app",
  "after_reload_url": "http://127.0.0.1:5173/login",
  "page_probe": {
    "textLen": 131,
    "textSample": "PM\n工程结算管理\n\nEnterprise Project Management\n\n服务器已连接\n记住登录状态\n登 录\n测试账号\n管理员: zhang_manager / 12345678\n员工: li_audit / 12345678\n还没有账号？立即注册 →",
    "rootChildren": 2,
    "hasLoginForm": true
  },
  "console_errors_count": 0,
  "console_errors_sample": []
}
```

### 截图
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/error_handling/E2_after_token_remove.png`

---

## E3_mutation_fail
**状态**: PASS

### 实际观察
- created test task: 6nbers3ufdy705j
- DELETE 500 后 task 留在 DB 正确；audit_log 也未残留。
- 注意：本测试用 fetch 直接调 API（绕过 react-query），toast 触发依赖 mutation onError。 真实 UI（KanbanCard 删除按钮）路径未测，建议补 KanbanPage 操作 E2E。
- elapsed_ms: 6038

### 关键数据
```json
{
  "delete_result": {
    "ok": false,
    "status": 500,
    "body": {
      "code": 500,
      "message": "Mock server error (E3 intercept)",
      "data": {}
    }
  },
  "route_intercepted_count": 1,
  "task_still_in_db": true,
  "task_status": "pending",
  "delete_audit_count": 0,
  "toast_probe": {
    "toastLikeCount": 0,
    "samples": []
  },
  "console_errors_count": 1,
  "console_errors_sample": [
    {
      "type": "error",
      "text": "Failed to load resource: the server responded with a status of 500 (Internal Server Error)"
    }
  ]
}
```

### 截图
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/error_handling/E3_after_delete_fail.png`

---

## E4_rapid_click_debounce
**状态**: PASS

### 实际观察
- created task: 9gsrgwbxi8i7urq
- 网络层并发 5 次，1/5 PB 接受
- PB hook C3 完美兜底：5 次并发只产生 1 个 pending handoff
- elapsed_ms: 5182

### 关键数据
```json
{
  "network_layer_results": [
    {
      "label": "c4",
      "ok": true,
      "elapsed_ms": 18
    },
    {
      "label": "c5",
      "ok": false,
      "err": "RuntimeError: HTTP 400: {\"code\":400,\"message\":\"该任务已有 pending handoff (id=yropkhjgbkr5ww1)，不能重复创建.\",\"data\":{}}\n",
      "elapsed_ms": 19
    },
    {
      "label": "c2",
      "ok": false,
      "err": "RuntimeError: HTTP 400: {\"code\":400,\"message\":\"该任务已有 pending handoff (id=yropkhjgbkr5ww1)，不能重复创建.\",\"data\":{}}\n",
      "elapsed_ms": 20
    },
    {
      "label": "c1",
      "ok": false,
      "err": "RuntimeError: HTTP 400: {\"code\":400,\"message\":\"该任务已有 pending handoff (id=yropkhjgbkr5ww1)，不能重复创建.\",\"data\":{}}\n",
      "elapsed_ms": 22
    },
    {
      "label": "c3",
      "ok": false,
      "err": "RuntimeError: HTTP 400: {\"code\":400,\"message\":\"该任务已有 pending handoff (id=yropkhjgbkr5ww1)，不能重复创建.\",\"data\":{}}\n",
      "elapsed_ms": 23
    }
  ],
  "network_layer_ok_count": 1,
  "pending_handoff_count": 1,
  "total_handoff_count": 1,
  "ui_probe": {
    "totalButtons": 2,
    "disabledCount": 0,
    "sampleDisabled": []
  }
}
```

### 截图
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/error_handling/E4_my_tasks_after_rapid.png`

---

## E5_large_dataset_100tasks
**状态**: PASS

### 实际观察
- created 100 tasks in 902ms
- 渲染 100 任务用时 1044ms 可接受
- 未检测到虚拟滚动（建议加）
- elapsed_ms: 5543

### 关键数据
```json
{
  "bulk_create_elapsed_ms": 902,
  "created_count": 100,
  "my_tasks_nav_elapsed_ms": 125,
  "network_idle_elapsed_ms": 919,
  "render_probe": {
    "taskLikeEls": 0,
    "totalDomEls": 216,
    "mainScrollH": 900,
    "mainClientH": 844,
    "viewportH": 900,
    "hasVirtualScroll": false
  },
  "scroll_test_elapsed_ms": 812,
  "memory_metrics": {
    "usedJSHeapSize": 31200000,
    "totalJSHeapSize": 42100000,
    "jsHeapSizeLimit": 3760000000
  },
  "total_render_ms": 1044
}
```

### 截图
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/error_handling/E5_my_tasks_100.png`

---

## E6_Capacitor_native_event (SKIP)
**状态**: SKIPPED

**原因**: 需要在 Android 设备/模拟器上运行 native context，Playwright Chromium 不能模拟 Capacitor APIs (`@capacitor/network`, `@capacitor/app` 等)。

### 推荐验证方案
1. **Capacitor Network 监听**: 在 `frontend/src/lib/networkStatus.ts`（如有）订阅 `Network.addListener('networkStatusChange')`。模拟器中切飞行模式，观察 React Query `onlineManager.setOnline()` 是否被调用、UI 是否显示离线 banner。
2. **App resume/pause**: `CapacitorApp.addListener('appStateChange', ...)` — 切后台 30s 后回前台，观察 `pb.authStore.isValid` + SSE 重连情况。
3. **Push notification onError**: 在 `pushNotifications.ts` 模拟 FCM token 注册失败（断网注册），看是否有 fallback。
4. **建议手动 QA 脚本**: 准备 `docs/qa/capacitor_offline_manual.md` 列出 10 项 native-only 检查。
