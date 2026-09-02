import { useState } from 'react'
import { Button, Form, Input, Toast } from 'antd-mobile'
import { IoLockClosedOutline, IoLogOutOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import { changeCurrentPassword } from '../lib/account'
import { getPocketBaseErrorMessage, logout } from '../lib/pocketbase'
import './ChangePassword.css'

type PasswordValues = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function ChangePassword() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const submit = async (values: PasswordValues) => {
    if (values.newPassword !== values.confirmPassword) {
      Toast.show({ icon: 'fail', content: '两次输入的新密码不一致' })
      return
    }
    if (values.currentPassword === values.newPassword) {
      Toast.show({ icon: 'fail', content: '新密码不能与初始密码相同' })
      return
    }

    setSaving(true)
    try {
      await changeCurrentPassword(values.currentPassword, values.newPassword)
      Toast.show({ icon: 'success', content: '密码已更新' })
      navigate('/app', { replace: true })
    } catch (error) {
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '密码修改失败') })
    } finally {
      setSaving(false)
    }
  }

  const exit = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="password-change-page">
      <section className="password-change-panel" aria-labelledby="password-change-title">
        <div className="password-change-icon"><IoLockClosedOutline aria-hidden="true" /></div>
        <p className="password-change-kicker">账号安全</p>
        <h1 id="password-change-title">首次登录请修改密码</h1>
        <p className="password-change-description">设置仅由你本人知道的新密码，完成前暂不能进入项目数据。</p>

        <Form layout="vertical" onFinish={submit} footer={null}>
          <Form.Item name="currentPassword" label="当前初始密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input type="password" autoComplete="current-password" placeholder="请输入当前密码" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 8, message: '新密码至少 8 位' }]}>
            <Input type="password" autoComplete="new-password" placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Input type="password" autoComplete="new-password" placeholder="再次输入新密码" />
          </Form.Item>
          <Button block color="primary" type="submit" loading={saving}>保存并进入系统</Button>
        </Form>

        <button type="button" className="password-change-exit" onClick={exit}><IoLogOutOutline />退出当前账号</button>
      </section>
    </main>
  )
}
