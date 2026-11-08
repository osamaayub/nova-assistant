import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { runTurn, trim, withoutThinking } from '../src/main/agent/loop'
import { TOOLS, toApiTools } from '../src/main/agent/tools'
import type { AgentEvent } from '../src/shared/types'
import { fakeClient, fakePlatform, memory } from './helpers'

const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Anthropic.TextBlock
const toolUse = (id: string, name: string, input: unknown) =>
  ({
    type: 'tool_use',
    id,
    name,
    input,
    caller: { type: 'direct' }
  }) as unknown as Anthropic.ToolUseBlock
const thinking = { type: 'thinking', thinking: '', signature: 'sig' } as Anthropic.ThinkingBlock

async function run(
  script: Partial<Anthropic.Message>[],
  opts: { confirm?: boolean; userText?: string; maxSteps?: number } = {}
) {
  const { client, sent } = fakeClient(script)
  const { platform, calls } = fakePlatform()
  const events: AgentEvent[] = []
  const history = await runTurn({
    client,
    model: 'claude-sonnet-5-5',
    system: 'sys',
    history: [],
    userText: opts.userText ?? 'open spotify',
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
    confirm: async () => opts.confirm ?? true,
    maxSteps: opts.maxSteps
  })
  return { history, sent, events, calls }
}

describe('agent loop', () => {
  it('answers without tools in one call', async () => {
    const r = await run([{ content: [text('Hello there.')], stop_reason: 'end_turn' }])
    expect(r.sent).toHaveLength(1)
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
      {
        content: [thinking, toolUse('tu1', 'open_app', { app: 'Spotify' })],
        stop_reason: 'tool_use'
      },
      { content: [text('Spotify is open.')], stop_reason: 'end_turn' }
    ])
    expect(r.calls).toEqual(['url:spotify:'])
    const second = r.sent[1].messages
    // The second request carries the thinking block (needed mid-turn) and the tool result.
    expect((second[1].content as { type: string }[]).map((b) => b.type)).toEqual([
      'thinking',
      'tool_use'
    ])
    expect(second[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu1', content: 'Opened Spotify.' }
    ])
    // The saved history no longer has thinking blocks.
    expect(JSON.stringify(r.history)).not.toContain('"thinking"')
    expect(
      r.events.filter((e) => e.type === 'tool').map((e) => (e as { status: string }).status)
    ).toEqual(['running', 'done'])
  })

  it('sends the web search tool and no sampling parameters', async () => {
    const r = await run([{ content: [text('ok')] }])
    const req = r.sent[0] as unknown as Record<string, unknown>
    expect((req.tools as { name: string }[]).map((t) => t.name)).toContain('web_search')
    expect(req).not.toHaveProperty('temperature')
    expect(req.output_config).toEqual({ effort: 'low' })
    expect((req.messages as unknown[]).at(-1)).toEqual({ role: 'user', content: 'open spotify' })
  })

  it('reports bad tool input to Claude instead of crashing', async () => {
    const r = await run([
      { content: [toolUse('tu1', 'set_timer', { minutes: 'soon' })], stop_reason: 'tool_use' },
      { content: [text('How many minutes?')] }
    ])
    const result = (r.sent[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0]
    expect(result.is_error).toBe(true)
    expect(String(result.content)).toMatch(/Invalid input/)
  })

  it('stops after the step limit with a spoken note', async () => {
    const loop = Array.from({ length: 5 }, (_, i) => ({
      content: [toolUse(`t${i}`, 'get_datetime', {})],
      stop_reason: 'tool_use' as const
    }))
    const r = await run(loop, { maxSteps: 3 })
    expect(r.sent).toHaveLength(3)
    expect(r.events.some((e) => e.type === 'text' && /too many steps/.test(e.delta))).toBe(true)
    expect(r.history.at(-1)?.role).toBe('assistant')
  })

  it('continues after a paused web search with a user turn, never a trailing assistant turn', async () => {
    const r = await run([
      { content: [text('Searching')], stop_reason: 'pause_turn' },
      { content: [text('Found it.')] }
    ])
    expect(r.sent[1].messages.at(-1)).toEqual({ role: 'user', content: 'Continue.' })
  })
})

describe('history', () => {
  it('drops thinking blocks but keeps other content', () => {
    const out = withoutThinking([
      { role: 'assistant', content: [thinking, text('hi')] as Anthropic.ContentBlockParam[] }
    ])
    expect(out[0].content).toEqual([text('hi')])
  })

  it('trims to whole turns and never splits a tool call from its result', () => {
    const h: Anthropic.MessageParam[] = []
    for (let i = 0; i < 15; i++) {
      h.push({ role: 'user', content: `q${i}` })
      h.push({
        role: 'assistant',
        content: [toolUse(`t${i}`, 'get_datetime', {})] as Anthropic.ContentBlockParam[]
      })
      h.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'x' }]
      })
      h.push({ role: 'assistant', content: 'a' })
    }
    const t = trim(h, 12)
    expect(t[0]).toEqual({ role: 'user', content: 'q3' })
    expect(t).toHaveLength(48)
  })
})

describe('tool definitions', () => {
  it('converts every tool to a valid API schema', () => {
    for (const t of toApiTools(TOOLS)) {
      expect(t.input_schema.type).toBe('object')
      expect(t.input_schema).not.toHaveProperty('$schema')
      expect(t.description.length).toBeGreaterThan(20)
    }
  })
})
