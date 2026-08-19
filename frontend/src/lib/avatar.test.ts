import { describe, expect, it } from 'vitest'
import {
  createProfessionalAvatar,
  getAvatarInitials,
  getProfessionalAvatarOptions,
  isLegacyGeneratedAvatar,
} from './avatar'

describe('professional avatars', () => {
  it('uses concise Chinese and Latin initials', () => {
    expect(getAvatarInitials('张明远')).toBe('明远')
    expect(getAvatarInitials('李文博')).toBe('文博')
    expect(getAvatarInitials('Mingyuan Zhang')).toBe('MZ')
  })

  it('creates deterministic local SVG data URLs', () => {
    expect(createProfessionalAvatar('张明远')).toBe(createProfessionalAvatar('张明远'))
    expect(createProfessionalAvatar('张明远')).toMatch(/^data:image\/svg\+xml/)
    expect(getProfessionalAvatarOptions('张明远')).toHaveLength(6)
  })

  it('renders the last two Chinese name characters as the primary identity', () => {
    const svg = decodeURIComponent(createProfessionalAvatar('张明远').split(',')[1])
    expect(svg).toContain('data-role="identity-name"')
    expect(svg).toContain('>明远</text>')
    expect(svg).not.toContain('data-role="face"')
    expect(svg).not.toContain('linearGradient')
  })

  it('only replaces known generated avatar filenames', () => {
    expect(isLegacyGeneratedAvatar('zhang_mingyuan_avatar_A1b2.svg')).toBe(true)
    expect(isLegacyGeneratedAvatar('avatar.svg')).toBe(true)
    expect(isLegacyGeneratedAvatar('portrait_2026.jpg')).toBe(false)
  })
})
