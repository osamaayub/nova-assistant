import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closeApp, processFor } from '../src/main/agent/tools/apps'
import {
  createFolder,
  findFile,
  folderNameProblem,
  searchNames
} from '../src/main/agent/tools/files'
import type { ToolContext } from '../src/main/agent/tools/types'
import {
  cleanPhone,
  findYouTubeVideo,
  playMusic,
  whatsappMessage
} from '../src/main/agent/tools/web'
import { WHATSAPP_ENTER_SCRIPT } from '../src/main/whatsappKey'
import { fakePlatform, memory } from './helpers'

async function setup(confirm = true, os: NodeJS.Platform = 'win32') {
  const p = fakePlatform(os)
  for (const dir of Object.values(p.platform.folders)) mkdirSync(dir, { recursive: true })
  const asked: string[] = []
  const ctx: ToolContext = {
    platform: p.platform,
    memory: await memory(),
    customApps: [{ name: 'Figma', path: 'C:\\Apps\\Figma.exe' }],
    confirm: async (title) => {
      asked.push(title)
      return confirm
    },
    now: () => new Date()
  }
  return { ...p, ctx, asked }
}

describe('close_app', () => {
  it('asks first, then closes the program from the fixed table', async () => {
    const { ctx, calls, asked } = await setup()
    const r = await closeApp.run({ app: 'Chrome' }, ctx)
    expect(asked).toEqual(['Close Google Chrome?'])
    expect(calls).toEqual(['close:chrome.exe'])
    expect(r.summary).toBe('Closed Google Chrome')
  })

  it('closes nothing when the user says no', async () => {
    const { ctx, calls } = await setup(false)
    const r = await closeApp.run({ app: 'spotify' }, ctx)
    expect(calls).toEqual([])
    expect(r.summary).toBe('Cancelled')
  })

  it('never closes File Explorer, Windows itself, Nova, or an app it does not know', async () => {
    const { ctx, calls, asked } = await setup()
    for (const app of ['file explorer', 'explorer', 'svchost', 'nova', 'mystery app']) {
      const r = await closeApp.run({ app }, ctx)
      expect(r.isError, app).toBe(true)
    }
    expect(calls).toEqual([])
    expect(asked).toEqual([])
    expect(processFor('x', [{ name: 'X', path: 'C:\\Windows\\explorer.exe' }])).toBeNull()
    expect(processFor('x', [{ name: 'X', path: 'C:\\Windows\\System32\\svchost.exe' }])).toBeNull()
  })

  it('can close an app the user added, by the program name in its path', async () => {
    const { ctx, calls } = await setup()
    await closeApp.run({ app: 'figma' }, ctx)
    expect(calls).toEqual(['close:Figma.exe'])
    expect(processFor('doc', [{ name: 'Doc', path: 'C:\\Docs\\readme.txt' }])).toBeNull()
  })

  it('reports an app that is not running, and works only on Windows', async () => {
    const win = await setup()
    win.ctx.platform.closeProcess = async () => 'not-running'
    expect((await closeApp.run({ app: 'notepad' }, win.ctx)).summary).toBe("Notepad isn't open")
    const mac = await setup(true, 'darwin')
    expect((await closeApp.run({ app: 'notepad' }, mac.ctx)).isError).toBe(true)
  })
})

describe('create_folder', () => {
  it('creates a new folder inside an allowed folder', async () => {
    const { ctx, platform } = await setup()
    const r = await createFolder.run(
      { folder: 'documents', name: 'Taxes 2026', subfolder: '' },
      ctx
    )
    expect(r.isError).toBeUndefined()
    expect(existsSync(join(platform.folders.documents, 'Taxes 2026'))).toBe(true)
  })

  it('never overwrites, and says so when the folder already exists', async () => {
    const { ctx, platform } = await setup()
    mkdirSync(join(platform.folders.documents, 'Taxes'))
    writeFileSync(join(platform.folders.documents, 'Taxes', 'keep.txt'), 'x')
    const r = await createFolder.run({ folder: 'documents', name: 'Taxes', subfolder: '' }, ctx)
    expect(r.summary).toBe('Already exists')
    expect(existsSync(join(platform.folders.documents, 'Taxes', 'keep.txt'))).toBe(true)
  })

  it('refuses bad names and paths that leave the allowed folders', async () => {
    const { ctx } = await setup()
    for (const name of [
      '..',
      'a/b',
      'a\\b',
      'con',
      'NUL.txt',
      'bad:name',
      'trailing.',
      ' ',
      'x'.repeat(81)
    ])
      expect(
        (await createFolder.run({ folder: 'documents', name, subfolder: '' }, ctx)).isError,
        name
      ).toBe(true)
    const out = await createFolder.run({ folder: 'documents', name: 'ok', subfolder: '../..' }, ctx)
    expect(out.isError).toBe(true)
    // A missing parent is an error, not a deep new tree.
    await expect(
      createFolder.run({ folder: 'documents', name: 'ok', subfolder: 'not/there' }, ctx)
    ).rejects.toThrow()
  })

  it('explains what is wrong with a name', () => {
    expect(folderNameProblem('Holiday photos')).toBe('')
    expect(folderNameProblem('a|b')).toMatch(/can not contain/)
    expect(folderNameProblem('end ')).toBe('')
    expect(folderNameProblem('   ')).toBe('Give the folder a short name.')
    expect(folderNameProblem('end.')).toMatch(/end with a dot/)
    expect(folderNameProblem('COM1')).toMatch(/Windows keeps/)
  })
})

describe('find_file', () => {
  it('finds files by words in the name, in any allowed folder, a few levels deep', async () => {
    const { ctx, platform } = await setup()
    mkdirSync(join(platform.folders.documents, 'Work', 'Clients'), { recursive: true })
    writeFileSync(join(platform.folders.documents, 'Work', 'Clients', 'Invoice March.pdf'), 'x')
    writeFileSync(join(platform.folders.downloads, 'invoice-april.pdf'), 'x')
    writeFileSync(join(platform.folders.downloads, 'photo.png'), 'x')
    const all = await findFile.run({ query: 'invoice', folder: 'all' }, ctx)
    expect(all.summary).toBe('Found 2 matches')
    const one = await findFile.run({ query: 'invoice pdf', folder: 'downloads' }, ctx)
    expect(one.content).toContain('invoice-april.pdf')
    expect(one.content).not.toContain('Invoice March')
    expect((await findFile.run({ query: 'zebra' }, ctx)).summary).toBe('No match')
  })

  it('stops at its limits and skips hidden and node_modules folders', async () => {
    const { platform } = await setup()
    const dir = platform.folders.documents
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'node_modules', 'secret-file.txt'), 'x')
    mkdirSync(join(dir, '.hidden'))
    writeFileSync(join(dir, '.hidden', 'secret-file.txt'), 'x')
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `file-${i}.txt`), 'x')
    const r = await searchNames([dir], 'file')
    expect(r.found).toHaveLength(15)
    expect(r.truncated).toBe(true)
    expect(r.found.join('|')).not.toContain('secret')
    const none = await searchNames([dir], 'secret')
    expect(none.found).toEqual([])
  })
})

const RESULTS = (id: string) => `<html>..."videoRenderer":{"videoId":"${id}","thumbnail"...</html>`

describe('play_music', () => {
  it('finds the top YouTube video and opens it directly', async () => {
    const { ctx, calls } = await setup()
    let asked = ''
    ctx.fetch = (async (url: string) => {
      asked = String(url)
      return new Response(RESULTS('dQw4w9WgXcQ'), { status: 200 })
    }) as typeof fetch
    const r = await playMusic.run({ query: 'never gonna', service: 'youtube' }, ctx)
    expect(asked).toContain('search_query=never%20gonna')
    expect(calls).toEqual(['url:https://www.youtube.com/watch?v=dQw4w9WgXcQ'])
    expect(r.summary).toBe('Playing on YouTube: never gonna')
  })

  it('ignores a page without a video, and a video id that is not 11 safe characters', async () => {
    const page = (body: string) => (async () => new Response(body, { status: 200 })) as typeof fetch
    expect(await findYouTubeVideo('x', page('<html>consent</html>'))).toBeNull()
    expect(await findYouTubeVideo('x', page(RESULTS('short')))).toBeNull()
    expect(await findYouTubeVideo('x', page(RESULTS('abc"><script>')))).toBeNull()
    const down = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    expect(await findYouTubeVideo('x', down)).toBeNull()
  })
})

describe('whatsapp_message', () => {
  it('cleans phone numbers into international digits', () => {
    expect(cleanPhone('+92 300 1234567')).toBe('923001234567')
    expect(cleanPhone('0092-300-1234567')).toBe('923001234567')
    expect(cleanPhone('(1) 415 555 2671')).toBe('14155552671')
    for (const bad of ['', 'abc', '12345', '0300 1234567 99999999', '+0 123 4567890', '1; rm -rf'])
      expect(cleanPhone(bad), bad).toBeNull()
  })

  it('asks first, opens the chat with the text typed in, presses Send, and says it was sent', async () => {
    const { ctx, calls, asked } = await setup()
    const r = await whatsappMessage.run(
      { phone: '+92 300 1234567', message: 'Running late & sorry' },
      ctx
    )
    expect(asked).toEqual(['Send this WhatsApp message to +923001234567?'])
    expect(calls).toEqual([
      'url:whatsapp://send?phone=923001234567&text=Running%20late%20%26%20sorry',
      'enter:whatsapp'
    ])
    expect(r.summary).toBe('WhatsApp message sent')
  })

  it('does not claim it sent when WhatsApp was never in front', async () => {
    const { ctx } = await setup()
    ctx.platform.pressEnter = async () => false
    const r = await whatsappMessage.run({ phone: '+923001234567', message: 'hi' }, ctx)
    expect(r.summary).toBe('Chat ready, not sent')
    expect(r.content).toMatch(/did NOT press Send/)
  })

  it('falls back to the web link, still unsent, when WhatsApp Desktop is missing', async () => {
    const { ctx, calls } = await setup()
    ctx.platform.openUrl = async (u) => {
      calls.push(`url:${u}`)
      if (u.startsWith('whatsapp:')) throw new Error('no handler')
    }
    const r = await whatsappMessage.run({ phone: '+923001234567', message: 'hi' }, ctx)
    expect(calls).toEqual([
      'url:whatsapp://send?phone=923001234567&text=hi',
      'url:https://web.whatsapp.com/send?phone=923001234567&text=hi'
    ])
    expect(calls).not.toContain('enter:whatsapp')
    expect(r.summary).toBe('Chat ready, not sent')
  })

  it('opens nothing and presses nothing when declined or when the number is wrong', async () => {
    const no = await setup(false)
    expect(
      (await whatsappMessage.run({ phone: '+923001234567', message: 'hi' }, no.ctx)).summary
    ).toBe('Cancelled')
    expect(no.calls).toEqual([])
    const bad = await setup()
    expect((await whatsappMessage.run({ phone: 'call me', message: 'hi' }, bad.ctx)).isError).toBe(
      true
    )
    expect(bad.asked).toEqual([])
  })
})

describe('whatsapp send key', () => {
  it('is one fixed script that only presses Enter when WhatsApp is in front', () => {
    expect(WHATSAPP_ENTER_SCRIPT).toContain("-match '^WhatsApp'")
    expect(WHATSAPP_ENTER_SCRIPT).toContain("SendWait('{ENTER}')")
    expect(WHATSAPP_ENTER_SCRIPT).toContain('exit 2')
    // Nothing in it takes a number or a message, so none can be injected.
    expect(WHATSAPP_ENTER_SCRIPT).not.toMatch(/\$\{|%s|param\(/i)
  })
})
