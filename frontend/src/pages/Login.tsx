import { Button, Form, Input, Toast, Checkbox } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
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

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [rememberMe, setRememberMe] = useState(false)
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

  const generateCaptcha = useCallback(() => {
    const a = Math.floor(Math.random() * 10) + 1
    const b = Math.floor(Math.random() * 10) + 1
    setCaptchaQuestion({ a, b, answer: a + b })
    setCaptchaAnswer('')
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(LOCKOUT_KEY)
    if (stored) {
      const until = parseInt(stored, 10)
      if (until > Date.now()) {
        setLockoutUntil(until)
      } else {
        localStorage.removeItem(LOCKOUT_KEY)
        localStorage.removeItem(ATTEMPT_KEY)
      }
    }
    const attempts = parseInt(localStorage.getItem(ATTEMPT_KEY) || '0', 10)
    setFailedAttempts(attempts)
    if (attempts >= 3) {
      setShowCaptcha(true)
      generateCaptcha()
    }
  }, [generateCaptcha])

  useEffect(() => {
    if (lockoutUntil && lockoutUntil > Date.now()) {
      lockoutTimerRef.current = setInterval(() => {
        if (Date.now() >= lockoutUntil) {
          setLockoutUntil(null)
          localStorage.removeItem(LOCKOUT_KEY)
          localStorage.removeItem(ATTEMPT_KEY)
          setFailedAttempts(0)
          setShowCaptcha(false)
          if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
        }
      }, 1000)
    }
    return () => { if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current) }
  }, [lockoutUntil])

  useEffect(() => {
    localStorage.removeItem('savedCredentials')
    const remembered = localStorage.getItem('rememberMe') === '1'
    const savedUser = localStorage.getItem('savedUsername')
    if (remembered && savedUser) {
      setSavedCredentials({ username: savedUser, password: '' })
      setRememberMe(true)
      form.setFieldsValue({ username: savedUser })
    }
    checkServer()
  }, [form])

  const checkServer = async () => {
    setServerStatus('checking')
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      await Promise.race([pb.health.check(), timeoutPromise])
      setServerStatus('online')
    } catch (e) {
      setServerStatus('offline')
    }
  }

  const getRemainingLockoutTime = () => {
    if (!lockoutUntil) return ''
    const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000))
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const onFinish = async (values: any) => {
    setErrorMsg('')

    if (lockoutUntil && lockoutUntil > Date.now()) {
      setErrorMsg(`账号已锁定，请 ${getRemainingLockoutTime()} 后重试`)
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
      if (!rememberMe) {
        localStorage.removeItem('pocketbase_auth')
      }

      const authData = await pb.collection('users').authWithPassword(
        values.username.trim(),
        values.password
      )

      localStorage.removeItem(ATTEMPT_KEY)
      localStorage.removeItem(LOCKOUT_KEY)
      setFailedAttempts(0)
      setShowCaptcha(false)

      if (rememberMe) {
        localStorage.setItem('savedUsername', values.username.trim())
        localStorage.setItem('rememberMe', '1')
      } else {
        localStorage.removeItem('savedUsername')
        localStorage.removeItem('rememberMe')
        sessionStorage.setItem('pocketbase_auth', localStorage.getItem('pocketbase_auth') || '')
      }

      const { queryClient } = await import('../lib/queryClient')
      queryClient.clear()

      Toast.show({ icon: 'success', content: '登录成功' })

      const role = (authData.record?.role || 'employee').toLowerCase()
      if (role === 'admin' || role === 'manager') {
        navigate('/admin')
      } else {
        navigate('/app')
      }
    } catch (error: any) {
      const newAttempts = failedAttempts + 1
      setFailedAttempts(newAttempts)
      localStorage.setItem(ATTEMPT_KEY, newAttempts.toString())

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION
        setLockoutUntil(until)
        localStorage.setItem(LOCKOUT_KEY, until.toString())
        setErrorMsg(`登录失败次数过多，账号已锁定 5 分钟`)
      } else {
        if (newAttempts >= 3 && !showCaptcha) {
          setShowCaptcha(true)
          generateCaptcha()
        }
        let msg = '用户名或密码错误'
        const status = error?.status || error?.response?.code
        if (status === 400 || status === 401 || status === 403) {
          msg = `用户名或密码错误（剩余 ${MAX_ATTEMPTS - newAttempts} 次尝试）`
        } else if (
          error?.message?.includes('Failed to fetch') ||
          error?.message?.includes('NetworkError') ||
          error?.isAbort ||
          status === 0
        ) {
          msg = '网络连接失败，请检查网络'
        } else {
          msg = `登录失败：${error?.message || '用户名或密码错误'}（剩余 ${MAX_ATTEMPTS - newAttempts} 次）`
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
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: -100,
        right: -100,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
        filter: 'blur(60px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: -150,
        left: -150,
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
        filter: 'blur(80px)'
      }} />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(255, 255, 255, 0.98)',
          borderRadius: 24,
          padding: '48px 36px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1)',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Logo & Header */}
        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.3)'
          }}>
            <span style={{ fontSize: 28 }}>PM</span>
          </div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#0F172A',
            marginBottom: 8,
            letterSpacing: '-0.5px'
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
          borderRadius: 12,
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
                borderRadius: 12,
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
                borderRadius: 14,
                padding: '4px 16px',
                border: '2px solid transparent',
                transition: 'all 0.2s'
              }}>
                <IoPersonOutline size={20} color="#94A3B8" style={{ flexShrink: 0 }} />
                <Input
                  placeholder='用户名 / 邮箱'
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
                borderRadius: 14,
                padding: '4px 16px',
                border: '2px solid transparent',
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
                <div onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer', padding: 4 }}>
                  {showPassword ? <IoEyeOffOutline size={20} color="#94A3B8" /> : <IoEyeOutline size={20} color="#94A3B8" />}
                </div>
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
                  borderRadius: 14,
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
              onChange={val => setRememberMe(val)}
              style={{
                '--icon-size': '18px',
                '--font-size': '14px'
              } as any}
            >
              <span style={{ color: '#64748b', fontWeight: 500 }}>记住登录状态</span>
            </Checkbox>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Button
              block
              type='submit'
              loading={loading}
              disabled={serverStatus === 'checking'}
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                border: 'none',
                color: '#fff',
                borderRadius: 14,
                height: 52,
                fontSize: 16,
                fontWeight: 700,
                boxShadow: '0 10px 30px rgba(15, 23, 42, 0.3)',
                opacity: serverStatus === 'checking' ? 0.7 : 1,
                transition: 'all 0.3s'
              }}
            >
              登 录
            </Button>
          </motion.div>
        </Form>

        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginTop: 32 }}>
          {import.meta.env.DEV && (
            <div style={{
              fontSize: 12,
              color: '#94A3B8',
              marginBottom: 16,
              padding: '12px 16px',
              background: '#F8FAFC',
              borderRadius: 12,
              lineHeight: 1.8
            }}>
              <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 4 }}>测试账号</div>
              <div>管理员: zhang_manager / 12345678</div>
              <div>员工: li_audit / 12345678</div>
            </div>
          )}
          <span
            onClick={() => navigate('/register')}
            style={{
              fontSize: 14,
              color: '#2563EB',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            还没有账号？立即注册 →
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}
