import type { ChatRequest, ModelReply, Msg, Part, Provider } from '../types'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
  body: ReadableStream<Uint8Array> | null
}>

type OllamaMsg = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { function: { name: string; arguments: unknown } }[]
  tool_name?: string
}

function toOllama(m: Msg): OllamaMsg[] {
  if (m.role === 'assistant') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    const calls = m.parts.filter((p) => p.type === 'tool_call')
    return [
      {
        role: 'assistant',
        content: text,
        ...(calls.length
          ? { tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.input } })) }
          : {})
      }
    ]
  }
  const results = m.parts.filter((p) => p.type === 'tool_result')
  if (results.length)
    return results.map((r) => ({ role: 'tool', tool_name: r.name, content: r.content }))
  return [{ role: 'user', content: m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') }]
}

/** Ollama only listens on this computer by default. Nova only talks to http(s) addresses. */
export function cleanOllamaUrl(url: string): string {
  const u = new URL(url.trim() || 'http://127.0.0.1:11434')
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    throw new Error('Ollama address must start with http://')
  return u.origin
}

/** Lists the models installed in Ollama (GET /api/tags). */
export async function listOllamaModels(
  url: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<string[]> {
  const res = await fetchImpl(`${cleanOllamaUrl(url)}/api/tags`, {
    signal: AbortSignal.timeout(4000)
  })
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`)
  const data = (await res.json()) as { models?: { name: string }[] }
  return (data.models ?? []).map((m) => m.name)
}

/** Some local models write their reasoning inline; it should not be shown or spoken. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
}

/**
 * Ollama: free models running on this PC (Qwen, Llama...). No key, no cost, works offline.
 * Streams /api/chat as newline-delimited JSON; tool calls arrive in message.tool_calls.
 */
export function ollamaProvider(
  url: string,
  model: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Provider {
  return {
    id: 'ollama',
    label: 'Ollama',
    canSearchWeb: false,
    async chat(req: ChatRequest): Promise<ModelReply> {
      let res: Awaited<ReturnType<FetchLike>>
      try {
        res = await fetchImpl(`${cleanOllamaUrl(url)}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: req.signal,
          body: JSON.stringify({
            model,
            stream: true,
            messages: [{ role: 'system', content: req.system }, ...req.messages.flatMap(toOllama)],
            tools: req.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.schema }
            }))
          })
        })
      } catch (e) {
        if (req.signal?.aborted) throw e
        throw new Error(
          'Ollama is not running. Install it from ollama.com and open it, then try again.',
          { cause: e }
        )
      }
      if (!res.ok) {
        const body = await res.text()
        if (res.status === 404)
          throw new Error(`The model "${model}" is not installed. Run: ollama pull ${model}`)
        if (/does not support tools/i.test(body))
          throw new Error(
            `"${model}" can't use tools. Pick a model like qwen3:8b or llama3.1:8b in Settings.`
          )
        throw new Error(`Ollama error ${res.status}: ${body.slice(0, 200)}`)
      }
      let text = ''
      let shown = ''
      const calls: Part[] = []
      let buffer = ''
      const handle = (line: string): void => {
        if (!line.trim()) return
        const chunk = JSON.parse(line) as {
          message?: {
            content?: string
            tool_calls?: { function: { name: string; arguments: unknown } }[]
          }
          error?: string
        }
        if (chunk.error) throw new Error(`Ollama: ${chunk.error}`)
        const m = chunk.message
        if (m?.content) {
          text += m.content
          // Only stream what is outside <think> blocks.
          const visible = stripThinking(text)
          if (visible.length > shown.length && !/<think>(?![\s\S]*<\/think>)/.test(text)) {
            req.onText?.(visible.slice(shown.length))
            shown = visible
          }
        }
        for (const c of m?.tool_calls ?? [])
          calls.push({
            type: 'tool_call',
            id: `call_${calls.length}_${Date.now().toString(36)}`,
            name: c.function.name,
            input:
              typeof c.function.arguments === 'string'
                ? safeJson(c.function.arguments)
                : c.function.arguments
          })
      }
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
      const final = stripThinking(text).trim()
      const parts: Part[] = [...(final ? [{ type: 'text' as const, text: final }] : []), ...calls]
      return { parts, stop: calls.length ? 'tool_use' : 'end' }
    },
    finishTurn: (msgs) => msgs
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
