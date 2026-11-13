import type { AgentEvent, Fact, NovaApi, PublicSettings, Settings } from '../../../shared/types'

/**
 * In the app, window.nova comes from the preload script. In a plain browser (design work, screenshots)
 * a small fake answers instead, so the interface can be developed without Electron.
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
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  return {
    platform: 'browser',
    async send(text) {
      const turnId = crypto.randomUUID()
      emit({ type: 'start', turnId })
      await wait(500)
      if (/spotify|music|play/i.test(text)) {
        emit({
          type: 'tool',
          turnId,
          id: 'a',
          name: 'play_music',
          label: 'Finding music',
          status: 'running',
          agent: 'PC agent'
        })
        await wait(700)
        emit({
          type: 'tool',
          turnId,
          id: 'a',
          name: 'play_music',
          label: 'Finding music',
          status: 'done',
          summary: 'Searched YouTube: lofi beats',
          agent: 'PC agent'
        })
      }
      if (/organi[sz]e/i.test(text)) {
        emit({
          type: 'tool',
          turnId,
          id: 'b',
          name: 'organize_downloads',
          label: 'Organizing Downloads',
          status: 'running',
          agent: 'Files agent'
        })
        emit({
          type: 'confirm',
          turnId,
          id: 'b',
          title: 'Move 24 files in Downloads into folders?',
          detail: 'Images: 9 files\nDocuments: 11 files\nInstallers: 4 files\n\nNothing is deleted.'
        })
        return
      }
      for (const w of 'Done. I opened a YouTube search for lofi beats. Anything else?'.split(' ')) {
        emit({ type: 'text', turnId, delta: w + ' ' })
        await wait(60)
      }
      emit({ type: 'done', turnId })
    },
    async stop() {
      // Nothing to stop in the browser preview.
    },
    async newChat() {
      // The preview keeps no history.
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
    async checkOllama() {
      return { ok: true as const, models: ['qwen3:8b', 'llama3.1:8b'] }
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
    async openLink() {
      // Links do nothing in the browser preview.
    },
    async deleteFact(id) {
      facts = facts.filter((f) => f.id !== id)
      return facts
    }
  }
}

export const nova: NovaApi =
  typeof window !== 'undefined' && window.nova ? window.nova : browserFake()
