import { pb } from './pocketbase'

export interface AvatarUserLike {
  id?: string
  name?: string
  username?: string
  avatar?: string
  collectionId?: string
  collectionName?: string
}

const PROFESSIONAL_PALETTES = [
  { background: '#173B65', foreground: '#F8FAFC', accent: '#6FA8DC' },
  { background: '#263746', foreground: '#F8FAFC', accent: '#8FA7B8' },
  { background: '#1F4D46', foreground: '#F8FAFC', accent: '#75A99E' },
  { background: '#4B3D52', foreground: '#F8FAFC', accent: '#A38BAA' },
  { background: '#5A4235', foreground: '#FFFDF8', accent: '#B49A82' },
  { background: '#374151', foreground: '#F9FAFB', accent: '#9CA3AF' },
] as const

function hash(value: string): number {
  let result = 0
  for (let i = 0; i < value.length; i += 1) {
    result = ((result << 5) - result + value.charCodeAt(i)) | 0
  }
  return Math.abs(result)
}

export function getAvatarInitials(value?: string): string {
  const normalized = (value || '成员').replace(/\s*\([^)]*\)\s*/g, '').trim()
  if (!normalized) return '成员'

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
  }

  const chinese = Array.from(normalized).filter(char => /[\u3400-\u9fff]/.test(char))
  if (chinese.length) return chinese.slice(-2).join('')
  return normalized.slice(0, 2).toUpperCase()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function createProfessionalAvatar(name?: string, variant = 0): string {
  const identity = (name || '成员').trim() || '成员'
  const palette = PROFESSIONAL_PALETTES[(hash(identity) + variant) % PROFESSIONAL_PALETTES.length]
  const initials = escapeXml(getAvatarInitials(identity))
  const safeIdentity = escapeXml(identity)
  const fontSize = initials.length > 1 ? 46 : 58
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <title>${safeIdentity} 姓名头像</title>
      <rect width="160" height="160" rx="22" fill="${palette.background}"/>
      <circle cx="132" cy="28" r="42" fill="${palette.accent}" opacity=".18"/>
      <path d="M0 131c38-13 73-17 108-11 19 3 36 9 52 18v22H0z" fill="${palette.accent}" opacity=".22"/>
      <text data-role="identity-name" x="80" y="96" text-anchor="middle" font-family="Inter,Arial,'Microsoft YaHei',sans-serif" font-size="${fontSize}" font-weight="750" letter-spacing="1" fill="${palette.foreground}">${initials}</text>
      <text x="80" y="126" text-anchor="middle" font-family="Inter,Arial,'Microsoft YaHei',sans-serif" font-size="10" font-weight="600" letter-spacing="2" fill="${palette.foreground}" opacity=".66">ENGINEERING</text>
      <rect x="1" y="1" width="158" height="158" rx="21" fill="none" stroke="#0F172A" opacity=".10" stroke-width="2"/>
    </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/**
 * 旧初始化脚本生成的卡通头像统一带 `_avatar` 文件名。
 * 真实上传照片不做替换，避免覆盖用户自己的头像。
 */
export function isLegacyGeneratedAvatar(filename?: string): boolean {
  return Boolean(filename && /(?:^|_)avatar(?:_|\.|$)/i.test(filename))
}

export function getUserAvatarUrl(user?: AvatarUserLike | null): string {
  if (!user) return createProfessionalAvatar('成员')
  if (user.avatar && !isLegacyGeneratedAvatar(user.avatar)) {
    return pb.files.getUrl(user as Parameters<typeof pb.files.getUrl>[0], user.avatar)
  }
  return createProfessionalAvatar(user.name || user.username || user.id)
}

export function getProfessionalAvatarOptions(name?: string): string[] {
  return PROFESSIONAL_PALETTES.map((_, index) => createProfessionalAvatar(name, index))
}
