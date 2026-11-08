import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { claudeProvider } from '../src/main/agent/providers/claude'
import {
  cleanOllamaUrl,
  listOllamaModels,
  ollamaProvider,
  stripThinking,
  type FetchLike
} from '../src/main/agent/providers/ollama'
import type { Msg } from '../src/main/agent/types'
import { fakeClient } from './helpers'

const thinking = { type: 'thinking', thinking: '', signature: 'sig' } as Anthropic.ThinkingBlock
const tools = [
  {
    name: 'open_app',
    description: 'Open an app on the PC',
    schema: { type: 'object', properties: { app: { type: 'string' } } }
  }
]

describe('Claude provider', () => {
  it('sends web search, effort low, no temperature, and tool results in Claude format', async () => {
    const { client, sent } = fakeClient([
      { content: [{ type: 'text', text: 'Done.', citations: null }] as Anthropic.ContentBlock[] }
    ])
    const p = claudeProvider(client, 'claude-sonnet-5-5')
    const messages: Msg[] = [
      { role: 'user', parts: [{ type: 'text', text: 'open spotify' }] },
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'tu1', name: 'open_app', input: { app: 'spotify' } }]
      },
      {
        role: 'user',
        parts: [{ type: 'tool_result', id: 'tu1', name: 'open_app', content: 'Opened Spotify.' }]
      }
    ]
    const reply = await p.chat({ system: 's', messages, tools, webSearch: true })
    const req = sent[0] as unknown as Record<string, unknown>
    expect((req.tools as { name: string }[]).map((t) => t.name)).toEqual(['open_app', 'web_search'])
    expect(req).not.toHaveProperty('temperature')
    expect(req.output_config).toEqual({ effort: 'low' })
    expect((req.messages as Anthropic.MessageParam[])[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu1', content: 'Opened Spotify.' }
    ])
    expect(reply).toMatchObject({ stop: 'end', parts: [{ type: 'text', text: 'Done.' }] })
  })

  it('resends raw content (with thinking) mid-turn and drops thinking when the turn ends', async () => {
    const { client, sent } = fakeClient([
      {
        content: [
          thinking,
          { type: 'tool_use', id: 'tu1', name: 'open_app', input: { app: 'x' } }
        ] as unknown as Anthropic.ContentBlock[],
        stop_reason: 'tool_use'
      },
      { content: [{ type: 'text', text: 'ok', citations: null }] as Anthropic.ContentBlock[] }
    ])
    const p = claudeProvider(client, 'claude-sonnet-5-5')
    const first = await p.chat({
      system: 's',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      tools,
      webSearch: false
    })
    expect(first.stop).toBe('tool_use')
    const turn: Msg[] = [
      { role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', parts: first.parts, raw: first.raw },
      { role: 'user', parts: [{ type: 'tool_result', id: 'tu1', name: 'open_app', content: 'ok' }] }
    ]
    await p.chat({ system: 's', messages: turn, tools, webSearch: false })
    expect(((sent[1].messages[1].content as { type: string }[]) ?? []).map((b) => b.type)).toEqual([
      'thinking',
      'tool_use'
    ])
    expect(JSON.stringify(p.finishTurn(turn))).not.toContain('"thinking"')
  })

  it('reports a paused turn', async () => {
    const { client } = fakeClient([
      {
        content: [{ type: 'text', text: 'x', citations: null }] as Anthropic.ContentBlock[],
        stop_reason: 'pause_turn'
      }
    ])
    expect(
      (
        await claudeProvider(client, 'claude-haiku-5-5').chat({
          system: 's',
          messages: [],
          tools,
          webSearch: true
        })
      ).stop
    ).toBe('pause')
  })
})

/** A fake Ollama server that streams the given lines (newline-delimited JSON). */
function fakeOllama(lines: unknown[], status = 200) {
  const requests: { url: string; body: Record<string, unknown> }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, body: init?.body ? JSON.parse(init.body) : {} })
    const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
    // Split mid-line to prove the stream reader joins chunks correctly.
    const bytes = new TextEncoder().encode(text)
    const cut = Math.floor(bytes.length / 2)
    return {
      ok: status < 400,
      status,
      text: async () => (status < 400 ? text : 'model "x" not found'),
      json: async () => JSON.parse(text.split('\n')[0]),
      body: new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, cut))
          c.enqueue(bytes.slice(cut))
          c.close()
        }
      })
    }
  }
  return { fetchImpl, requests }
}

describe('Ollama provider (free, local)', () => {
  it('streams text and turns tool calls into Nova format', async () => {
    const { fetchImpl, requests } = fakeOllama([
      { message: { role: 'assistant', content: 'Opening ' } },
      { message: { role: 'assistant', content: 'it.' } },
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'open_app', arguments: { app: 'spotify' } } }]
        }
      },
      { done: true }
    ])
    const deltas: string[] = []
    const p = ollamaProvider('http://127.0.0.1:11434', 'qwen3:8b', fetchImpl)
    const messages: Msg[] = [
      { role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'a', name: 'open_app', input: { app: 'x' } }]
      },
      {
        role: 'user',
        parts: [{ type: 'tool_result', id: 'a', name: 'open_app', content: 'Opened X.' }]
      }
    ]
    const r = await p.chat({
      system: 'sys',
      messages,
      tools,
      webSearch: true,
      onText: (d) => deltas.push(d)
    })
    expect(deltas.join('')).toBe('Opening it.')
    expect(r.stop).toBe('tool_use')
    expect(r.parts[1]).toMatchObject({
      type: 'tool_call',
      name: 'open_app',
      input: { app: 'spotify' }
    })
    const body = requests[0].body as {
      model: string
      stream: boolean
      messages: { role: string }[]
      tools: { type: string }[]
    }
    expect(requests[0].url).toBe('http://127.0.0.1:11434/api/chat')
    expect(body.model).toBe('qwen3:8b')
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool'])
    expect(body.tools[0].type).toBe('function')
    expect(p.canSearchWeb).toBe(false)
  })

  it('hides <think> reasoning from the screen and the answer', async () => {
    const { fetchImpl } = fakeOllama([
      { message: { content: '<think>let me see' } },
      { message: { content: '</think>Sure.' } },
      { done: true }
    ])
    const deltas: string[] = []
    const r = await ollamaProvider('http://localhost:11434', 'qwen3:8b', fetchImpl).chat({
      system: '',
      messages: [],
      tools: [],
      webSearch: false,
      onText: (d) => deltas.push(d)
    })
    expect(deltas.join('')).toBe('Sure.')
    expect(r.parts).toEqual([{ type: 'text', text: 'Sure.' }])
    expect(stripThinking('a<think>b</think>c')).toBe('ac')
  })

  it('explains a missing model with the command to install it', async () => {
    const { fetchImpl } = fakeOllama([], 404)
    await expect(
      ollamaProvider('http://localhost:11434', 'qwen3:8b', fetchImpl).chat({
        system: '',
        messages: [],
        tools: [],
        webSearch: false
      })
    ).rejects.toThrow(/ollama pull qwen3:8b/)
  })

  it('explains when Ollama is not running', async () => {
    const down: FetchLike = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(
      ollamaProvider('http://localhost:11434', 'qwen3:8b', down).chat({
        system: '',
        messages: [],
        tools: [],
        webSearch: false
      })
    ).rejects.toThrow(/ollama.com/)
  })

  it('lists installed models and only accepts http(s) addresses', async () => {
    const { fetchImpl } = fakeOllama([{ models: [{ name: 'qwen3:8b' }, { name: 'llama3.1:8b' }] }])
    expect(await listOllamaModels('http://127.0.0.1:11434/', fetchImpl)).toEqual([
      'qwen3:8b',
      'llama3.1:8b'
    ])
    expect(cleanOllamaUrl('http://127.0.0.1:11434/api')).toBe('http://127.0.0.1:11434')
    expect(() => cleanOllamaUrl('file:///etc')).toThrow()
  })
})
