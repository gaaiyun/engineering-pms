import { useState, useRef, useMemo, useEffect } from 'react'
import { Avatar, Input, Toast, Button } from 'antd-mobile'
import { pb } from '../lib/pocketbase'
import { useNavigate } from 'react-router-dom'
import { IoDocumentTextOutline, IoListOutline, IoSettingsOutline, IoLogOutOutline, IoChevronForward, IoCameraOutline, IoClose } from 'react-icons/io5'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasks, useProjects } from '../lib/api'

// 30 个默认头像 (使用 DiceBear API)
const DEFAULT_AVATARS = Array.from({ length: 30 }, (_, i) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=avatar${i + 1}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
)

export default function Profile() {
  const navigate = useNavigate()
  const user = pb.authStore.model
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 获取真实数据
  const { data: tasks = [] } = useTasks()
  useProjects()
  
  // 计算用户统计数据
  const stats = useMemo(() => {
    const userId = user?.id
    if (!userId) return { projectCount: 0, taskCount: 0, completionRate: 0 }
    
    // 我参与的项目（作为assignee的任务所属的项目）
    const myProjects = new Set<string>()
    let myTasks = 0
    let completedTasks = 0
    
    tasks.forEach((task: any) => {
      const assignees = task.assignees || []
      if (assignees.includes(userId)) {
        myTasks++
        myProjects.add(task.project)
        if (task.status === 'completed') {
          completedTasks++
        }
      }
    })
    
    return {
      projectCount: myProjects.size,
      taskCount: myTasks,
      completionRate: myTasks > 0 ? Math.round((completedTasks / myTasks) * 100) : 0
    }
  }, [tasks, user?.id])

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(user?.name || '')
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  useEffect(() => {
    if (user?.name) setEditName(user.name)
  }, [user?.name])
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleLogout = () => {
    pb.authStore.clear()
    localStorage.removeItem('rememberMe')
    sessionStorage.removeItem('pocketbase_auth')
    navigate('/login', { replace: true })
  }

  // 保存个人资料
  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', editName)

      // 如果选择了默认头像（URL方式），需要先下载再上传
      if (selectedAvatar && selectedAvatar.startsWith('http')) {
        try {
          const response = await fetch(selectedAvatar)
          if (!response.ok) throw new Error('头像下载失败')
          const blob = await response.blob()
          formData.append('avatar', blob, 'avatar.svg')
        } catch {
          Toast.show({ icon: 'fail', content: '头像下载失败，请选择其他头像或上传自定义头像' })
          setSaving(false)
          return
        }
      }

      await pb.collection('users').update(user.id, formData)

      // 刷新 authStore
      await pb.collection('users').authRefresh()

      Toast.show({ icon: 'success', content: '保存成功' })
      setIsEditing(false)
      setShowAvatarPicker(false)
      setSelectedAvatar(null)
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error.message || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)

      await pb.collection('users').update(user.id, formData)
      await pb.collection('users').authRefresh()

      Toast.show({ icon: 'success', content: '头像已更新' })
      setShowAvatarPicker(false)
    } catch (error: any) {
      Toast.show({ icon: 'fail', content: error.message || '上传失败' })
    } finally {
      setSaving(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  }

  const currentAvatarUrl = user?.avatar ? pb.files.getUrl(user, user.avatar) : ''

  return (
    <div className="page" style={{ padding: 20 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20, borderBottom: 'none' }}>
        <div>
          <div className="page-subtitle">个人中心</div>
          <h2 className="page-title">我的资料</h2>
        </div>
        {!isEditing ? (
          <Button size="small" fill="none" style={{ color: 'var(--accent-color)', fontWeight: 600 }} onClick={() => setIsEditing(true)}>
            编辑
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" fill="none" style={{ color: '#94a3b8' }} onClick={() => { setIsEditing(false); setEditName(user?.name || '') }}>
              取消
            </Button>
            <Button size="small" color="primary" loading={saving} style={{ borderRadius: 8 }} onClick={handleSave}>
              保存
            </Button>
          </div>
        )}
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="show">
        {/* Holographic Apple-style ID Card */}
        <motion.div
          variants={itemVariants}
          className="holographic-card shimmer-effect"
          style={{
            padding: 32,
            marginBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Avatar with Edit Button */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Avatar
              src={selectedAvatar || currentAvatarUrl}
              style={{
                '--size': '88px',
                borderRadius: '50%',
                boxShadow: '0 8px 24px -6px rgba(0,0,0,0.1)',
                border: '4px solid #fff'
              }}
            />
            {isEditing && (
              <div
                onClick={() => setShowAvatarPicker(true)}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--accent-color)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
                }}
              >
                <IoCameraOutline size={16} />
              </div>
            )}
          </div>

          {/* Name Display/Edit */}
          {isEditing ? (
            <Input
              value={editName}
              onChange={setEditName}
              placeholder="输入您的姓名"
              style={{
                fontSize: 20, fontWeight: 700, textAlign: 'center',
                '--color': '#1e293b', marginBottom: 8, background: '#f8fafc',
                borderRadius: 12, padding: '8px 16px'
              }}
            />
          ) : (
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>
              {user?.name || user?.username || 'User'}
            </div>
          )}

          <div style={{
            fontSize: 13, color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 24
          }}>
            <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>{user?.department || '部门未设置'}</span>
            <span style={{ width: 4, height: 4, background: '#cbd5e1', borderRadius: '50%' }} />
            <span>{(user?.role === 'admin' || user?.role === 'manager') ? '项目经理' : '普通员工'}</span>
          </div>

          {/* Statistics Dashboard - Clean Business Style */}
          <div style={{ display: 'flex', gap: 16, width: '100%', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{stats.projectCount}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>参与项目</div>
            </div>
            <div style={{ width: 1, background: '#e2e8f0' }} />
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{stats.taskCount}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>全部任务</div>
            </div>
            <div style={{ width: 1, background: '#e2e8f0' }} />
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: stats.completionRate >= 80 ? '#16a34a' : stats.completionRate >= 50 ? '#f59e0b' : '#ef4444' }}>{stats.completionRate}%</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>完成率</div>
            </div>
          </div>
        </motion.div>

        {/* Menu List */}
        <motion.div variants={itemVariants} className="profile-table">
          <div className="profile-row" onClick={() => navigate('/my-projects')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                <IoDocumentTextOutline size={18} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>我的项目</span>
            </div>
            <IoChevronForward color="#CBD5E1" />
          </div>
          <div className="profile-row" onClick={() => navigate('/my-tasks')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
                <IoListOutline size={18} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>我的任务</span>
            </div>
            <IoChevronForward color="#CBD5E1" />
          </div>
          <div className="profile-row" onClick={() => navigate('/settings')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                <IoSettingsOutline size={18} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>设置</span>
            </div>
            <IoChevronForward color="#CBD5E1" />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} style={{ marginTop: 40, textAlign: 'center' }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid #E2E8F0',
              color: '#94A3B8',
              padding: '12px 32px',
              borderRadius: 30,
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1,
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
              gap: 8,
              transition: 'all 0.2s'
            }}
          >
            <IoLogOutOutline size={16} /> 退出登录
          </button>
        </motion.div>
      </motion.div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Avatar Picker Modal */}
      <AnimatePresence>
        {showAvatarPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center'
            }}
            onClick={() => setShowAvatarPicker(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: '24px 24px 0 0',
                padding: 24,
                width: '100%',
                maxWidth: 480,
                maxHeight: '70vh',
                overflow: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>选择头像</div>
                <IoClose size={24} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setShowAvatarPicker(false)} />
              </div>

              {/* Upload Button */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  padding: '14px 20px',
                  borderRadius: 12,
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <IoCameraOutline size={20} />
                上传自定义头像
              </div>

              {/* Default Avatars Grid */}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 12 }}>或选择默认头像</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 12
              }}>
                {DEFAULT_AVATARS.map((url, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedAvatar(url)}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: selectedAvatar === url ? '3px solid var(--accent-color)' : '2px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <img src={url} alt={`Avatar ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>

              {/* Confirm Button */}
              {selectedAvatar && (
                <Button
                  block
                  color="primary"
                  loading={saving}
                  style={{ marginTop: 20, borderRadius: 12, height: 48 }}
                  onClick={handleSave}
                >
                  使用此头像
                </Button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
