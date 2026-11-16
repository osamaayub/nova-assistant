import type { AgentEvent, Fact, NovaApi, PublicSettings, Settings } from '../../../shared/types'

function ollamaOrigin(url: string): string {
  const u = new URL(url.trim() || 'http://127.0.0.1:11434')
  return u.origin
}

/** One plain sentence that tells the user the exact fix for a failed browser-to-Ollama call. */
function cannotReachOllama(): string {
  const site = typeof location !== 'undefined' ? location.origin : 'this site'
  return `Cannot reach Ollama. Open Ollama, set OLLAMA_ORIGINS to ${site}, restart it, and allow local network access if the browser asks.`
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
}

/**
 * In the app, window.nova comes from the preload script. In a plain browser (the Vercel
 * preview, design work) this fake answers: chat goes straight to a local Ollama over HTTP,
 * everything else is a harmless stub. PC tools cannot run in a browser.
 */
function browserFake(): NovaApi {
  let settings: PublicSettings = {
    provider: 'ollama',
    model: 'claude-sonnet-5-5',
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'qwen3:8b',
    agentMode: 'team',
    character: 'nova',
    avatar: 'core',
    customName: 'Atlas',
    customPersonality: 'Calm and encouraging.',
    behaviorNotes: '',
    userName: '',
    voice: 'system',
    systemVoiceName: '',
    kokoroVoice: 'am_michael',
    speakReplies: false,
    webSearch: true,
    customApps: [],
    startWithWindows: false,
    wakeWord: false,
    mcpServers: [],
    remote: false,
    hasApiKey: true,
    keyStorage: 'encrypted'
  }
  let facts: Fact[] = [{ id: 1, text: 'Is learning agentic engineering', createdAt: '2026-11-08' }]
  const listeners = new Set<(e: AgentEvent) => void>()
  const emit = (e: AgentEvent): void => listeners.forEach((l) => l(e))
  const history: { role: 'user' | 'assistant'; content: string }[] = []
  let abort: AbortController | null = null
  return {
    platform: 'browser',
    async send(text) {
      const turnId = crypto.randomUUID()
      emit({ type: 'start', turnId })
      abort = new AbortController()
      let reply = ''
      let shown = ''
      try {
        const res = await fetch(`${ollamaOrigin(settings.ollamaUrl)}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            model: settings.ollamaModel,
            stream: true,
            messages: [
              ...(settings.customName || settings.customPersonality
                ? [
                    {
                      role: 'system' as const,
                      content: `You are ${settings.customName || 'Nova'}, a voice AI assistant.${settings.customPersonality ? ` ${settings.customPersonality}` : ''} Keep replies short and conversational.`
                    }
                  ]
                : []),
              ...history,
              { role: 'user' as const, content: text }
            ]
          })
        })
        if (!res.ok || !res.body)
          throw new Error(
            res.status === 404
              ? `The model "${settings.ollamaModel}" is not installed. Run: ollama pull ${settings.ollamaModel}`
              : `Ollama error ${res.status}`
          )
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            const chunk = JSON.parse(line) as {
              message?: { content?: string }
              error?: string
            }
            if (chunk.error) throw new Error(`Ollama: ${chunk.error}`)
            reply += chunk.message?.content ?? ''
            const visible = stripThinking(reply)
            if (visible.length > shown.length) {
              emit({ type: 'text', turnId, delta: visible.slice(shown.length) })
              shown = visible
            }
          }
        }
        const final = stripThinking(reply).trim()
        if (final) {
          history.push({ role: 'user', content: text }, { role: 'assistant', content: final })
          if (history.length > 30) history.splice(0, history.length - 30)
        }
        if (settings.speakReplies && final && 'speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(final)
          speechSynthesis.speak(u)
        }
        emit({ type: 'done', turnId })
      } catch (e) {
        if (abort?.signal.aborted) {
          emit({ type: 'done', turnId })
        } else {
          emit({
            type: 'error',
            turnId,
            message:
              e instanceof TypeError
                ? cannotReachOllama()
                : e instanceof Error
                  ? e.message
                  : 'Chat failed. Try again.'
          })
        }
      } finally {
        abort = null
      }
    },
    async stop() {
      abort?.abort()
    },
    async newChat() {
      history.length = 0
    },
    async confirm(id, ok) {
      emit({
        type: 'tool',
        turnId: 'x',
        id,
        name: 'organize_downloads',
        label: 'Organizing Downloads',
        status: ok ? 'done' : 'declined',
        summary: ok ? 'Moved 24 files' : 'Cancelled'
      })
      emit({
        type: 'text',
        turnId: 'x',
        delta: ok
          ? 'All tidy. 24 files are in folders now.'
          : 'No problem, I left Downloads as it is.'
      })
      emit({ type: 'done', turnId: 'x' })
    },
    onEvent(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async getSettings() {
      return settings
    },
    async saveSettings(p: Partial<Settings>) {
      settings = { ...settings, ...p }
      return settings
    },
    async saveApiKey() {
      settings = { ...settings, hasApiKey: true }
      return settings
    },
    async clearApiKey() {
      settings = { ...settings, hasApiKey: false }
      return settings
    },
    async listFacts() {
      return facts
    },
    async checkOllama(url) {
      try {
        const res = await fetch(`${ollamaOrigin(url)}/api/tags`, {
          signal: AbortSignal.timeout(4000)
        })
        if (!res.ok) return { ok: false as const, error: `Ollama answered ${res.status}` }
        const data = (await res.json()) as { models?: { name: string }[] }
        return { ok: true as const, models: (data.models ?? []).map((m) => m.name) }
      } catch {
        return { ok: false as const, error: cannotReachOllama() }
      }
    },
    async listMcp() {
      return settings.mcpServers.map((s) => ({
        name: s.name,
        state: 'connected' as const,
        tools: ['preview']
      }))
    },
    async reconnectMcp() {
      return this.listMcp()
    },
    async remoteInfo() {
      return {
        enabled: settings.remote,
        url: settings.remote ? 'http://192.168.1.20:47821/#t=preview' : null,
        qr: null,
        publicUrl: settings.remote ? 'https://preview.trycloudflare.com/#t=preview' : null,
        phones: 0
      }
    },
    async remoteReset() {
      return this.remoteInfo()
    },
    async showWindow() {
      // The preview is already visible.
    },
    async headlines() {
      return [
        {
          title: 'Global markets steady as central banks signal steady rates',
          url: 'https://example.com/1',
          source: 'BBC World',
          at: Date.now() - 3600_000
        },
        {
          title: 'Breakthrough in battery research promises week-long phone charge',
          url: 'https://example.com/2',
          source: 'NPR',
          at: Date.now() - 7200_000
        },
        {
          title: 'Champions League finalists revealed after dramatic semi-finals',
          url: 'https://example.com/3',
          source: 'The Guardian',
          at: Date.now() - 10_800_000
        }
      ]
    },
    async openLink(url) {
      window.open(url, '_blank', 'noopener')
    },
    async deleteFact(id) {
      facts = facts.filter((f) => f.id !== id)
      return facts
    },
    async updateFact(id, text) {
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, 300)
      if (!clean) throw new Error('Empty fact.')
      if (facts.some((f) => f.id !== id && f.text.toLowerCase() === clean.toLowerCase()))
        throw new Error('Already remembered.')
      facts = facts.map((f) => (f.id === id ? { ...f, text: clean } : f))
      return facts
    }
  }
}

export const nova: NovaApi =
  typeof window !== 'undefined' && window.nova ? window.nova : browserFake()
