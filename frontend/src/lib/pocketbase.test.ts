import { describe, expect, it } from 'vitest'
import { resolvePocketBaseUrl } from './pocketbase'

describe('resolvePocketBaseUrl', () => {
  it('生产 Web 默认使用同源 PocketBase 反代', () => {
    expect(resolvePocketBaseUrl({
      envUrl: '',
      storedUrl: '',
      location: {
        protocol: 'http:',
        hostname: 'pms.example.com',
        origin: 'https://pms.example.com',
      },
    })).toBe('https://pms.example.com/pb')
  })

  it('构建时配置可切换到同源 /pb 或其他后端地址', () => {
    expect(resolvePocketBaseUrl({
      envUrl: 'https://api.example.com/pb',
      storedUrl: '',
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost',
      },
    })).toBe('https://api.example.com/pb')
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

  it('Capacitor App 未注入环境变量时使用显式无效地址', () => {
    expect(resolvePocketBaseUrl({
      isNative: true,
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost',
      },
    })).toBe('https://pocketbase.invalid')
  })

  it('Capacitor App 优先使用构建时注入的地址且忽略调试覆盖', () => {
    expect(resolvePocketBaseUrl({
      isNative: true,
      envUrl: 'https://pms.example.com/pb',
      storedUrl: 'http://127.0.0.1:18092',
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost',
      },
    })).toBe('https://pms.example.com/pb')
  })
})
