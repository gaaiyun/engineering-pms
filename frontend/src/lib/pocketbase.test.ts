import { describe, expect, it } from 'vitest'
import { resolvePocketBaseUrl } from './pocketbase'

describe('resolvePocketBaseUrl', () => {
  it('生产 Web 页面默认走同源 /pb 反代，不直连公网 8090 端口', () => {
    expect(resolvePocketBaseUrl({
      envUrl: '',
      storedUrl: '',
      location: {
        protocol: 'http:',
        hostname: '8.134.9.77',
        origin: 'http://8.134.9.77',
      },
    })).toBe('http://8.134.9.77/pb')
  })

  it('localhost / APK WebView 继续使用构建时配置的后端地址', () => {
    expect(resolvePocketBaseUrl({
      envUrl: 'http://8.134.9.77/pb',
      storedUrl: '',
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost',
      },
    })).toBe('http://8.134.9.77/pb')
  })

  it('运行时调试地址优先于构建时配置，方便切换临时 PB 实例', () => {
    expect(resolvePocketBaseUrl({
      envUrl: 'http://127.0.0.1:18090',
      storedUrl: 'http://127.0.0.1:18092',
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:5173',
      },
    })).toBe('http://127.0.0.1:18092')
  })
})
