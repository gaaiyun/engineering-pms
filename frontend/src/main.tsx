// ⚠️ 必须第一个 import — 在 antd-mobile 加载前注入 React 19 polyfill
import './react-dom-compat'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'
import { ConfigProvider } from 'antd-mobile'
import zhCN from 'antd-mobile/es/locales/zh-CN'
import { queryClient } from './lib/queryClient'
import { subscribeToChanges, unsubscribeAll, pb } from './lib/pocketbase'
import { syncPushRegistrationForCurrentUser } from './lib/pushNotifications'

// 初始化实时订阅：PB 数据变更 → 自动刷新前端缓存
function initRealtime() {
  if (!pb.authStore.isValid) return
  subscribeToChanges((keys) => {
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  })
}

// 只有登录用户发生变化时才重建订阅；authRefresh 更新同一用户的 token/model 不需要重建。
let realtimeUserId = pb.authStore.isValid ? pb.authStore.model?.id ?? null : null
pb.authStore.onChange(() => {
  const nextUserId = pb.authStore.isValid ? pb.authStore.model?.id ?? null : null
  if (nextUserId === realtimeUserId) return
  realtimeUserId = nextUserId
  unsubscribeAll()
  if (pb.authStore.isValid) {
    setTimeout(initRealtime, 500)
    setTimeout(() => { void syncPushRegistrationForCurrentUser() }, 900)
  }
})

class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error: error instanceof Error ? error : new Error(String(error)) }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: '#fff', height: '100dvh', overflow: 'auto' }}>
          <h1 style={{ color: '#ff4d4f' }}>Application Error</h1>
          <p>The application crashed during startup.</p>
          <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, fontFamily: 'monospace', color: '#333' }}>
            {this.state.error?.toString()}
          </div>
          <details style={{ marginTop: 16, color: '#666' }}>
            <summary>Stack Trace</summary>
            <pre style={{ fontSize: 12, marginTop: 8 }}>{this.state.error?.stack}</pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

async function validateRestoredSession() {
  if (!pb.authStore.isValid) return
  try {
    await Promise.race([
      pb.collection('users').authRefresh(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('auth refresh timeout')), 5000)),
    ])
  } catch (error: unknown) {
    const status = (error as { status?: number })?.status
    // 只有服务端明确拒绝凭据时才登出；短暂离线或超时不应破坏“保持登录”。
    if (status === 400 || status === 401 || status === 403) pb.authStore.clear()
  }
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ConfigProvider locale={zhCN}>
            <App />
          </ConfigProvider>
        </QueryClientProvider>
      </GlobalErrorBoundary>
    </React.StrictMode>,
  )

  setTimeout(initRealtime, 1000)
  setTimeout(() => { void syncPushRegistrationForCurrentUser() }, 1400)
}

void validateRestoredSession().finally(renderApp)
