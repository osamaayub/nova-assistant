/** Types shared by the main process (Node) and the window (React). No runtime code here. */

export type CharacterId = 'nova' | 'jarvis' | 'mentor' | 'friend' | 'custom'
/** The look and voice of the assistant: the plain orb, or a particle figure. */
export type AvatarId = 'core' | 'female' | 'male'
export type VoiceEngine = 'system' | 'kokoro'
export type ModelId = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'
export type ProviderId = 'claude' | 'ollama' | 'flm'
export type AgentMode = 'team' | 'single'

export interface CustomApp {
  name: string
  path: string
}

/** An MCP server Nova can connect to (calendar, email, ...). Runs as its own process. */
export interface McpServerConfig {
  name: string
  command: string
  args: string[]
  /** Extra environment variables for the server process. */
  env: Record<string, string>
}

export interface Settings {
  provider: ProviderId
  model: ModelId
  ollamaUrl: string
  ollamaModel: string
  agentMode: AgentMode
  character: CharacterId
  avatar: AvatarId
  customName: string
  customPersonality: string
  userName: string
  voice: VoiceEngine
  systemVoiceName: string
  kokoroVoice: string
  speakReplies: boolean
  webSearch: boolean
  customApps: CustomApp[]
  startWithWindows: boolean
  wakeWord: boolean
  mcpServers: McpServerConfig[]
  /** Serve the phone page on the home Wi-Fi so a paired phone can talk to Nova. Off by default. */
  remote: boolean
}

/** State of the phone link, shown in Settings. The pairing address contains the secret token. */
export interface RemoteInfo {
  enabled: boolean
  /** Address to open on the phone (same Wi-Fi). Null when off or when it could not start. */
  url: string | null
  /** The same address as a QR code image (data URL). */
  qr: string | null
  /** Phones connected right now. */
  phones: number
  error?: string
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

export interface Headline {
  title: string
  url: string
  source: string
  at: number | null
}

/** Live state of one configured MCP server, shown in Settings. */
export interface McpServerStatus {
  name: string
  state: 'connected' | 'connecting' | 'error' | 'off'
  /** Tool names the server offers, e.g. "gmail_send". */
  tools: string[]
  error?: string
}

/** Events the agent streams to the window while it works. */
export type AgentEvent =
  | { type: 'user'; text: string; from: 'window' | 'phone' }
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
  listMcp(): Promise<McpServerStatus[]>
  reconnectMcp(): Promise<McpServerStatus[]>
  remoteInfo(): Promise<RemoteInfo>
  /** Makes a new secret pairing code. Phones paired with the old one are disconnected. */
  remoteReset(): Promise<RemoteInfo>
  showWindow(): Promise<void>
  headlines(): Promise<Headline[]>
  /** Opens a public web link in the real browser. */
  openLink(url: string): Promise<void>
  platform: string
}
