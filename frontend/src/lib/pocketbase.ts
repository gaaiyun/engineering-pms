import PocketBase from 'pocketbase'

// 连接策略（按优先级）：
// 1) 构建时注入：VITE_PB_URL（适用于 App 打包/多环境）
// 2) 运行时推导：
//    - http 站点：当前域名 + :8090（例如 http://your-domain.com -> http://your-domain.com:8090）
//    - https 站点：默认使用同域 /pb（需要 Nginx 反代到 8090，避免 Mixed Content）
// 3) 本地兜底：127.0.0.1:8090
//
// 说明：
// - 若你以后开 https，强烈建议在 Nginx 里做 /pb 反代到 8090，避免 Mixed Content
// - 允许通过 localStorage 临时覆盖（无需重新打包）：localStorage.setItem('pb_url', 'http://x.x.x.x:8090')

function getPocketBaseUrl() {
  const envUrl = (import.meta.env.VITE_PB_URL || '').trim()
  if (envUrl) return envUrl

  // 允许运行时覆盖：适合在未设置 VITE_PB_URL 时临时联调/排障
  if (typeof window !== 'undefined') {
    const storedUrl = (window.localStorage.getItem('pb_url') || '').trim()
    if (storedUrl) return storedUrl

    const { protocol, hostname, origin } = window.location
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

    if (isLocalhost) return 'http://127.0.0.1:8090'

    // https 站点默认走同域反代（/pb），避免 Mixed Content
    if (protocol === 'https:') return `${origin}/pb`

    return `${protocol}//${hostname}:8090`
  }

  // SSR/测试环境兜底
  return 'http://127.0.0.1:8090'
}

export const PB_URL = getPocketBaseUrl()

export const pb = new PocketBase(PB_URL)

export const isUserLoggedIn = () => pb.authStore.isValid

export const logout = () => pb.authStore.clear()

// ========== 实时数据订阅 ==========
let _subscribed = false

export function subscribeToChanges(invalidate: (keys: string[][]) => void) {
  if (_subscribed || !pb.authStore.isValid) return
  _subscribed = true

  const collections = ['tasks', 'projects', 'handoffs', 'notifications', 'audit_logs', 'comments']
  
  // 每个集合的变更 → invalidate 对应的 query keys
  const keyMap: Record<string, string[][]> = {
    tasks: [['tasks'], ['projects'], ['notifications'], ['audit_logs']],
    projects: [['projects'], ['notifications']],
    handoffs: [['handoffs'], ['notifications']],
    notifications: [['notifications']],
    audit_logs: [['audit_logs']],
    comments: [['comments']],
  }

  for (const col of collections) {
    try {
      pb.collection(col).subscribe('*', () => {
        invalidate(keyMap[col] || [[col]])
      })
    } catch { /* collection may not exist */ }
  }
}

export function unsubscribeAll() {
  try {
    pb.realtime.unsubscribe()
  } catch { /* ignore */ }
  _subscribed = false
}
