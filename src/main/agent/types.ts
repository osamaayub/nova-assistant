/**
 * Nova's own message format. Every provider (Claude, Ollama) converts to and from it,
 * so the agent loop and the team of agents don't care which brain is running.
 */
export type Part =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; name: string; content: string; isError?: boolean }

export interface Msg {
  role: 'user' | 'assistant'
  parts: Part[]
  /** The provider's original assistant content, kept so it can be sent back unchanged (Claude needs this mid-turn). */
  raw?: unknown
}

export interface ToolSpec {
  name: string
  description: string
  schema: Record<string, unknown>
}

export interface ModelReply {
  parts: Part[]
  /** end: answered. tool_use: wants tools run. pause: asked to continue (long web search). */
  stop: 'end' | 'tool_use' | 'pause'
  raw?: unknown
  sources?: { url: string; title: string }[]
}

export interface ChatRequest {
  system: string
  messages: Msg[]
  tools: ToolSpec[]
  webSearch: boolean
  onText?: (delta: string) => void
  signal?: AbortSignal
}

export interface Provider {
  id: 'claude' | 'ollama'
  label: string
  /** Built-in web search (Claude only). Other providers use the read_web_page tool instead. */
  canSearchWeb: boolean
  chat(req: ChatRequest): Promise<ModelReply>
  /** Removes anything that must not be resent in later turns (Claude thinking blocks). */
  finishTurn(msgs: Msg[]): Msg[]
}
