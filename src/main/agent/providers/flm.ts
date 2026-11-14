import type { ChatRequest, ModelReply, Msg, Part, Provider } from '../types'
import { parseTextToolCalls, stripThinking, type FetchLike } from './ollama'

const CHAT_URL = 'https://api.jarvisclaw.ai/v1/chat/completions'

type OaiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }[]
}

function toOpenAI(m: Msg): OaiMessage[] {
  if (m.role === 'assistant') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    const calls = m.parts.filter((p) => p.type === 'tool_call')
    return [
      {
        role: 'assistant',
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) }
              }))
            }
          : {})
      }
    ]
  }
  const results = m.parts.filter((p) => p.type === 'tool_result')
  if (results.length)
    return results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content }))
  return [{ role: 'user', content: m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') }]
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

/**
 * Free cloud: a hosted OpenAI-compatible brain. No key and no Ollama, but the chat
 * leaves the PC, so it is a choice in Settings rather than the default.
 */
export function flmProvider(fetchImpl: FetchLike = fetch as unknown as FetchLike): Provider {
  return {
    id: 'flm',
    label: 'Free cloud',
    canSearchWeb: false,
    async chat(req: ChatRequest): Promise<ModelReply> {
      let res: Awaited<ReturnType<FetchLike>>
      try {
        res = await fetchImpl(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: req.signal,
          body: JSON.stringify({
            model: 'auto/free',
            stream: false,
            max_tokens: 2048,
            messages: [{ role: 'system', content: req.system }, ...req.messages.flatMap(toOpenAI)],
            tools: req.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.schema }
            }))
          })
        })
      } catch (e) {
        if (req.signal?.aborted) throw e
        throw new Error('Free cloud is not reachable. Check your internet connection.', { cause: e })
      }
      if (!res.ok) {
        const body = await res.text()
        if (res.status === 429)
          throw new Error('Free cloud is rate limiting requests right now. Wait a moment and try again.')
        if (res.status === 401 || res.status === 403)
          throw new Error('Free cloud rejected the request.')
        if (res.status >= 500 || /^\s*<!doctype html|^\s*<html/i.test(body))
          throw new Error('Free cloud is down right now. Try again in a moment.')
        throw new Error(`Free cloud error ${res.status}: ${body.slice(0, 200)}`)
      }

      const toolNames = req.tools.map((t) => t.name)
      const data = (await res.json()) as {
        error?: string
        choices?: {
          message?: {
            content?: string | null
            tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]
          }
        }[]
      }
      if (data.error) throw new Error(`Free cloud: ${data.error}`)
      const message = data.choices?.[0]?.message
      const final = stripThinking(message?.content ?? '').trim()
      const calls = (message?.tool_calls ?? []).flatMap((c) => {
        const name = c.function?.name
        return name ? [{ id: c.id ?? '', name, args: c.function?.arguments ?? '' }] : []
      })
      const textCalls = calls.length ? null : parseTextToolCalls(final, toolNames)
      if (textCalls)
        return {
          parts: textCalls.map((c, i) => ({
            type: 'tool_call' as const,
            id: `call_${i}`,
            name: c.name,
            input: c.input
          })),
          stop: 'tool_use'
        }
      const parts: Part[] = []
      if (final) {
        req.onText?.(final)
        parts.push({ type: 'text', text: final })
      }
      for (const c of calls)
        parts.push({
          type: 'tool_call',
          id: c.id || `call_${parts.length}`,
          name: c.name,
          input: safeJson(c.args)
        })
      return { parts, stop: parts.some((p) => p.type === 'tool_call') ? 'tool_use' : 'end' }
    },
    finishTurn: (msgs) => msgs
  }
}
