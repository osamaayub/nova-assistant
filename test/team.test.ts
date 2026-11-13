import { describe, expect, it } from 'vitest'
import { runTurn } from '../src/main/agent/loop'
import { mainAgentTools, SPECIALISTS, specialistPrompt } from '../src/main/agent/team'
import { htmlToText, isPublicHost, readWebPage } from '../src/main/agent/tools/web'
import type { AgentEvent } from '../src/shared/types'
import { fakePlatform, fakeProvider, memory } from './helpers'

describe('team of agents', () => {
  it('main agent hands a task to the PC agent, which uses its own tools and reports back', async () => {
    const { platform, calls } = fakePlatform()
    const events: AgentEvent[] = []
    // Call order: main asks PC agent -> PC agent opens Spotify -> PC agent reports -> main answers.
    const { provider, seen } = fakeProvider((req, i) => {
      if (i === 0)
        return {
          parts: [
            { type: 'tool_call', id: 'm1', name: 'ask_pc_agent', input: { task: 'Open Spotify' } }
          ],
          stop: 'tool_use'
        }
      if (i === 1)
        return {
          parts: [{ type: 'tool_call', id: 'p1', name: 'open_app', input: { app: 'spotify' } }],
          stop: 'tool_use'
        }
      if (i === 2) return { parts: [{ type: 'text', text: 'Opened Spotify.' }], stop: 'end' }
      return { parts: [{ type: 'text', text: 'Spotify is open.' }], stop: 'end' }
    })
    const ctx = { platform, memory: await memory(), customApps: [], now: () => new Date() }
    const base = {
      provider,
      ctx,
      turnId: 't',
      emit: (e: AgentEvent) => events.push(e),
      confirm: async () => true
    }
    const delegate = async (s: (typeof SPECIALISTS)[number], task: string) =>
      (
        await runTurn({
          ...base,
          system: specialistPrompt(s, false),
          history: [],
          userText: task,
          tools: s.tools,
          webSearch: false,
          agent: s.name
        })
      ).text
    const res = await runTurn({
      ...base,
      system: 'main',
      history: [],
      userText: 'play spotify',
      tools: mainAgentTools('team', delegate),
      webSearch: false
    })

    expect(calls).toEqual(['url:spotify:'])
    expect(res.text).toBe('Spotify is open.')
    // The PC agent only saw its own tools; the main agent only saw hand-over and memory tools.
    expect(seen[1].tools.map((t) => t.name)).toEqual([
      'open_app',
      'close_app',
      'open_website',
      'play_music',
      'whatsapp_message',
      'system_status',
      'set_timer',
      'get_datetime'
    ])
    expect(seen[0].tools.map((t) => t.name)).toEqual([
      'ask_pc_agent',
      'ask_files_agent',
      'ask_architect_agent',
      'ask_developer_agent',
      'ask_reviewer_agent',
      'ask_tester_agent',
      'ask_research_agent',
      'remember_fact',
      'forget_fact',
      'get_datetime'
    ])
    // The specialist's report reached the main agent as a tool result.
    expect(JSON.stringify(seen[3].messages)).toContain('Opened Spotify.')
    // The window shows the specialist's step under its name.
    expect(events.filter((e) => e.type === 'tool' && e.name === 'open_app').at(-1)).toMatchObject({
      agent: 'PC agent',
      status: 'done'
    })
    // Only the main agent's words are streamed to the screen.
    expect(
      events
        .filter((e) => e.type === 'text')
        .map((e) => (e as { delta: string }).delta)
        .join('')
    ).toBe('Spotify is open.')
  })

  it('single mode gives one agent every tool, each once', () => {
    const names = mainAgentTools('single', async () => '').map((t) => t.name)
    expect(names).toContain('open_app')
    expect(names).toContain('organize_downloads')
    expect(names).toContain('read_web_page')
    expect(new Set(names).size).toBe(names.length)
  })

  it('splits coding into architect, developer, reviewer and tester', () => {
    const ids = SPECIALISTS.map((s) => s.id)
    for (const id of ['architect', 'developer', 'reviewer', 'tester'] as const) expect(ids).toContain(id)
    const dev = SPECIALISTS.find((s) => s.id === 'developer')!
    const rev = SPECIALISTS.find((s) => s.id === 'reviewer')!
    const tester = SPECIALISTS.find((s) => s.id === 'tester')!
    expect(dev.tools.map((t) => t.name)).toContain('write_code_file')
    expect(rev.tools.map((t) => t.name)).not.toContain('write_code_file')
    expect(rev.tools.map((t) => t.name)).not.toContain('run_project_check')
    expect(tester.tools.map((t) => t.name)).toContain('run_project_check')
  })

  it('tells the research agent what it can and cannot do', () => {
    const r = SPECIALISTS.find((s) => s.id === 'research')!
    expect(specialistPrompt(r, true)).toMatch(/can search the web/)
    expect(specialistPrompt(r, false)).toMatch(/cannot search the web/)
  })

  it('requires specialists to report evidence and unresolved work', () => {
    const prompt = specialistPrompt(SPECIALISTS[0], false)
    expect(prompt).toMatch(/Stay within your role and use only your tools/)
    expect(prompt).toMatch(/evidence from your tools/)
    expect(prompt).toMatch(/failure, uncertainty, or remaining step/)
  })
})

describe('read_web_page', () => {
  it('refuses this computer and private networks', async () => {
    for (const h of [
      'localhost',
      '127.0.0.1',
      '192.168.1.1',
      '10.0.0.5',
      '172.20.1.1',
      '169.254.1.1',
      '::1',
      'router.local'
    ])
      expect(isPublicHost(h)).toBe(false)
    for (const h of ['example.com', '8.8.8.8', 'en.wikipedia.org'])
      expect(isPublicHost(h)).toBe(true)
    const { platform } = fakePlatform()
    const r = await readWebPage.run(
      { url: 'http://127.0.0.1:11434/api/tags' },
      {
        platform,
        memory: await memory(),
        customApps: [],
        confirm: async () => true,
        now: () => new Date()
      }
    )
    expect(r.isError).toBe(true)
  })

  it('turns HTML into readable text', () => {
    const { title, text } = htmlToText(
      '<html><head><title> Hi </title><style>x{}</style></head><body><nav>menu</nav><p>Hello &amp; welcome</p><script>bad()</script><p>Second</p></body></html>'
    )
    expect(title).toBe('Hi')
    expect(text).toBe('Hello & welcome\nSecond')
  })
})
