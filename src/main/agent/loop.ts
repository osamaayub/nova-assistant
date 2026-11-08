import type Anthropic from '@anthropic-ai/sdk'
import type { AgentEvent, ModelId } from '../../shared/types'
import { toApiTools } from './tools'
import type { NovaTool, ToolContext } from './tools/types'

type MessageParam = Anthropic.MessageParam
type ContentBlock = Anthropic.ContentBlock

/** The small part of the Anthropic client the loop uses, so tests can pass a fake. */
export interface StreamingClient {
  messages: {
    stream(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal }
    ): {
      on(event: 'text', listener: (delta: string) => void): unknown
      finalMessage(): Promise<Anthropic.Message>
    }
  }
}

export interface RunOptions {
  client: StreamingClient
  model: ModelId
  system: string
  history: MessageParam[]
  userText: string
  tools: NovaTool[]
  webSearch: boolean
  ctx: Omit<ToolContext, 'confirm'>
  turnId: string
  emit(event: AgentEvent): void
  confirm(id: string, title: string, detail: string): Promise<boolean>
  signal?: AbortSignal
  maxSteps?: number
}

export const MAX_STEPS = 8
const KEEP_TURNS = 12

/**
 * One user turn: call Claude, run any tools it asks for, feed the results back, repeat until it answers.
 * Returns the new history. Thinking blocks are kept while tools run (the API needs them) and dropped
 * once the turn is finished, so older turns never carry thinking blocks into later requests.
 */
export async function runTurn(o: RunOptions): Promise<MessageParam[]> {
  const turn: MessageParam[] = [{ role: 'user', content: o.userText }]
  const tools = [
    ...toApiTools(o.tools),
    ...(o.webSearch
      ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 3 }]
      : [])
  ]
  o.emit({ type: 'start', turnId: o.turnId })
  const limit = o.maxSteps ?? MAX_STEPS

  for (let step = 0; step < limit; step++) {
    const stream = o.client.messages.stream(
      {
        model: o.model,
        max_tokens: 2048,
        system: o.system,
        tools: tools as Anthropic.ToolUnion[],
        output_config: { effort: 'low' },
        messages: [...o.history, ...turn]
      } as Anthropic.MessageCreateParamsNonStreaming,
      { signal: o.signal }
    )
    stream.on('text', (delta) => o.emit({ type: 'text', turnId: o.turnId, delta }))
    const msg = await stream.finalMessage()
    turn.push({ role: 'assistant', content: msg.content as ContentBlock[] })
    emitSources(msg.content, o)

    if (msg.stop_reason === 'pause_turn') {
      // A long web search paused; ask Claude to carry on (the API does not accept a final assistant turn).
      turn.push({ role: 'user', content: 'Continue.' })
      continue
    }
    const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (msg.stop_reason !== 'tool_use' || !calls.length) {
      o.emit({ type: 'done', turnId: o.turnId })
      return trim([...o.history, ...withoutThinking(turn)])
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) results.push(await runTool(call, o))
    turn.push({ role: 'user', content: results })
  }

  // Too many steps: stop cleanly with a short spoken note.
  const note = "I've stopped there because that took too many steps. Try asking in a simpler way."
  o.emit({ type: 'text', turnId: o.turnId, delta: note })
  o.emit({ type: 'done', turnId: o.turnId })
  const last = turn.at(-1)
  if (last?.role === 'user') turn.push({ role: 'assistant', content: note })
  return trim([...o.history, ...withoutThinking(turn)])
}

async function runTool(
  call: Anthropic.ToolUseBlock,
  o: RunOptions
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = o.tools.find((t) => t.name === call.name)
  const base = { type: 'tool_result' as const, tool_use_id: call.id }
  if (!tool) return { ...base, content: `Unknown tool: ${call.name}`, is_error: true }
  o.emit({
    type: 'tool',
    turnId: o.turnId,
    id: call.id,
    name: tool.name,
    label: tool.label,
    status: 'running'
  })
  const parsed = tool.schema.safeParse(call.input)
  if (!parsed.success) {
    o.emit({
      type: 'tool',
      turnId: o.turnId,
      id: call.id,
      name: tool.name,
      label: tool.label,
      status: 'error',
      summary: 'Bad input'
    })
    return {
      ...base,
      content: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      is_error: true
    }
  }
  let declined = false
  try {
    const res = await tool.run(parsed.data, {
      ...o.ctx,
      confirm: async (title, detail) => {
        const ok = await o.confirm(call.id, title, detail)
        declined = !ok
        return ok
      }
    })
    const status = declined ? 'declined' : res.isError ? 'error' : 'done'
    o.emit({
      type: 'tool',
      turnId: o.turnId,
      id: call.id,
      name: tool.name,
      label: tool.label,
      status,
      summary: res.summary
    })
    return { ...base, content: res.content, is_error: res.isError || undefined }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    o.emit({
      type: 'tool',
      turnId: o.turnId,
      id: call.id,
      name: tool.name,
      label: tool.label,
      status: 'error',
      summary: 'Failed'
    })
    return { ...base, content: `The tool failed: ${message}`, is_error: true }
  }
}

function emitSources(content: ContentBlock[], o: RunOptions): void {
  for (const b of content) {
    if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue
    for (const r of b.content.slice(0, 3))
      if (r.type === 'web_search_result')
        o.emit({ type: 'source', turnId: o.turnId, url: r.url, title: r.title })
  }
}

/** Drops thinking blocks from a finished turn. Everything else (including web search results) stays unchanged. */
export function withoutThinking(turn: MessageParam[]): MessageParam[] {
  return turn
    .map((m) =>
      m.role === 'assistant' && Array.isArray(m.content)
        ? {
            ...m,
            content: (m.content as ContentBlock[]).filter(
              (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking'
            ) as Anthropic.ContentBlockParam[]
          }
        : m
    )
    .map((m) =>
      m.role === 'assistant' && Array.isArray(m.content) && m.content.length === 0
        ? { ...m, content: '(no reply)' }
        : m
    )
}

/** Keeps the last KEEP_TURNS user turns. Always cuts before a user's typed message, never between a tool call and its result. */
export function trim(history: MessageParam[], keep = KEEP_TURNS): MessageParam[] {
  const starts = history
    .map((m, i) => (m.role === 'user' && typeof m.content === 'string' ? i : -1))
    .filter((i) => i >= 0)
  if (starts.length <= keep) return history
  return history.slice(starts[starts.length - keep])
}
