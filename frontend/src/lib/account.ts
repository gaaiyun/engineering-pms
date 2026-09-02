import { pb } from './pocketbase'

export async function changeCurrentPassword(currentPassword: string, newPassword: string) {
  const result = await pb.send<{ token: string; record: Record<string, unknown> }>('/api/custom/auth/change-password', {
    method: 'POST',
    body: {
      current_password: currentPassword,
      new_password: newPassword,
      password_confirm: newPassword,
    },
  })

  if (!result.token || !result.record) throw new Error('服务器没有返回新的登录凭证')
  pb.authStore.save(result.token, result.record)
  return result
}
