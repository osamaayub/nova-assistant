import type { ChatRequest, ModelReply, Msg, Part, Provider } from '../types'
import { maybeTextCall, parseTextToolCalls, stripThinking, type FetchLike } from './ollama'

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
            stream: true,
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
      let raw = ''
      let shown = ''
      const calls: { id: string; name: string; args: string }[] = []
      const emitVisible = (): void => {
        const visible = stripThinking(raw)
        if (
          visible.length > shown.length &&
          !/<think>(?![\s\S]*<\/think>)/.test(raw) &&
          !maybeTextCall(visible, toolNames)
        ) {
          req.onText?.(visible.slice(shown.length))
          shown = visible
        }
      }
      const handle = (line: string): void => {
        if (!line.startsWith('data:')) return
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') return
        const chunk = JSON.parse(data) as {
          error?: string
          choices?: {
            delta?: {
              content?: string
              tool_calls?: {
                index?: number
                id?: string
                function?: { name?: string; arguments?: string }
              }[]
            }
          }[]
        }
        if (chunk.error) throw new Error(`Free cloud: ${chunk.error}`)
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          raw += delta.content
          emitVisible()
        }
        for (const tc of delta?.tool_calls ?? []) {
          const i = tc.index ?? 0
          const cur = (calls[i] ??= { id: '', name: '', args: '' })
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.args += tc.function.arguments
        }
      }

      let buffer = ''
      const reader = res.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          lines.forEach(handle)
        }
      } else buffer = await res.text()
      buffer.split('\n').forEach(handle)

      const final = stripThinking(raw).trim()
      const textCalls = calls.some((c) => c?.name) ? null : parseTextToolCalls(final, toolNames)
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
      // Text held back because it looked like a call, but was not one: show it now.
      if (final.length > shown.length && final.startsWith(shown)) req.onText?.(final.slice(shown.length))
      const parts: Part[] = [...(final ? [{ type: 'text' as const, text: final }] : [])]
      for (const c of calls.filter((c) => c?.name))
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
