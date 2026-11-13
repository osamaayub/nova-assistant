import { describe, expect, it } from 'vitest'
import { avatarPoints, AVATARS, pickSystemVoice } from '../src/renderer/src/features/orb/avatars'
import { clockTime, utcDate } from '../src/renderer/src/features/monitor/clocks'
import { cleanSettings, DEFAULT_SETTINGS } from '../src/main/settings/defaults'

const widest = (pts: Float32Array, below: number): number => {
  let w = 0
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] < below) w = Math.max(w, Math.abs(pts[i]))
  return w
}

describe('avatars', () => {
  it('builds the requested number of finite points that fit in view', () => {
    for (const a of AVATARS) {
      const pts = avatarPoints(a.id, 2600)
      expect(pts).toHaveLength(2600 * 3)
      for (const v of pts) {
        expect(Number.isFinite(v)).toBe(true)
        expect(Math.abs(v)).toBeLessThan(1.4)
      }
    }
  })

  it('builds the same figure every time', () => {
    expect(Array.from(avatarPoints('female', 500))).toEqual(Array.from(avatarPoints('female', 500)))
  })

  it('gives the male figure broader shoulders than the female one', () => {
    const male = widest(avatarPoints('male', 2600), -0.05)
    const female = widest(avatarPoints('female', 2600), -0.05)
    expect(male).toBeGreaterThan(female + 0.1)
  })

  it('keeps the core a sphere and the figures taller than wide at the head', () => {
    const core = avatarPoints('core', 1000)
    for (let i = 0; i < core.length; i += 3)
      expect(Math.hypot(core[i], core[i + 1], core[i + 2])).toBeCloseTo(1, 4)
    const maleY = avatarPoints('male', 2600)
    let top = -9
    for (let i = 1; i < maleY.length; i += 3) top = Math.max(top, maleY[i])
    expect(top).toBeGreaterThan(0.9)
  })

  it('gives each avatar its own natural voice', () => {
    const voices = AVATARS.map((a) => a.kokoro)
    expect(new Set(voices).size).toBe(3)
    expect(AVATARS.find((a) => a.id === 'female')!.kokoro).toMatch(/^[ab]f_/)
    expect(AVATARS.find((a) => a.id === 'male')!.kokoro).toMatch(/^[ab]m_/)
  })

  it('picks a matching Windows voice by name, or none', () => {
    const names = ['Microsoft David Desktop', 'Microsoft Zira Desktop', 'Microsoft Hazel Desktop']
    expect(pickSystemVoice('female', names)).toBe('Microsoft Zira Desktop')
    expect(pickSystemVoice('male', names)).toBe('Microsoft David Desktop')
    expect(pickSystemVoice('female', ['Some Other Voice'])).toBe('')
  })

  it('saves the avatar setting and ignores bad values', () => {
    expect(DEFAULT_SETTINGS.avatar).toBe('core')
    expect(cleanSettings({ avatar: 'female' }).avatar).toBe('female')
    expect(cleanSettings({ avatar: 'robot' }).avatar).toBe('core')
    expect(cleanSettings({}).avatar).toBe('core')
  })
})

describe('world clocks', () => {
  const at = new Date('2026-11-13T14:05:09Z')
  it('shows the time in each zone', () => {
    expect(clockTime(at, 'UTC')).toBe('14:05:09')
    expect(clockTime(at, 'Asia/Karachi')).toBe('19:05:09')
    expect(clockTime(at, 'Asia/Tokyo')).toBe('23:05:09')
    expect(clockTime(at, 'America/New_York')).toBe('09:05:09')
  })
  it('falls back to UTC for an unknown zone and formats the UTC date', () => {
    expect(clockTime(at, 'Not/AZone')).toBe('14:05:09')
    expect(utcDate(at)).toBe('Fri 13 Nov')
  })
})
