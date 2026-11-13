import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runTurn, toolSpecs, trim } from '../src/main/agent/loop'
import { serialize } from '../src/main/agent/serialize'
import { TOOLS } from '../src/main/agent/tools'
import { defineTool } from '../src/main/agent/tools/types'
import type { Msg, Part } from '../src/main/agent/types'
import type { AgentEvent } from '../src/shared/types'
import { fakePlatform, fakeProvider, memory } from './helpers'

const text = (t: string): Part => ({ type: 'text', text: t })
const call = (id: string, name: string, input: unknown): Part => ({
  type: 'tool_call',
  id,
  name,
  input
})

async function run(
  replies: Parameters<typeof fakeProvider>[0],
  opts: { maxSteps?: number; agent?: string } = {}
) {
  const { provider, seen } = fakeProvider(replies)
  const { platform, calls } = fakePlatform()
  const events: AgentEvent[] = []
  const res = await runTurn({
    provider,
    system: 'sys',
    history: [],
    userText: 'open spotify',
    tools: TOOLS,
    webSearch: true,
    ctx: {
      platform,
      memory: await memory(),
      customApps: [],
      now: () => new Date('2026-11-08T10:00:00Z')
    },
    turnId: 't1',
    emit: (e) => events.push(e),
    confirm: async () => true,
    ...opts
  })
  return { ...res, seen, events, calls }
}

describe('agent loop (any brain)', () => {
  it('answers without tools in one call', async () => {
    const r = await run([{ parts: [text('Hello there.')], stop: 'end' }])
    expect(r.seen).toHaveLength(1)
    expect(
      r.events
        .filter((e) => e.type === 'text')
        .map((e) => (e as { delta: string }).delta)
        .join('')
    ).toBe('Hello there.')
    expect(r.events.at(-1)?.type).toBe('done')
    expect(r.history).toHaveLength(2)
  })

  it('runs a tool, sends the result back, then finishes', async () => {
    const r = await run([
      { parts: [call('c1', 'open_app', { app: 'Spotify' })], stop: 'tool_use' },
      { parts: [text('Spotify is open.')], stop: 'end' }
    ])
    expect(r.calls).toEqual(['url:spotify:'])
    expect(r.seen[1].messages[2].parts).toEqual([
      { type: 'tool_result', id: 'c1', name: 'open_app', content: 'Opened Spotify.' }
    ])
    expect(
      r.events.filter((e) => e.type === 'tool').map((e) => (e as { status: string }).status)
    ).toEqual(['running', 'done'])
  })

  it('does not offer web search to a brain that cannot search', async () => {
    const r = await run([{ parts: [text('ok')], stop: 'end' }])
    expect(r.seen[0].webSearch).toBe(false)
  })

  it('reports bad tool input to the model instead of crashing', async () => {
    const r = await run([
      { parts: [call('c1', 'set_timer', { minutes: 'soon' })], stop: 'tool_use' },
      { parts: [text('How many minutes?')], stop: 'end' }
    ])
    const res = r.seen[1].messages[2].parts[0] as Extract<Part, { type: 'tool_result' }>
    expect(res.isError).toBe(true)
    expect(res.content).toMatch(/Invalid input/)
  })

  it('stops after the step limit with a spoken note', async () => {
    const r = await run(() => ({ parts: [call('x', 'get_datetime', {})], stop: 'tool_use' }), {
      maxSteps: 3
    })
    expect(r.seen).toHaveLength(3)
    expect(r.text).toMatch(/too many steps/)
    expect(r.history.at(-1)?.role).toBe('assistant')
  })

  it('continues a paused turn with a user message', async () => {
    const r = await run([
      { parts: [text('Searching')], stop: 'pause' },
      { parts: [text('Found it.')], stop: 'end' }
    ])
    expect(r.seen[1].messages.at(-1)).toEqual({
      role: 'user',
      parts: [{ type: 'text', text: 'Continue.' }]
    })
  })

  it('keeps a specialist quiet: no text, start or done events, but returns its report', async () => {
    const r = await run([{ parts: [text('Opened it.')], stop: 'end' }], { agent: 'PC agent' })
    expect(r.events.filter((e) => ['text', 'start', 'done'].includes(e.type))).toEqual([])
    expect(r.text).toBe('Opened it.')
  })
})

describe('agents working side by side', () => {
  it('runs the tools of one reply at the same time and keeps the result order', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const started: string[] = []
    const tool = (name: string, waitFor?: Promise<void>, then?: () => void) =>
      defineTool({
        name,
        label: name,
        description: name,
        schema: z.object({}),
        run: async () => {
          started.push(name)
          then?.()
          if (waitFor) await waitFor
          return { content: `${name} done` }
        }
      })
    // "slow" can only finish after "fast" has started. If tools ran one by one this would hang.
    const tools = [tool('slow', gate), tool('fast', undefined, () => release())]
    const { provider } = fakeProvider([
      { parts: [call('a', 'slow', {}), call('b', 'fast', {})], stop: 'tool_use' },
      { parts: [text('Both done.')], stop: 'end' }
    ])
    const { platform } = fakePlatform()
    const res = await runTurn({
      provider,
      system: 's',
      history: [],
      userText: 'go',
      tools,
      webSearch: false,
      ctx: { platform, memory: await memory(), customApps: [], now: () => new Date() },
      turnId: 't',
      emit: () => {},
      confirm: async () => true
    })
    expect(started).toEqual(['slow', 'fast'])
    expect(res.text).toBe('Both done.')
    const results = res.history[2].parts.map((p) => (p.type === 'tool_result' ? p.content : ''))
    expect(results).toEqual(['slow done', 'fast done'])
  })

  it('asks "Allow?" questions one at a time, in order', async () => {
    const log: string[] = []
    const answers: (() => void)[] = []
    const ask = serialize(async (id: string) => {
      log.push(`ask ${id}`)
      await new Promise<void>((r) => answers.push(r))
      log.push(`answered ${id}`)
      return true
    })
    const a = ask('one')
    const b = ask('two')
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 5))
    expect(log).toEqual(['ask one'])
    answers[0]()
    await a
    await new Promise((r) => setTimeout(r, 5))
    expect(log).toEqual(['ask one', 'answered one', 'ask two'])
    answers[1]()
    await b
    expect(log.at(-1)).toBe('answered two')
  })

  it('keeps going after a question fails', async () => {
    let n = 0
    const ask = serialize(async () => {
      if (n++ === 0) throw new Error('boom')
      return 'ok'
    })
    await expect(ask()).rejects.toThrow('boom')
    await expect(ask()).resolves.toBe('ok')
  })
})

describe('history', () => {
  it('trims to whole turns and never splits a tool call from its result', () => {
    const h: Msg[] = []
    for (let i = 0; i < 15; i++) {
      h.push({ role: 'user', parts: [text(`q${i}`)] })
      h.push({ role: 'assistant', parts: [call(`t${i}`, 'get_datetime', {})] })
      h.push({
        role: 'user',
        parts: [{ type: 'tool_result', id: `t${i}`, name: 'get_datetime', content: 'x' }]
      })
      h.push({ role: 'assistant', parts: [text('a')] })
    }
    const t = trim(h, 12)
    expect(t[0]).toEqual({ role: 'user', parts: [text('q3')] })
    expect(t).toHaveLength(48)
  })
})

describe('tool definitions', () => {
  it('converts every tool to an object schema', () => {
    for (const t of toolSpecs(TOOLS)) {
      expect(t.schema.type).toBe('object')
      expect(t.schema).not.toHaveProperty('$schema')
      expect(t.description.length).toBeGreaterThan(20)
    }
  })
})
