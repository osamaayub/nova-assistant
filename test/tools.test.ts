import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openApp, resolveApp } from '../src/main/agent/tools/apps'
import {
  categoryOf,
  insideAllowed,
  listFolder,
  organizeDownloads
} from '../src/main/agent/tools/files'
import { forgetFact, rememberFact } from '../src/main/agent/tools/memory'
import { openWebsite, playMusic, safeWebUrl } from '../src/main/agent/tools/web'
import type { ToolContext } from '../src/main/agent/tools/types'
import { fakePlatform, memory } from './helpers'

async function ctx(os: NodeJS.Platform = 'win32', confirm = true) {
  const p = fakePlatform(os)
  const c: ToolContext = {
    platform: p.platform,
    memory: await memory(),
    customApps: [{ name: 'Figma', path: 'C:\\Apps\\Figma.exe' }],
    confirm: async () => confirm,
    now: () => new Date()
  }
  return { ...p, ctx: c }
}

describe('apps', () => {
  it("finds built-in apps by name and alias, and the user's own apps first", () => {
    expect(resolveApp('Google Chrome', [])).toEqual({
      label: 'Google Chrome',
      kind: 'exe',
      target: 'chrome'
    })
    expect(resolveApp('vscode', [])?.target).toBe('vscode:')
    expect(resolveApp('figma', [{ name: 'Figma', path: 'C:\\f.exe' }])).toEqual({
      label: 'Figma',
      kind: 'path',
      target: 'C:\\f.exe'
    })
  })

  it('refuses anything not on the list, including command tricks', async () => {
    const { ctx: c, calls } = await ctx()
    for (const app of [
      'cmd /c del *',
      'powershell',
      'notepad & calc',
      '../../windows/system32/format'
    ]) {
      const r = await openApp.run({ app }, c)
      expect(r.isError).toBe(true)
    }
    expect(calls).toEqual([])
  })

  it('launches exe apps through the fixed command', async () => {
    const { ctx: c, calls } = await ctx()
    await openApp.run({ app: 'notepad' }, c)
    expect(calls).toEqual(['launch:notepad.exe'])
  })

  it('explains that app opening needs Windows', async () => {
    const { ctx: c } = await ctx('linux')
    expect((await openApp.run({ app: 'notepad' }, c)).isError).toBe(true)
  })
})

describe('web', () => {
  it('accepts web addresses only', () => {
    expect(safeWebUrl('youtube.com')?.href).toBe('https://youtube.com/')
    for (const bad of ['javascript:alert(1)', 'file:///C:/Windows', 'ms-settings:', 'not a url'])
      expect(safeWebUrl(bad)).toBeNull()
  })

  it('opens music searches with the query encoded', async () => {
    const { ctx: c, calls } = await ctx()
    await playMusic.run({ query: 'lofi & chill', service: 'youtube' }, c)
    await playMusic.run({ query: 'Coldplay', service: 'spotify' }, c)
    expect(calls).toEqual([
      'url:https://www.youtube.com/results?search_query=lofi%20%26%20chill',
      'url:spotify:search:Coldplay'
    ])
    expect((await openWebsite.run({ url: 'javascript:alert(1)' }, c)).isError).toBe(true)
  })
})

describe('files', () => {
  it("blocks paths outside the user's folders", async () => {
    const { platform } = fakePlatform()
    expect(insideAllowed(platform, 'documents', 'work')).toBe(
      join(platform.folders.documents, 'work')
    )
    expect(insideAllowed(platform, 'documents', '../../etc')).toBeNull()
    expect(insideAllowed(platform, 'documents', '/etc')).toBeNull()
    const { ctx: c } = await ctx()
    expect((await listFolder.run({ folder: 'documents', subfolder: '..' }, c)).isError).toBe(true)
  })

  it('sorts files by type', () => {
    expect(categoryOf('a.PDF')).toBe('Documents')
    expect(categoryOf('setup.exe')).toBe('Installers')
    expect(categoryOf('weird.xyz')).toBe('Other')
  })

  it('organizes Downloads only after approval, never overwriting', async () => {
    const { ctx: c, platform } = await ctx()
    const dl = platform.folders.downloads
    mkdirSync(join(dl, 'Images'), { recursive: true })
    for (const f of ['a.png', 'b.pdf', 'c.zip', 'big.crdownload']) writeFileSync(join(dl, f), 'x')
    writeFileSync(join(dl, 'Images', 'a.png'), 'existing')
    const r = await organizeDownloads.run({}, c)
    expect(r.content).toMatch(/Moved 3 files/)
    expect(readdirSync(join(dl, 'Images')).sort()).toEqual(['a (1).png', 'a.png'])
    expect(existsSync(join(dl, 'big.crdownload'))).toBe(true)
  })

  it('moves nothing when the user declines', async () => {
    const { ctx: c, platform } = await ctx('win32', false)
    writeFileSync(
      join(
        mkdirSync(platform.folders.downloads, { recursive: true }) ?? platform.folders.downloads,
        'a.png'
      ),
      'x'
    )
    const r = await organizeDownloads.run({}, c)
    expect(r.content).toMatch(/declined/)
    expect(existsSync(join(platform.folders.downloads, 'a.png'))).toBe(true)
  })
})

describe('memory tools', () => {
  it('remembers, refuses secrets and duplicates, and forgets', async () => {
    const { ctx: c } = await ctx()
    expect((await rememberFact.run({ fact: 'Prefers short answers' }, c)).content).toMatch(
      /Remembered/
    )
    expect((await rememberFact.run({ fact: 'prefers short answers' }, c)).summary).toMatch(
      /Already/
    )
    expect((await rememberFact.run({ fact: 'My password is hunter2' }, c)).isError).toBe(true)
    expect((await forgetFact.run({ about: 'short' }, c)).content).toMatch(/Forgot 1/)
    expect(c.memory.list()).toEqual([])
  })
})
