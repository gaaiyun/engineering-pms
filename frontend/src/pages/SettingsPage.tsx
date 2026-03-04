import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toast, Dialog, Input, Switch } from 'antd-mobile'
import { 
  IoArrowBackOutline, 
  IoChevronForward, 
  IoNotificationsOutline, 
  IoLockClosedOutline, 
  IoHelpCircleOutline, 
  IoInformationCircleOutline,
  IoKeyOutline,
  IoTrashOutline,
  IoCloudOutline
} from 'react-icons/io5'
import { pb } from '../lib/pocketbase'

interface SettingRowProps {
  icon: React.ReactNode
  color: string
  label: string
  value?: string
  onClick?: () => void
  rightContent?: React.ReactNode
}

const SettingRow: React.FC<SettingRowProps> = ({ icon, color, label, value, onClick, rightContent }) => (
  <div className="profile-row" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ 
        width: 32, 
        height: 32, 
        borderRadius: 8, 
        background: color, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: '#fff' 
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>{label}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {value && <span style={{ fontSize: 13, color: 'var(--neutral-400)' }}>{value}</span>}
      {rightContent}
      {onClick && !rightContent && <IoChevronForward color="#CBD5E1" />}
    </div>
  </div>
)

export default function SettingsPage() {
  const navigate = useNavigate()
  const user = pb.authStore.model
  
  // 通知设置
  const [notificationEnabled, setNotificationEnabled] = useState(() => {
    return localStorage.getItem('notification_enabled') !== 'false'
  })
  
  // API Key 设置
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [apiKey, setApiKey] = useState('')
  
  useEffect(() => {
    setApiKey(localStorage.getItem('sf_api_key') || '')
  }, [])

  const handleNotificationToggle = (checked: boolean) => {
    setNotificationEnabled(checked)
    localStorage.setItem('notification_enabled', String(checked))
    Toast.show({ content: checked ? '通知已开启' : '通知已关闭', icon: 'success' })
  }

  const handleChangePassword = async () => {
    const pwdValues = { old: '', new_: '', confirm: '' }
    const result = await Dialog.confirm({
      title: '修改密码',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Input
            type="password"
            placeholder="当前密码"
            style={{ '--font-size': '14px' }}
            onChange={v => pwdValues.old = v}
          />
          <Input
            type="password"
            placeholder="新密码"
            style={{ '--font-size': '14px' }}
            onChange={v => pwdValues.new_ = v}
          />
          <Input
            type="password"
            placeholder="确认新密码"
            style={{ '--font-size': '14px' }}
            onChange={v => pwdValues.confirm = v}
          />
        </div>
      ),
      confirmText: '确认修改',
      cancelText: '取消',
    })

    if (result) {
      if (!pwdValues.old || !pwdValues.new_ || !pwdValues.confirm) {
        Toast.show({ content: '请填写完整', icon: 'fail' })
        return
      }

      if (pwdValues.new_ !== pwdValues.confirm) {
        Toast.show({ content: '两次密码不一致', icon: 'fail' })
        return
      }

      if (pwdValues.new_.length < 8) {
        Toast.show({ content: '密码至少8位', icon: 'fail' })
        return
      }

      try {
        if (!user?.id) {
          Toast.show({ content: '用户未登录', icon: 'fail' })
          return
        }
        await pb.collection('users').update(user.id, {
          oldPassword: pwdValues.old,
          password: pwdValues.new_,
          passwordConfirm: pwdValues.confirm,
        })
        Toast.show({ content: '密码修改成功', icon: 'success' })
      } catch (error: any) {
        Toast.show({ content: error.message || '修改失败', icon: 'fail' })
      }
    }
  }

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('sf_api_key', apiKey.trim())
      Toast.show({ content: 'API Key 已保存', icon: 'success' })
    } else {
      localStorage.removeItem('sf_api_key')
      Toast.show({ content: 'API Key 已清除', icon: 'success' })
    }
    setShowApiKeyDialog(false)
  }

  const handleClearCache = async () => {
    const result = await Dialog.confirm({
      title: '清除缓存',
      content: '确定要清除本地缓存数据吗？这将清除登录凭证之外的所有本地存储。',
      confirmText: '确认清除',
      cancelText: '取消',
    })

    if (result) {
      // 保留登录信息
      const authData = localStorage.getItem('pocketbase_auth')
      localStorage.clear()
      sessionStorage.clear()
      if (authData) {
        localStorage.setItem('pocketbase_auth', authData)
      }

      // 同时清理 Service Worker 缓存（避免“仍然是老界面”）
      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
        }
      } catch {
        // ignore
      }

      Toast.show({ content: '缓存已清除，正在刷新...', icon: 'success' })
      setTimeout(() => window.location.reload(), 300)
    }
  }

  const handleHelp = () => {
    Dialog.alert({
      title: '帮助中心',
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: '#64748b' }}>
          <p><strong>使用指南：</strong></p>
          <p>1. 工作进展：查看和管理项目任务</p>
          <p>2. 项目时间轴：可视化项目进度</p>
          <p>3. 看板视图：拖拽管理任务状态</p>
          <p>4. AI 决策：智能分析项目风险</p>
          <br />
          <p><strong>联系支持：</strong></p>
          <p>邮箱：support@engineering.com</p>
        </div>
      ),
      confirmText: '知道了',
    })
  }

  const handleAbout = () => {
    Dialog.alert({
      title: '关于版本',
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: '#64748b', textAlign: 'center' }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>PM</p>
          <p style={{ fontWeight: 700, color: '#1e293b', fontSize: 16 }}>工程结算管理系统</p>
          <p>版本 v2.1.0</p>
          <br />
          <p>基于 React + PocketBase</p>
          <p>AI 驱动的项目管理工具</p>
          <br />
          <p style={{ fontSize: 12 }}>© 2026 Engineering Settlement System</p>
        </div>
      ),
      confirmText: '确定',
    })
  }

  return (
    <div className="page" style={{ padding: 20 }}>
      <div className="glass-header" style={{ 
        padding: '16px 20px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12, 
        marginBottom: 24, 
        position: 'sticky', 
        top: 0, 
        zIndex: 10,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--neutral-600)', display: 'flex', cursor: 'pointer' }}
        >
          <IoArrowBackOutline size={24} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>系统设置</div>
      </div>

      {/* 通用设置 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-500)', marginBottom: 8, paddingLeft: 12 }}>通用</div>
      <div className="profile-table" style={{ marginBottom: 24 }}>
        <SettingRow
          icon={<IoNotificationsOutline size={18} />}
          color="#EF4444"
          label="消息通知"
          rightContent={
            <Switch
              checked={notificationEnabled}
              onChange={handleNotificationToggle}
              style={{ '--height': '24px', '--width': '44px' }}
            />
          }
        />
        <SettingRow
          icon={<IoLockClosedOutline size={18} />}
          color="#3B82F6"
          label="修改密码"
          onClick={handleChangePassword}
        />
        <SettingRow
          icon={<IoTrashOutline size={18} />}
          color="#F97316"
          label="清除缓存"
          onClick={handleClearCache}
        />
      </div>

      {/* AI 设置 - 仅经理可见 */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-500)', marginBottom: 8, paddingLeft: 12 }}>AI 设置</div>
          <div className="profile-table" style={{ marginBottom: 24 }}>
            <SettingRow
              icon={<IoKeyOutline size={18} />}
              color="#8B5CF6"
              label="API Key"
              value={apiKey ? '已配置' : '未配置'}
              onClick={() => setShowApiKeyDialog(true)}
            />
            <SettingRow
              icon={<IoCloudOutline size={18} />}
              color="#06B6D4"
              label="AI 模型"
              value={localStorage.getItem('ai_model')?.replace('deepseek-ai/', '') || 'DeepSeek-V3'}
              onClick={() => {
                Dialog.alert({
                  title: 'AI 模型设置',
                  content: (
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: '#64748b' }}>
                      <p>当前使用模型：<strong>DeepSeek-V3</strong></p>
                      <p style={{ marginTop: 8 }}>模型切换功能请前往管理控制台的「AI决策」页面配置。</p>
                    </div>
                  ),
                  confirmText: '知道了',
                })
              }}
            />
          </div>
        </>
      )}

      {/* 关于 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-500)', marginBottom: 8, paddingLeft: 12 }}>关于</div>
      <div className="profile-table">
        <SettingRow
          icon={<IoHelpCircleOutline size={18} />}
          color="#10B981"
          label="帮助中心"
          onClick={handleHelp}
        />
        <SettingRow
          icon={<IoInformationCircleOutline size={18} />}
          color="#64748B"
          label="关于版本"
          value="v2.1.0"
          onClick={handleAbout}
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--neutral-400)', fontSize: 12 }}>
        Engineering Settlement System
        <br />
        © 2026 All Rights Reserved
      </div>

      {/* API Key Dialog */}
      <Dialog
        visible={showApiKeyDialog}
        title="配置 AI API Key"
        content={
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              请输入 SiliconFlow API Key，用于 AI 智能分析功能
            </p>
            <Input
              value={apiKey}
              onChange={setApiKey}
              placeholder="sk-..."
              style={{ '--font-size': '14px' }}
            />
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
              获取方式：访问 siliconflow.cn 注册并获取 API Key
            </p>
          </div>
        }
        closeOnAction
        onClose={() => setShowApiKeyDialog(false)}
        actions={[
          [
            { key: 'cancel', text: '取消' },
            { key: 'save', text: '保存', bold: true, onClick: handleSaveApiKey },
          ],
        ]}
      />
    </div>
  )
}
