import { useState } from 'react'
import { Form, Input, Button, Toast, Selector } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { motion } from 'framer-motion'
import { 
  IoPersonOutline, 
  IoMailOutline, 
  IoLockClosedOutline, 
  IoEyeOutline, 
  IoEyeOffOutline,
  IoArrowBackOutline,
  IoCheckmarkCircle
} from 'react-icons/io5'

const Register = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form] = Form.useForm()
  const [step, setStep] = useState(1) // 分步注册

  const departments = [
    { label: '工程部', value: '工程部' },
    { label: '审计部', value: '审计部' },
    { label: '财务部', value: '财务部' },
    { label: '设计院', value: '设计院' },
    { label: '监理部', value: '监理部' },
  ]

  const onFinish = async (values: any) => {
    if (values.password !== values.confirmPassword) {
      Toast.show({ content: '两次密码不一致', icon: 'fail' })
      return
    }

    setLoading(true)
    try {
      await pb.collection('users').create({
        username: values.email.split('@')[0] + '_' + Math.random().toString(36).substring(2, 7),
        email: values.email,
        password: values.password,
        passwordConfirm: values.confirmPassword,
        name: values.nickname,
        department: values.department?.[0] || '工程部',
        role: 'employee',
      })

      await pb.collection('users').authWithPassword(values.email, values.password)

      Toast.show({ content: '注册成功', icon: 'success' })
      navigate('/app')
    } catch (error: any) {
      let msg = '注册失败'
      if (error?.data?.data?.email?.message) msg = `邮箱错误: ${error.data.data.email.message}`
      else if (error?.data?.data?.username?.message) msg = `用户名错误: ${error.data.data.username.message}`
      else if (error?.message) msg = error.message

      Toast.show({ content: msg, icon: 'fail', duration: 3000 })
    } finally {
      setLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  }

  const InputWrapper = ({ icon, children }: { icon: React.ReactNode, children: React.ReactNode }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: '#F8FAFC',
      borderRadius: 14,
      padding: '4px 16px',
      border: '2px solid transparent',
      transition: 'all 0.2s'
    }}>
      <div style={{ color: '#94A3B8', flexShrink: 0, display: 'flex' }}>{icon}</div>
      {children}
    </div>
  )

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
        left: -100,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
        filter: 'blur(60px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: -150,
        right: -150,
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
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
          padding: '40px 36px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* 返回按钮 */}
        <motion.div 
          variants={itemVariants}
          onClick={() => navigate('/login')}
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            width: 40,
            height: 40,
            borderRadius: 12,
            background: '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <IoArrowBackOutline size={20} color="#64748B" />
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: 36, marginTop: 20 }}>
          <div style={{
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
          }}>
            <span style={{ fontSize: 24 }}>👋</span>
          </div>
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            color: '#0F172A',
            marginBottom: 8,
            letterSpacing: '-0.5px'
          }}>
            创建新账户
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', fontWeight: 500 }}>
            加入工程管理系统
          </p>
        </motion.div>

        {/* 步骤指示器 */}
        <motion.div variants={itemVariants} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 32
        }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              width: s === step ? 32 : 10,
              height: 10,
              borderRadius: 5,
              background: s <= step ? '#10B981' : '#E2E8F0',
              transition: 'all 0.3s'
            }} />
          ))}
        </motion.div>

        <Form
          form={form}
          layout='vertical'
          onFinish={onFinish}
          style={{ '--border-top': 'none', '--border-bottom': 'none' }}
        >
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <motion.div variants={itemVariants}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>您的姓名</div>
                <Form.Item name='nickname' rules={[{ required: true, message: '请输入姓名' }]}>
                  <InputWrapper icon={<IoPersonOutline size={20} />}>
                    <Input
                      placeholder='请输入您的真实姓名'
                      style={{
                        '--font-size': '15px',
                        '--placeholder-color': '#94A3B8',
                        border: 'none',
                        background: 'transparent',
                        padding: '12px'
                      }}
                    />
                  </InputWrapper>
                </Form.Item>
              </motion.div>

              <motion.div variants={itemVariants}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>电子邮箱</div>
                <Form.Item name='email' rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '格式不正确' }]}>
                  <InputWrapper icon={<IoMailOutline size={20} />}>
                    <Input
                      placeholder='name@company.com'
                      style={{
                        '--font-size': '15px',
                        '--placeholder-color': '#94A3B8',
                        border: 'none',
                        background: 'transparent',
                        padding: '12px'
                      }}
                    />
                  </InputWrapper>
                </Form.Item>
              </motion.div>

              <motion.div variants={itemVariants}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>所属部门</div>
                <Form.Item name='department'>
                  <Selector
                    options={departments}
                    style={{
                      '--border-radius': '12px',
                      '--border': 'none',
                      '--checked-border': 'none',
                      '--padding': '10px 16px',
                      '--checked-color': '#10B981',
                      '--checked-text-color': '#fff'
                    }}
                  />
                </Form.Item>
              </motion.div>

              <motion.div variants={itemVariants} style={{ marginTop: 24 }}>
                <Button
                  block
                  onClick={async () => {
                    try {
                      await form.validateFields(['nickname', 'email'])
                      setStep(2)
                    } catch {}
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 14,
                    height: 52,
                    fontSize: 16,
                    fontWeight: 700,
                    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  下一步 →
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <motion.div variants={itemVariants}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>设置密码</div>
                <Form.Item name='password' rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '至少8位' }]}>
                  <InputWrapper icon={<IoLockClosedOutline size={20} />}>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder='至少8位字符'
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
                  </InputWrapper>
                </Form.Item>
              </motion.div>

              <motion.div variants={itemVariants}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>确认密码</div>
                <Form.Item name='confirmPassword' rules={[{ required: true, message: '请确认密码' }]}>
                  <InputWrapper icon={<IoCheckmarkCircle size={20} />}>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder='再次输入密码'
                      style={{
                        '--font-size': '15px',
                        '--placeholder-color': '#94A3B8',
                        border: 'none',
                        background: 'transparent',
                        padding: '12px'
                      }}
                    />
                  </InputWrapper>
                </Form.Item>
              </motion.div>

              <motion.div variants={itemVariants} style={{
                padding: 16,
                background: '#F0FDF4',
                borderRadius: 12,
                marginTop: 16,
                marginBottom: 24
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IoCheckmarkCircle size={18} color="#10B981" />
                  <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
                    注册后将自动登录系统
                  </span>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} style={{ display: 'flex', gap: 12 }}>
                <Button
                  onClick={() => setStep(1)}
                  style={{
                    flex: 1,
                    background: '#F1F5F9',
                    border: 'none',
                    color: '#64748B',
                    borderRadius: 14,
                    height: 52,
                    fontSize: 15,
                    fontWeight: 600
                  }}
                >
                  ← 返回
                </Button>
                <Button
                  type='submit'
                  loading={loading}
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 14,
                    height: 52,
                    fontSize: 16,
                    fontWeight: 700,
                    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  完成注册
                </Button>
              </motion.div>
            </motion.div>
          )}
        </Form>

        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginTop: 28 }}>
          <span style={{ color: '#94A3B8', fontSize: 14 }}>
            已有账号？
            <span
              onClick={() => navigate('/login')}
              style={{ color: '#2563EB', cursor: 'pointer', fontWeight: 600, marginLeft: 4 }}
            >
              立即登录
            </span>
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default Register
