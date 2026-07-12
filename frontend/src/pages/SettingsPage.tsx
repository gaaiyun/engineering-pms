import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSurface } from '../lib/useAppSurface'
import { APP_NAME, APP_VERSION } from '../lib/appMeta'
import { Toast, Dialog, Input, Switch } from 'antd-mobile'
import { 
  IoArrowBackOutline, 
  IoChevronForward, 
  IoNotificationsOutline, 
  IoLockClosedOutline, 
  IoHelpCircleOutline, 
  IoInformationCircleOutline,
  IoTrashOutline,
  IoCloudOutline
} from 'react-icons/io5'
import { getPocketBaseErrorMessage, pb } from '../lib/pocketbase'

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ 
        width: 29,
        height: 29,
        borderRadius: 7,
        background: color, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: '#fff' 
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{label}</span>
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
  // Bug fix J-1: 桌面端不渲染 mobile page header（与 AppShell TopBar 重复）
  const isCompact = useAppSurface() === 'compact'

  // 通知设置
  const [notificationEnabled, setNotificationEnabled] = useState(() => {
    return localStorage.getItem('notification_enabled') !== 'false'
  })
  
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
      } catch (error) {
        Toast.show({ content: getPocketBaseErrorMessage(error, '修改失败'), icon: 'fail' })
      }
    }
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
      const localKeys = ['pocketbase_auth', 'rememberMe', 'savedUsername', 'pb_url', 'push_device_id', 'notification_enabled']
      const preservedLocal = localKeys
        .map(key => [key, localStorage.getItem(key)] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== null)
      const sessionAuth = sessionStorage.getItem('pocketbase_auth')
      localStorage.clear()
      sessionStorage.clear()
      preservedLocal.forEach(([key, value]) => localStorage.setItem(key, value))
      if (sessionAuth) sessionStorage.setItem('pocketbase_auth', sessionAuth)

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
          <img src="/icons/icon-96x96.png" alt="EngineeringPMS" width={56} height={56} style={{ display: 'block', margin: '0 auto 10px', borderRadius: 13 }} />
          <p style={{ fontWeight: 700, color: '#1e293b', fontSize: 16 }}>{APP_NAME}</p>
          <p>版本 v{APP_VERSION}</p>
          <br />
          <p>基于 React + PocketBase</p>
          <p>工程项目协作与进度管理工具</p>
          <br />
          <p style={{ fontSize: 12 }}>© 2026 Engineering Settlement System</p>
        </div>
      ),
      confirmText: '确定',
    })
  }

  return (
    <div className="page" style={{ padding: isCompact ? 12 : 20 }}>
      {/* Bug fix J-1: 仅 mobile 渲染 page header */}
      {isCompact && (
      <div className="glass-header" style={{
        padding: '9px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        borderRadius: 9,
        boxShadow: 'none'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--neutral-600)', display: 'flex', cursor: 'pointer' }}
        >
          <IoArrowBackOutline size={24} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 760 }}>系统设置</div>
      </div>
      )}

      {/* 通用设置 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-500)', marginBottom: 8, paddingLeft: 12 }}>通用</div>
      <div className="profile-table" style={{ marginBottom: isCompact ? 15 : 24 }}>
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

      {/* AI 设置 - 仅管理员可见 */}
      {user?.role === 'admin' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-500)', marginBottom: 8, paddingLeft: 12 }}>AI 设置</div>
          <div className="profile-table" style={{ marginBottom: isCompact ? 15 : 24 }}>
            <SettingRow
              icon={<IoCloudOutline size={18} />}
              color="#06B6D4"
              label="AI 模型"
              value={localStorage.getItem('ai_model') || '服务端配置'}
              onClick={() => navigate('/system/ai')}
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
          value={`v${APP_VERSION}`}
          onClick={handleAbout}
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--neutral-400)', fontSize: 12 }}>
        Engineering Settlement System
        <br />
        © 2026 All Rights Reserved
      </div>

    </div>
  )
}
