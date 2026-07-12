import { describe, expect, it } from 'vitest'
import {
  createProfessionalAvatar,
  getAvatarInitials,
  getProfessionalAvatarOptions,
  isLegacyGeneratedAvatar,
} from './avatar'

describe('professional avatars', () => {
  it('uses concise Chinese and Latin initials', () => {
    expect(getAvatarInitials('岑锴源')).toBe('锴源')
    expect(getAvatarInitials('吴奇龙')).toBe('奇龙')
    expect(getAvatarInitials('Kaiyuan Cen')).toBe('KC')
  })

  it('creates deterministic local SVG data URLs', () => {
    expect(createProfessionalAvatar('岑开源')).toBe(createProfessionalAvatar('岑开源'))
    expect(createProfessionalAvatar('岑开源')).toMatch(/^data:image\/svg\+xml/)
    expect(getProfessionalAvatarOptions('岑开源')).toHaveLength(6)
  })

  it('renders the last two Chinese name characters as the primary identity', () => {
    const svg = decodeURIComponent(createProfessionalAvatar('岑锴源').split(',')[1])
    expect(svg).toContain('data-role="identity-name"')
    expect(svg).toContain('>锴源</text>')
    expect(svg).not.toContain('data-role="face"')
    expect(svg).not.toContain('linearGradient')
  })

  it('only replaces known generated avatar filenames', () => {
    expect(isLegacyGeneratedAvatar('cen_kaiyuan_avatar_A1b2.svg')).toBe(true)
    expect(isLegacyGeneratedAvatar('avatar.svg')).toBe(true)
    expect(isLegacyGeneratedAvatar('portrait_2026.jpg')).toBe(false)
  })
})
