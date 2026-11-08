import { z } from 'zod'
import type { AgentEvent } from '../../shared/types'
import type { NovaTool, ToolContext } from './tools/types'
import type { Msg, Part, Provider, ToolSpec } from './types'

export const MAX_STEPS = 8
const KEEP_TURNS = 12

export interface RunOptions {
  provider: Provider
  system: string
  history: Msg[]
  userText: string
  tools: NovaTool[]
  webSearch: boolean
  ctx: Omit<ToolContext, 'confirm'>
  turnId: string
  emit(event: AgentEvent): void
  confirm(id: string, title: string, detail: string): Promise<boolean>
  signal?: AbortSignal
  maxSteps?: number
  /** Set for specialist agents: their words go back to the main agent, not to the screen. */
  agent?: string
}

export interface TurnResult {
  history: Msg[]
  /** Everything the agent said this turn (used as a specialist's report). */
  text: string
}

/** Converts Nova's tools to the neutral format. The Zod schema is the single source of truth. */
export function toolSpecs(tools: NovaTool[]): ToolSpec[] {
  return tools.map((t) => {
    const schema = { ...(z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>) }
    delete schema.$schema
    return { name: t.name, description: t.description, schema: { ...schema, type: 'object' } }
  })
}

/**
 * One turn of one agent: call the model, run the tools it asks for, feed the results back,
 * and repeat until it answers or hits the step limit. Works the same with any provider.
 */
export async function runTurn(o: RunOptions): Promise<TurnResult> {
  const turn: Msg[] = [{ role: 'user', parts: [{ type: 'text', text: o.userText }] }]
  const specs = toolSpecs(o.tools)
  const main = !o.agent
  if (main) o.emit({ type: 'start', turnId: o.turnId })
  let said = ''
  const limit = o.maxSteps ?? MAX_STEPS

  for (let step = 0; step < limit; step++) {
    const reply = await o.provider.chat({
      system: o.system,
      messages: [...o.history, ...turn],
      tools: specs,
      webSearch: o.webSearch && o.provider.canSearchWeb,
      signal: o.signal,
      onText: (delta) => {
        said += delta
        if (main) o.emit({ type: 'text', turnId: o.turnId, delta })
      }
    })
    turn.push({ role: 'assistant', parts: reply.parts, raw: reply.raw })
    for (const s of reply.sources ?? [])
      o.emit({ type: 'source', turnId: o.turnId, url: s.url, title: s.title })

    if (reply.stop === 'pause') {
      // A long web search paused; ask the model to carry on (a final assistant turn is not accepted).
      turn.push({ role: 'user', parts: [{ type: 'text', text: 'Continue.' }] })
      continue
    }
    const calls = reply.parts.filter(
      (p): p is Extract<Part, { type: 'tool_call' }> => p.type === 'tool_call'
    )
    if (reply.stop !== 'tool_use' || !calls.length) return finish(o, turn, said)

    const results: Part[] = []
    for (const call of calls) results.push(await runTool(call, o))
    turn.push({ role: 'user', parts: results })
  }

  const note = "I've stopped there because that took too many steps. Try asking in a simpler way."
  said += note
  if (main) o.emit({ type: 'text', turnId: o.turnId, delta: note })
  turn.push({ role: 'assistant', parts: [{ type: 'text', text: note }] })
  return finish(o, turn, said)
}

function finish(o: RunOptions, turn: Msg[], said: string): TurnResult {
  if (!o.agent) o.emit({ type: 'done', turnId: o.turnId })
  return { history: trim([...o.history, ...o.provider.finishTurn(turn)]), text: said.trim() }
}

async function runTool(call: Extract<Part, { type: 'tool_call' }>, o: RunOptions): Promise<Part> {
  const tool = o.tools.find((t) => t.name === call.name)
  const base = { type: 'tool_result' as const, id: call.id, name: call.name }
  if (!tool) return { ...base, content: `Unknown tool: ${call.name}`, isError: true }
  const step = (status: 'running' | 'done' | 'error' | 'declined', summary?: string): void =>
    o.emit({
      type: 'tool',
      turnId: o.turnId,
      id: call.id,
      name: tool.name,
      label: tool.label,
      status,
      summary,
      agent: o.agent
    })
  step('running')
  const parsed = tool.schema.safeParse(call.input ?? {})
  if (!parsed.success) {
    step('error', 'Bad input')
    return {
      ...base,
      content: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      isError: true
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
    step(declined ? 'declined' : res.isError ? 'error' : 'done', res.summary)
    return { ...base, content: res.content, isError: res.isError || undefined }
  } catch (e) {
    if (o.signal?.aborted) throw e
    step('error', 'Failed')
    return {
      ...base,
      content: `The tool failed: ${e instanceof Error ? e.message : String(e)}`,
      isError: true
    }
  }
}

/** Keeps the last KEEP_TURNS user turns. Always cuts before a typed message, never between a tool call and its result. */
export function trim(history: Msg[], keep = KEEP_TURNS): Msg[] {
  const starts = history
    .map((m, i) => (m.role === 'user' && m.parts.every((p) => p.type === 'text') ? i : -1))
    .filter((i) => i >= 0)
  if (starts.length <= keep) return history
  return history.slice(starts[starts.length - keep])
}
