import type { Settings } from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  // Free and local by default: no key needed. Switch to Claude in Settings for a smarter brain and web search.
  provider: 'ollama',
  model: 'claude-sonnet-5-5',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen3:8b',
  agentMode: 'team',
  character: 'nova',
  customName: 'Atlas',
  customPersonality: 'Calm, curious and encouraging. Explains things simply.',
  userName: '',
  voice: 'system',
  systemVoiceName: '',
  kokoroVoice: 'am_michael',
  speakReplies: true,
  webSearch: true,
  customApps: []
}

const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const

/** Keeps only known keys with valid values, so a hand-edited or old settings file can't break the app. */
export function cleanSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (k: keyof Settings, max = 400): string =>
    typeof r[k] === 'string' ? (r[k] as string).slice(0, max) : (DEFAULT_SETTINGS[k] as string)
  const bool = (k: keyof Settings): boolean =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean)
  const pick = <T extends string>(k: keyof Settings, allowed: readonly T[]): T =>
    allowed.includes(r[k] as T) ? (r[k] as T) : (DEFAULT_SETTINGS[k] as T)
  const apps = Array.isArray(r.customApps)
    ? r.customApps
        .filter(
          (a): a is { name: string; path: string } =>
            !!a && typeof a.name === 'string' && typeof a.path === 'string'
        )
        .map((a) => ({ name: a.name.trim().slice(0, 40), path: a.path.trim().slice(0, 400) }))
        .filter((a) => a.name && a.path)
        .slice(0, 30)
    : []
  return {
    provider: pick('provider', ['claude', 'ollama'] as const),
    model: pick('model', MODELS),
    ollamaUrl: str('ollamaUrl', 200),
    ollamaModel: str('ollamaModel', 80).trim() || DEFAULT_SETTINGS.ollamaModel,
    agentMode: pick('agentMode', ['team', 'single'] as const),
    character: pick('character', ['nova', 'mentor', 'friend', 'custom'] as const),
    customName: str('customName', 30),
    customPersonality: str('customPersonality', 600),
    userName: str('userName', 40),
    voice: pick('voice', ['system', 'kokoro'] as const),
    systemVoiceName: str('systemVoiceName', 120),
    kokoroVoice: str('kokoroVoice', 40),
    speakReplies: bool('speakReplies'),
    webSearch: bool('webSearch'),
    customApps: apps
  }
}
