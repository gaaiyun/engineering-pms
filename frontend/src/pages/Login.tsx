import { Button, Form, Input, Toast, Checkbox } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { IoLockClosedOutline, IoPersonOutline, IoEyeOutline, IoEyeOffOutline, IoCheckmarkCircle, IoCloseCircle, IoRefreshOutline } from 'react-icons/io5'

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [rememberMe, setRememberMe] = useState(false)
  const [savedCredentials, setSavedCredentials] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    const saved = localStorage.getItem('savedCredentials')
    if (saved) {
      const creds = JSON.parse(saved)
      setSavedCredentials(creds)
      setRememberMe(true)
      form.setFieldsValue(creds)
    }
    checkServer()
  }, [])

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

  const onFinish = async (values: any) => {
    if (serverStatus !== 'online') {
      Toast.show({ icon: 'fail', content: '服务器连接中...' })
      return
    }
    setLoading(true)
    try {
      const authData = await pb.collection('users').authWithPassword(
        values.username.trim(),
        values.password
      )

      if (rememberMe) {
        localStorage.setItem('savedCredentials', JSON.stringify({
          username: values.username.trim(),
          password: values.password
        }))
      } else {
        localStorage.removeItem('savedCredentials')
      }

      Toast.show({ icon: 'success', content: '登录成功' })

      const role = (authData.record?.role || 'employee').toLowerCase()
      if (role === 'admin' || role === 'manager') {
        navigate('/admin')
      } else {
        navigate('/app')
      }
    } catch (error: any) {
      let errorMsg = '登录失败'
      if (error?.response?.code === 400) {
        errorMsg = '用户名或密码错误'
      } else if (error?.message?.includes('Failed to fetch')) {
        errorMsg = '网络连接失败'
      }
      Toast.show({ icon: 'fail', content: errorMsg })
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
      minHeight: '100vh',
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
            <span style={{ fontSize: 28 }}>🏗️</span>
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
          marginBottom: 32,
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
            <div>管理员: wang_manager / 12345678</div>
            <div>员工: li_audit / 12345678</div>
          </div>
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
