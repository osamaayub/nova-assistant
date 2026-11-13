import { describe, expect, it } from 'vitest'
import { checkFields, PRESETS } from '../src/renderer/src/features/settings/connectors'

describe('connector presets', () => {
  it('pin an exact version so a new release never changes what runs', () => {
    for (const p of PRESETS) {
      const pkg = p.build({ folder: 'C:\\Docs' }).args.find((a) => /^@?[\w-]+\/?[\w-]*@\d/.test(a))
      expect(pkg, p.id).toMatch(/@\d+\.\d+\.\d+$/)
    }
  })

  it('are named by their id and never carry secrets', () => {
    for (const p of PRESETS) {
      const c = p.build({ folder: 'C:\\Docs' })
      expect(c.name).toBe(p.id)
      expect(c.env).toEqual({})
      expect(c.command).toBe('npx')
    }
  })

  it('passes the chosen folder as one argument, even with spaces or symbols', () => {
    const files = PRESETS.find((p) => p.id === 'files')!
    const folder = 'C:\\My Docs & more'
    expect(files.build({ folder: `  ${folder}  ` }).args.at(-1)).toBe(folder)
  })

  it('refuses an empty folder or one that looks like an option', () => {
    const files = PRESETS.find((p) => p.id === 'files')!
    expect(checkFields(files, { folder: '' })).toMatch(/folder/i)
    expect(checkFields(files, { folder: '--help' })).toMatch(/right/i)
    expect(checkFields(files, { folder: 'C:\\Docs' })).toBe('')
    expect(checkFields(PRESETS.find((p) => p.id === 'docs')!, {})).toBe('')
  })
})
