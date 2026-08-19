import { Button, Form, Input, Toast, Checkbox } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { pb, getPocketBaseErrorMessage } from '../lib/pocketbase'
import { getPostLoginPath, normalizeAppRole } from '../lib/navigation'
import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import {
  IoLockClosedOutline,
  IoPersonOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoRefreshOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5'

const LOCKOUT_KEY = 'login_lockout'
const ATTEMPT_KEY = 'login_attempts'
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000

interface LoginFormValues {
  username: string
  password: string
}

interface LoginRequestError {
  status?: number
  response?: { code?: number }
  message?: string
  isAbort?: boolean
}

export default function Login() {
  const navigate = useNavigate()
  const isNativeApp = Capacitor.isNativePlatform()
  const [loading, setLoading] = useState(false)
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [rememberMe, setRememberMe] = useState(() => (
    isNativeApp || localStorage.getItem('rememberMe') !== '0'
  ))
  const [savedCredentials, setSavedCredentials] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [form] = Form.useForm()
  const [errorMsg, setErrorMsg] = useState('')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaQuestion, setCaptchaQuestion] = useState({ a: 0, b: 0, answer: 0 })
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const identityKeys = (identity: string) => {
    const normalized = identity.trim().toLowerCase() || 'unknown'
    return { lockout: `${LOCKOUT_KEY}:${normalized}`, attempts: `${ATTEMPT_KEY}:${normalized}` }
  }

  const loadIdentityProtection = (identity: string) => {
    const keys = identityKeys(identity)
    const until = parseInt(localStorage.getItem(keys.lockout) || '0', 10)
    const attempts = parseInt(localStorage.getItem(keys.attempts) || '0', 10)
    setLockoutUntil(until > Date.now() ? until : null)
    setFailedAttempts(attempts)
    setShowCaptcha(attempts >= 3)
    if (attempts >= 3) generateCaptcha()
  }

  const generateCaptcha = useCallback(() => {
    const a = Math.floor(Math.random() * 10) + 1
    const b = Math.floor(Math.random() * 10) + 1
    setCaptchaQuestion({ a, b, answer: a + b })
    setCaptchaAnswer('')
  }, [])

  useEffect(() => {
    // 清理旧版“整个浏览器共用一个锁定计数”的键，改为按登录账号隔离。
    localStorage.removeItem(LOCKOUT_KEY)
    localStorage.removeItem(ATTEMPT_KEY)
  }, [generateCaptcha])

  useEffect(() => {
    if (lockoutUntil && lockoutUntil > Date.now()) {
      lockoutTimerRef.current = setInterval(() => {
        if (Date.now() >= lockoutUntil) {
          setLockoutUntil(null)
          const username = String(form.getFieldValue('username') || '')
          const keys = identityKeys(username)
          localStorage.removeItem(keys.lockout)
          localStorage.removeItem(keys.attempts)
          setFailedAttempts(0)
          setShowCaptcha(false)
          if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
        }
      }, 1000)
    }
    return () => { if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current) }
  }, [form, lockoutUntil])

  useEffect(() => {
    localStorage.removeItem('savedCredentials')
    const remembered = isNativeApp || localStorage.getItem('rememberMe') !== '0'
    const savedUser = localStorage.getItem('savedUsername')
    if (remembered && savedUser) {
      setSavedCredentials({ username: savedUser, password: '' })
      setRememberMe(true)
      form.setFieldsValue({ username: savedUser })
    }
    checkServer()
  }, [form, isNativeApp])

  const checkServer = async () => {
    setServerStatus('checking')
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      await Promise.race([pb.health.check(), timeoutPromise])
      setServerStatus('online')
    } catch {
      setServerStatus('offline')
    }
  }

  const getRemainingLockoutTime = (until = lockoutUntil) => {
    if (!until) return ''
    const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000))
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const onFinish = async (values: LoginFormValues) => {
    setErrorMsg('')
    const keys = identityKeys(values.username)
    const storedLockout = parseInt(localStorage.getItem(keys.lockout) || '0', 10)

    if (storedLockout > Date.now()) {
      setLockoutUntil(storedLockout)
      setErrorMsg(`账号已锁定，请 ${getRemainingLockoutTime(storedLockout)} 后重试`)
      return
    }

    if (showCaptcha && parseInt(captchaAnswer, 10) !== captchaQuestion.answer) {
      setErrorMsg('验证码错误，请重新计算')
      generateCaptcha()
      return
    }

    if (serverStatus !== 'online') {
      setErrorMsg('服务器连接中，请稍候...')
      return
    }

    setLoading(true)
    try {
      const shouldRemember = isNativeApp || rememberMe
      // 必须在 authWithPassword 前确定存储位置，避免 token 先落入错误的存储。
      localStorage.setItem('rememberMe', shouldRemember ? '1' : '0')

      const authData = await pb.collection('users').authWithPassword(
        values.username.trim(),
        values.password
      )

      localStorage.removeItem(keys.attempts)
      localStorage.removeItem(keys.lockout)
      setFailedAttempts(0)
      setShowCaptcha(false)

      // ⚠️ Bug fix C2 v3（终极方案 — pocketbase.ts HybridAuthStore）：
      // 不再在 Login 这里折腾 localStorage / sessionStorage —— PB SDK 现在用
      // 自定义的 HybridAuthStore，会根据 rememberMe 决定 token 写到哪个 storage。
      // 我们只需要在 authWithPassword **之前** 设好 rememberMe 标记，
      // SDK save() 会自动写到对的地方。
      //
      // 但注意：authWithPassword 已经在前面调用过了（line 132 上方）。所以
      // 这里 set rememberMe='1' 后，SDK 当前内存里的 model 不会自动重写 —
      // 直接调一次 pb.authStore.save 触发 HybridAuthStore.save 重新落盘。
      if (shouldRemember) {
        localStorage.setItem('savedUsername', values.username.trim())
      } else {
        localStorage.removeItem('savedUsername')
      }
      // 触发 HybridAuthStore.save 把 token 写到此时正确的 backend
      // （save 内部根据 rememberMe 选择 localStorage 或 sessionStorage）
      if (pb.authStore.isValid && pb.authStore.model) {
        pb.authStore.save(pb.authStore.token, pb.authStore.model as Record<string, unknown> as Parameters<typeof pb.authStore.save>[1])
      }

      const { queryClient } = await import('../lib/queryClient')
      queryClient.clear()

      Toast.show({ icon: 'success', content: '登录成功' })

      const role = normalizeAppRole(authData.record?.role)
      navigate(authData.record?.must_change_password ? '/change-password' : getPostLoginPath(role), { replace: true })
    } catch (error: unknown) {
      const requestError = error as LoginRequestError
      const newAttempts = parseInt(localStorage.getItem(keys.attempts) || String(failedAttempts), 10) + 1
      setFailedAttempts(newAttempts)
      localStorage.setItem(keys.attempts, newAttempts.toString())

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION
        setLockoutUntil(until)
        localStorage.setItem(keys.lockout, until.toString())
        setErrorMsg(`登录失败次数过多，账号已锁定 5 分钟`)
      } else {
        if (newAttempts >= 3 && !showCaptcha) {
          setShowCaptcha(true)
          generateCaptcha()
        }
        let msg = '用户名或密码错误'
        const status = requestError.status || requestError.response?.code
        const serverMessage = getPocketBaseErrorMessage(error, '')
        if (serverMessage.includes('停用')) {
          msg = serverMessage
        } else if (status === 400 || status === 401 || status === 403) {
          msg = `用户名或密码错误（剩余 ${MAX_ATTEMPTS - newAttempts} 次尝试）`
        } else if (
          requestError.message?.includes('Failed to fetch') ||
          requestError.message?.includes('NetworkError') ||
          requestError.isAbort ||
          status === 0
        ) {
          msg = '网络连接失败，请检查网络'
        } else {
          msg = `登录失败：${requestError.message || '用户名或密码错误'}（剩余 ${MAX_ATTEMPTS - newAttempts} 次）`
        }
        setErrorMsg(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#EEF1F4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          border: '1px solid #DDE3EA',
          borderRadius: 8,
          padding: '36px 34px',
          boxShadow: '0 12px 34px rgba(15, 23, 42, 0.10)',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Logo & Header */}
        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: 30 }}>
          <img
            src="/icons/icon-192x192.png"
            alt="EngineeringPMS"
            width={58}
            height={58}
            style={{
              display: 'block',
              margin: '0 auto 16px',
              borderRadius: 8,
              boxShadow: '0 7px 18px rgba(15, 47, 99, 0.18)',
            }}
          />
          <h1 style={{
            fontSize: 25,
            fontWeight: 800,
            color: '#0F172A',
            marginBottom: 8,
            letterSpacing: 0
          }}>
            工程结算管理
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', fontWeight: 500 }}>
            Enterprise Project Management
          </p>
        </motion.div>

        {/* 服务器状态 */}
        <motion.div variants={itemVariants} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '10px 16px',
          background: serverStatus === 'online' ? '#ECFDF5' : serverStatus === 'offline' ? '#FEF2F2' : '#FEF3C7',
          borderRadius: 6,
          cursor: serverStatus === 'offline' ? 'pointer' : 'default'
        }} onClick={serverStatus === 'offline' ? checkServer : undefined}>
          {serverStatus === 'checking' && (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <IoRefreshOutline size={18} color="#D97706" />
              </motion.div>
              <span style={{ fontSize: 13, color: '#D97706', fontWeight: 600 }}>正在连接服务器...</span>
            </>
          )}
          {serverStatus === 'online' && (
            <>
              <IoCheckmarkCircle size={18} color="#059669" />
              <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>服务器已连接</span>
            </>
          )}
          {serverStatus === 'offline' && (
            <>
              <IoCloseCircle size={18} color="#DC2626" />
              <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>连接失败，点击重试</span>
            </>
          )}
        </motion.div>

        {/* 内联错误提示 */}
        {errorMsg && (
          <motion.div variants={itemVariants} style={{ marginBottom: 20 }}>
            <div
              style={{
                background: '#FEF2F2',
                borderRadius: 6,
                padding: '10px 14px',
                color: '#B91C1C',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <IoCloseCircle size={18} color="#DC2626" />
              <span>{errorMsg}</span>
            </div>
          </motion.div>
        )}

        <Form
          form={form}
          layout='vertical'
          onFinish={onFinish}
          initialValues={savedCredentials}
          style={{ '--border-top': 'none', '--border-bottom': 'none' }}
        >
          <motion.div variants={itemVariants}>
            <Form.Item
              name='username'
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#F8FAFC',
                borderRadius: 6,
                padding: '4px 16px',
                border: '1px solid #D7DEE7',
                transition: 'all 0.2s'
              }}>
                <IoPersonOutline size={20} color="#94A3B8" style={{ flexShrink: 0 }} />
                <Input
                  placeholder='用户名 / 邮箱'
                  onChange={loadIdentityProtection}
                  style={{
                    '--font-size': '15px',
                    '--placeholder-color': '#94A3B8',
                    border: 'none',
                    background: 'transparent',
                    padding: '12px'
                  }}
                />
              </div>
            </Form.Item>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Form.Item
              name='password'
              rules={[{ required: true, message: '请输入密码' }]}
              style={{ marginBottom: 20 }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#F8FAFC',
                borderRadius: 6,
                padding: '4px 16px',
                border: '1px solid #D7DEE7',
                transition: 'all 0.2s'
              }}>
                <IoLockClosedOutline size={20} color="#94A3B8" style={{ flexShrink: 0 }} />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder='密码'
                  style={{
                    '--font-size': '15px',
                    '--placeholder-color': '#94A3B8',
                    border: 'none',
                    background: 'transparent',
                    padding: '12px',
                    flex: 1
                  }}
                />
                <button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer', padding: 4, border: 0, background: 'transparent', display: 'flex' }}>
                  {showPassword ? <IoEyeOffOutline size={20} color="#94A3B8" /> : <IoEyeOutline size={20} color="#94A3B8" />}
                </button>
              </div>
            </Form.Item>
          </motion.div>

          {/* 简单行为验证：加法验证码 */}
          {showCaptcha && (
            <motion.div variants={itemVariants} style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#EFF6FF',
                  borderRadius: 6,
                  padding: '8px 16px',
                  gap: 8,
                }}
              >
                <IoShieldCheckmarkOutline size={20} color="#2563EB" />
                <span style={{ fontSize: 13, color: '#1D4ED8', whiteSpace: 'nowrap' }}>
                  验证：{captchaQuestion.a} + {captchaQuestion.b} =
                </span>
                <Input
                  value={captchaAnswer}
                  onChange={val => setCaptchaAnswer(val)}
                  type="number"
                  placeholder="结果"
                  style={{
                    '--font-size': '14px',
                    '--placeholder-color': '#9CA3AF',
                    border: 'none',
                    background: 'transparent',
                    padding: '8px',
                  }}
                />
              </div>
            </motion.div>
          )}

          <motion.div variants={itemVariants} style={{ marginBottom: 28 }}>
            <Checkbox
              checked={rememberMe}
              disabled={isNativeApp}
              onChange={val => setRememberMe(val)}
              style={{
                '--icon-size': '18px',
                '--font-size': '14px'
              } as CSSProperties}
            >
              <span style={{ color: '#64748b', fontWeight: 500 }}>
                {isNativeApp ? 'App 将保持登录，退出账号后清除' : '保持登录状态（推荐）'}
              </span>
            </Checkbox>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Button
              block
              type='submit'
              loading={loading}
              disabled={serverStatus === 'checking'}
              style={{
                background: '#172033',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                height: 46,
                fontSize: 15,
                fontWeight: 700,
                boxShadow: '0 5px 14px rgba(15, 23, 42, 0.18)',
                opacity: serverStatus === 'checking' ? 0.7 : 1,
                transition: 'all 0.3s'
              }}
            >
              登 录
            </Button>
          </motion.div>
        </Form>

      </motion.div>
    </div>
  )
}
