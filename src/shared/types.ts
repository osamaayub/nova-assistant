/** Types shared by the main process (Node) and the window (React). No runtime code here. */

export type CharacterId = 'nova' | 'mentor' | 'friend' | 'custom'
export type VoiceEngine = 'system' | 'kokoro'
export type ModelId = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'
export type ProviderId = 'claude' | 'ollama'
export type AgentMode = 'team' | 'single'

export interface CustomApp {
  name: string
  path: string
}

export interface Settings {
  provider: ProviderId
  model: ModelId
  ollamaUrl: string
  ollamaModel: string
  agentMode: AgentMode
  character: CharacterId
  customName: string
  customPersonality: string
  userName: string
  voice: VoiceEngine
  systemVoiceName: string
  kokoroVoice: string
  speakReplies: boolean
  webSearch: boolean
  customApps: CustomApp[]
}

/** What the window receives: settings, plus whether a key is saved (never the key itself). */
export interface PublicSettings extends Settings {
  hasApiKey: boolean
  keyStorage: 'encrypted' | 'unavailable'
}

export interface Fact {
  id: number
  text: string
  createdAt: string
}

/** Events the agent streams to the window while it works. */
export type AgentEvent =
  | { type: 'start'; turnId: string }
  | { type: 'text'; turnId: string; delta: string }
  | {
      type: 'tool'
      turnId: string
      id: string
      name: string
      label: string
      status: 'running' | 'done' | 'error' | 'declined'
      summary?: string
      /** Which specialist ran it ("PC agent"), or empty for the main agent. */
      agent?: string
    }
  | { type: 'confirm'; turnId: string; id: string; title: string; detail: string }
  | { type: 'source'; turnId: string; url: string; title: string }
  | { type: 'done'; turnId: string }
  | { type: 'error'; turnId: string; message: string }
  | { type: 'notify'; title: string; body: string }

export interface NovaApi {
  send(text: string): Promise<void>
  stop(): Promise<void>
  newChat(): Promise<void>
  confirm(id: string, approved: boolean): Promise<void>
  onEvent(listener: (event: AgentEvent) => void): () => void
  getSettings(): Promise<PublicSettings>
  saveSettings(patch: Partial<Settings>): Promise<PublicSettings>
  saveApiKey(key: string): Promise<PublicSettings>
  clearApiKey(): Promise<PublicSettings>
  listFacts(): Promise<Fact[]>
  deleteFact(id: number): Promise<Fact[]>
  checkOllama(url: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }>
  platform: string
}
