import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../src/main/agent/prompt'
import { MemoryStore } from '../src/main/memory/store'
import { cleanSettings, DEFAULT_SETTINGS } from '../src/main/settings/defaults'

describe('memory store', () => {
  it('saves facts to disk and loads them again', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'nova-db-')), 'm.sqlite')
    const a = await MemoryStore.open(file)
    a.add('Works on a Next.js dashboard')
    a.add('Likes lofi music')
    const b = await MemoryStore.open(file)
    expect(b.list().map((f) => f.text)).toEqual([
      'Works on a Next.js dashboard',
      'Likes lofi music'
    ])
    expect(b.remove(b.list()[0].id)).toBe(true)
    expect((await MemoryStore.open(file)).list()).toHaveLength(1)
  })
})

describe('settings', () => {
  it('fills defaults and ignores bad values', () => {
    expect(
      cleanSettings({
        model: 'gpt-5',
        character: 'evil',
        speakReplies: 'yes',
        customApps: [{ name: 'x' }, { name: ' Figma ', path: 'C:\\f.exe' }]
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      customApps: [{ name: 'Figma', path: 'C:\\f.exe' }]
    })
  })
})

describe('system prompt', () => {
  it('includes the character, voice rules, apps and memory', () => {
    const p = buildSystemPrompt(
      { ...DEFAULT_SETTINGS, userName: 'Osama' },
      [{ id: 1, text: 'Likes tea', createdAt: '' }],
      new Date('2026-11-08T10:00:00Z'),
      'win32'
    )
    expect(p).toMatch(/You are Nova/)
    expect(p).toMatch(/No markdown/)
    expect(p).toMatch(/spotify/)
    expect(p).toMatch(/- Likes tea/)
    expect(p).toMatch(/name is Osama/)
  })
})
