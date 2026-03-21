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

// 登录状态变化时重新订阅
pb.authStore.onChange(() => {
  unsubscribeAll()
  if (pb.authStore.isValid) {
    setTimeout(initRealtime, 500)
    setTimeout(() => { void syncPushRegistrationForCurrentUser() }, 900)
  }
})

// 首次加载
setTimeout(initRealtime, 1000)
setTimeout(() => { void syncPushRegistrationForCurrentUser() }, 1400)


class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error }
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
