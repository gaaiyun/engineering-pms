import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button, Input, Popup, Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import {
  IoBriefcaseOutline,
  IoCameraOutline,
  IoChevronForward,
  IoClose,
  IoLogOutOutline,
  IoMailOutline,
  IoPeopleOutline,
  IoPersonOutline,
  IoSettingsOutline,
} from 'react-icons/io5'
import { pb, getPocketBaseErrorMessage } from '../lib/pocketbase'
import { useProjects, useTasks } from '../lib/api'
import { logoutWithDeviceCleanup } from '../lib/pushNotifications'
import { canAccessSystem, normalizeAppRole } from '../lib/navigation'
import { getProfessionalAvatarOptions, getUserAvatarUrl } from '../lib/avatar'
import './Profile.css'

const ROLE_LABELS = {
  employee: '普通员工',
  manager: '项目经理',
  admin: '系统管理员',
} as const

type ProfileActionProps = {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}

function ProfileAction({ icon, title, description, onClick }: ProfileActionProps) {
  return (
    <button type="button" className="profile-action" onClick={onClick}>
      <span className="profile-action__icon">{icon}</span>
      <span className="profile-action__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <IoChevronForward className="profile-action__arrow" aria-hidden />
    </button>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const user = pb.authStore.model
  const appRole = normalizeAppRole(user?.role)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const taskQuery = useTasks()
  const projectQuery = useProjects()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(user?.name || '')
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditName(user?.name || '')
  }, [user?.name])

  const stats = useMemo(() => {
    const userId = user?.id
    if (!userId) return { projectCount: 0, taskCount: 0, completionRate: 0 }
    const tasks = taskQuery.data || []
    const projects = projectQuery.data || []
    let taskCount = 0
    let completedCount = 0
    tasks.forEach(task => {
      if (!task.assignees?.includes(userId)) return
      taskCount += 1
      if (task.status === 'completed') completedCount += 1
    })
    return {
      projectCount: projects.filter(project => project.manager === userId || project.members?.includes(userId)).length,
      taskCount,
      completionRate: taskCount ? Math.round((completedCount / taskCount) * 100) : 0,
    }
  }, [projectQuery.data, taskQuery.data, user?.id])

  const cancelEditing = () => {
    setIsEditing(false)
    setEditName(user?.name || '')
    setSelectedAvatar(null)
  }

  const handleSave = async () => {
    if (!user) return
    const name = editName.trim()
    if (!name) {
      Toast.show({ icon: 'fail', content: '姓名不能为空' })
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      if (selectedAvatar) {
        const response = await fetch(selectedAvatar)
        if (!response.ok) throw new Error('头像读取失败')
        formData.append('avatar', await response.blob(), 'professional-avatar.svg')
      }
      await pb.collection('users').update(user.id, formData)
      await pb.collection('users').authRefresh()
      Toast.show({ icon: 'success', content: '个人资料已更新' })
      setIsEditing(false)
      setShowAvatarPicker(false)
      setSelectedAvatar(null)
    } catch (error: unknown) {
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '保存失败') })
    } finally {
      setSaving(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      Toast.show({ icon: 'fail', content: '请选择图片文件' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      Toast.show({ icon: 'fail', content: '头像不能超过 5MB' })
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      await pb.collection('users').update(user.id, formData)
      await pb.collection('users').authRefresh()
      Toast.show({ icon: 'success', content: '头像已更新' })
      setShowAvatarPicker(false)
      setSelectedAvatar(null)
    } catch (error: unknown) {
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '上传失败') })
    } finally {
      event.target.value = ''
      setSaving(false)
    }
  }

  const displayAvatar = selectedAvatar || getUserAvatarUrl(user)
  const roleLabel = ROLE_LABELS[appRole]

  return (
    <div className="page profile-page">
      <header className="profile-page__header">
        <div>
          <p>个人中心</p>
          <h1>我的资料</h1>
        </div>
        {isEditing ? (
          <div className="profile-page__header-actions">
            <Button size="small" fill="none" onClick={cancelEditing}>取消</Button>
            <Button size="small" color="primary" loading={saving} onClick={handleSave}>保存修改</Button>
          </div>
        ) : (
          <Button size="small" fill="outline" onClick={() => setIsEditing(true)}>编辑资料</Button>
        )}
      </header>

      {(taskQuery.isError || projectQuery.isError) && (
        <div className="profile-load-error" role="alert">
          <span>工作统计加载失败，当前不显示可能不准确的数字。</span>
          <button type="button" onClick={() => { taskQuery.refetch(); projectQuery.refetch() }}>重新加载</button>
        </div>
      )}

      <div className="profile-layout">
        <section className="profile-identity" aria-label="员工身份信息">
          <div className="profile-identity__main">
            <div className="profile-avatar-wrap">
              <Avatar src={displayAvatar} className="profile-avatar" />
              {isEditing && (
                <button type="button" className="profile-avatar-edit" onClick={() => setShowAvatarPicker(true)} aria-label="更换头像">
                  <IoCameraOutline />
                </button>
              )}
            </div>
            <div className="profile-identity__copy">
              {isEditing ? (
                <Input className="profile-name-input" value={editName} onChange={setEditName} placeholder="请输入真实姓名" maxLength={30} />
              ) : (
                <h2>{user?.name || user?.username || '未命名成员'}</h2>
              )}
              <div className="profile-identity__meta">
                <span>{user?.department || '部门未设置'}</span>
                <span aria-hidden>·</span>
                <span>{roleLabel}</span>
              </div>
              <div className="profile-identity__status"><i /> 在职 · 账号正常</div>
            </div>
          </div>

          {!taskQuery.isError && !projectQuery.isError && <dl className="profile-stats">
            <div><dt>参与项目</dt><dd>{stats.projectCount}</dd></div>
            <div><dt>负责任务</dt><dd>{stats.taskCount}</dd></div>
            <div><dt>任务完成率</dt><dd>{stats.completionRate}%</dd></div>
          </dl>}
        </section>

        <section className="profile-details" aria-labelledby="profile-details-title">
          <div className="profile-section-heading">
            <div>
              <h2 id="profile-details-title">基本信息</h2>
              <p>用于项目协作与系统通知</p>
            </div>
          </div>
          <dl className="profile-info-list">
            <div><dt><IoPersonOutline />登录账号</dt><dd>{user?.username || '—'}</dd></div>
            <div><dt><IoMailOutline />工作邮箱</dt><dd>{user?.email || '未设置'}</dd></div>
            <div><dt><IoPeopleOutline />所属部门</dt><dd>{user?.department || '未设置'}</dd></div>
            <div><dt><IoBriefcaseOutline />系统角色</dt><dd>{roleLabel}</dd></div>
          </dl>
        </section>

        <section className="profile-links" aria-labelledby="profile-links-title">
          <div className="profile-section-heading">
            <div>
              <h2 id="profile-links-title">工作与设置</h2>
              <p>常用入口集中在这里</p>
            </div>
          </div>
          <div className="profile-action-list">
            <ProfileAction icon={<IoBriefcaseOutline />} title="我的项目" description="查看参与项目与时间轴" onClick={() => navigate('/my-projects')} />
            <ProfileAction icon={<IoPersonOutline />} title="我的任务" description="处理任务、卡点与交接" onClick={() => navigate('/my-tasks')} />
            <ProfileAction icon={<IoSettingsOutline />} title="偏好设置" description="通知、显示与账号安全" onClick={() => navigate('/settings')} />
            {canAccessSystem(appRole) && (
              <ProfileAction icon={<IoPeopleOutline />} title="用户管理" description="维护成员账号与角色" onClick={() => navigate('/system/users')} />
            )}
          </div>
        </section>
      </div>

      <button type="button" className="profile-logout" onClick={async () => {
        await logoutWithDeviceCleanup()
        navigate('/login', { replace: true })
      }}>
        <IoLogOutOutline />退出当前账号
      </button>

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileUpload} />
      <Popup
        visible={showAvatarPicker}
        onMaskClick={() => setShowAvatarPicker(false)}
        bodyClassName="profile-avatar-popup"
      >
        <div className="profile-avatar-picker">
          <header>
            <div><h2>设置员工头像</h2><p>建议使用清晰、正面的本人照片；也可选择统一企业字标</p></div>
            <button type="button" onClick={() => setShowAvatarPicker(false)} aria-label="关闭"><IoClose /></button>
          </header>
          <button type="button" className="profile-avatar-upload" onClick={() => fileInputRef.current?.click()}>
            <IoCameraOutline /><span><strong>上传本人照片</strong><small>JPG、PNG，最大 5MB</small></span>
          </button>
          <div className="profile-avatar-presets-label">企业字标</div>
          <div className="profile-avatar-presets">
            {getProfessionalAvatarOptions(editName || user?.name || user?.username).map(url => (
              <button
                type="button"
                key={url}
                className={selectedAvatar === url ? 'is-selected' : ''}
                onClick={() => setSelectedAvatar(url)}
              >
                <img src={url} alt="企业头像预设" />
              </button>
            ))}
          </div>
          <Button block color="primary" disabled={!selectedAvatar} loading={saving} onClick={handleSave}>应用所选头像</Button>
        </div>
      </Popup>
    </div>
  )
}
