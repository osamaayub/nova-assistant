import type Anthropic from '@anthropic-ai/sdk'
import type { ModelId } from '../../../shared/types'
import type { ChatRequest, ModelReply, Msg, Part, Provider } from '../types'

/** The small part of the Anthropic client Nova uses, so tests can pass a fake. */
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

type Block = Anthropic.ContentBlockParam

function toAnthropic(m: Msg): Anthropic.MessageParam {
  if (m.role === 'assistant') {
    if (Array.isArray(m.raw)) return { role: 'assistant', content: m.raw as Block[] }
    const content: Block[] = m.parts.flatMap((p): Block[] =>
      p.type === 'text'
        ? [{ type: 'text', text: p.text }]
        : p.type === 'tool_call'
          ? [{ type: 'tool_use', id: p.id, name: p.name, input: p.input }]
          : []
    )
    return { role: 'assistant', content: content.length ? content : '(no reply)' }
  }
  const results = m.parts.filter((p) => p.type === 'tool_result')
  if (results.length)
    return {
      role: 'user',
      content: results.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {})
      }))
    }
  return { role: 'user', content: m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') }
}

/** Claude: tool use, built-in web search, thinking kept within a turn and dropped after it. */
export function claudeProvider(client: StreamingClient, model: ModelId): Provider {
  return {
    id: 'claude',
    label: 'Claude',
    canSearchWeb: true,
    async chat(req: ChatRequest): Promise<ModelReply> {
      const tools = [
        ...req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: { ...t.schema, type: 'object' }
        })),
        ...(req.webSearch ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] : [])
      ]
      const stream = client.messages.stream(
        {
          model,
          max_tokens: 2048,
          system: req.system,
          tools,
          output_config: { effort: 'low' },
          messages: req.messages.map(toAnthropic)
        } as unknown as Anthropic.MessageCreateParamsNonStreaming,
        { signal: req.signal }
      )
      if (req.onText) stream.on('text', req.onText)
      const msg = await stream.finalMessage()
      const parts: Part[] = []
      const sources: { url: string; title: string }[] = []
      for (const b of msg.content) {
        if (b.type === 'text') parts.push({ type: 'text', text: b.text })
        else if (b.type === 'tool_use')
          parts.push({ type: 'tool_call', id: b.id, name: b.name, input: b.input })
        else if (b.type === 'web_search_tool_result' && Array.isArray(b.content))
          for (const r of b.content.slice(0, 3))
            if (r.type === 'web_search_result') sources.push({ url: r.url, title: r.title })
      }
      const stop =
        msg.stop_reason === 'pause_turn'
          ? 'pause'
          : msg.stop_reason === 'tool_use' && parts.some((p) => p.type === 'tool_call')
            ? 'tool_use'
            : 'end'
      return { parts, stop, raw: msg.content, sources }
    },
    finishTurn(msgs) {
      return msgs.map((m) => {
        if (m.role !== 'assistant' || !Array.isArray(m.raw)) return m
        const kept = (m.raw as { type: string }[]).filter(
          (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking'
        )
        return { ...m, raw: kept.length ? kept : undefined }
      })
    }
  }
}
