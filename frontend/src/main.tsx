import React from 'react'
import ReactDOM from 'react-dom/client'
import * as ReactDOMAll from 'react-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'
import { ConfigProvider } from 'antd-mobile'

// React 19 兼容性 shim：antd-mobile v5 依赖已移除的 unmountComponentAtNode / render
const _rootCache = new WeakMap<Element, ReturnType<typeof ReactDOM.createRoot>>()

if (!(ReactDOMAll as any).unmountComponentAtNode) {
  (ReactDOMAll as any).unmountComponentAtNode = (container: Element) => {
    const cached = _rootCache.get(container)
    if (cached) { cached.unmount(); _rootCache.delete(container) }
    return true
  }
}

if (!(ReactDOMAll as any).render) {
  (ReactDOMAll as any).render = (element: React.ReactNode, container: Element) => {
    let root = _rootCache.get(container)
    if (!root) { root = ReactDOM.createRoot(container); _rootCache.set(container, root) }
    root.render(element)
  }
}
import zhCN from 'antd-mobile/es/locales/zh-CN'
import { queryClient } from './lib/queryClient'
import { subscribeToChanges, unsubscribeAll, pb } from './lib/pocketbase'

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
  if (pb.authStore.isValid) setTimeout(initRealtime, 500)
})

// 首次加载
setTimeout(initRealtime, 1000)


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
        <div style={{ padding: 24, background: '#fff', height: '100vh', overflow: 'auto' }}>
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
