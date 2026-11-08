import { useEffect, useState } from 'react'
import type { CharacterId, Fact, ModelId, PublicSettings, Settings } from '../../../../shared/types'
import { nova } from '../../lib/api'
import { KOKORO_VOICES, systemVoices } from '../voice/speaker'

const MODELS: { id: ModelId; label: string }[] = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (fastest, cheapest)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (recommended)' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (smartest, slowest)' }
]

const CHARACTERS: { id: CharacterId; label: string; hint: string }[] = [
  { id: 'nova', label: 'Nova', hint: 'Calm assistant with a dry wit' },
  { id: 'mentor', label: 'Sage', hint: 'Patient mentor' },
  { id: 'friend', label: 'Max', hint: 'Relaxed best friend' },
  { id: 'custom', label: 'Your own', hint: 'Name and personality you write' }
]

export function SettingsPanel({
  settings,
  onChange,
  onClose
}: {
  settings: PublicSettings
  onChange: (s: PublicSettings) => void
  onClose: () => void
}): React.JSX.Element {
  const [key, setKey] = useState('')
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [facts, setFacts] = useState<Fact[]>([])
  const [app, setApp] = useState({ name: '', path: '' })

  useEffect(() => {
    void systemVoices().then((v) => setVoices(v.filter((x) => x.lang.startsWith('en'))))
    void nova.listFacts().then(setFacts)
  }, [])

  const save = async (patch: Partial<Settings>): Promise<void> =>
    onChange(await nova.saveSettings(patch))

  const saveKey = async (): Promise<void> => {
    try {
      onChange(await nova.saveApiKey(key))
      setKey('')
      setKeyMsg({ ok: true, text: 'Saved and encrypted on this PC.' })
    } catch (e) {
      setKeyMsg({
        ok: false,
        text:
          e instanceof Error
            ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
            : 'Could not save the key.'
      })
    }
  }

  return (
    <aside className="panel" role="dialog" aria-label="Settings">
      <header className="panel-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      <section>
        <h3>Claude API key</h3>
        <p className="hint">
          {settings.hasApiKey
            ? 'A key is saved and encrypted with Windows.'
            : 'Nova needs your own key from the Claude Console. You pay Anthropic directly for what you use.'}
        </p>
        <div className="row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={settings.hasApiKey ? 'Paste a new key to replace it' : 'sk-ant-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-label="Claude API key"
          />
          <button className="btn primary" disabled={!key.trim()} onClick={saveKey}>
            Save
          </button>
        </div>
        {settings.hasApiKey && (
          <button className="link" onClick={async () => onChange(await nova.clearApiKey())}>
            Remove saved key
          </button>
        )}
        {keyMsg && <p className={keyMsg.ok ? 'ok' : 'error'}>{keyMsg.text}</p>}
      </section>

      <section>
        <h3>Brain</h3>
        <label>
          Model
          <select
            value={settings.model}
            onChange={(e) => save({ model: e.target.value as ModelId })}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.webSearch}
            onChange={(e) => save({ webSearch: e.target.checked })}
          />
          Search the web for current answers ($10 per 1,000 searches on your Claude bill)
        </label>
      </section>

      <section>
        <h3>Character</h3>
        <div className="chips">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              className={`chip ${settings.character === c.id ? 'on' : ''}`}
              onClick={() => save({ character: c.id })}
              aria-pressed={settings.character === c.id}
              title={c.hint}
            >
              {c.label}
            </button>
          ))}
        </div>
        {settings.character === 'custom' && (
          <>
            <label>
              Name
              <input
                value={settings.customName}
                maxLength={30}
                onChange={(e) => onChange({ ...settings, customName: e.target.value })}
                onBlur={(e) => save({ customName: e.target.value })}
              />
            </label>
            <label>
              Personality
              <textarea
                rows={3}
                maxLength={600}
                value={settings.customPersonality}
                onChange={(e) => onChange({ ...settings, customPersonality: e.target.value })}
                onBlur={(e) => save({ customPersonality: e.target.value })}
              />
            </label>
          </>
        )}
        <label>
          Your name
          <input
            value={settings.userName}
            maxLength={40}
            placeholder="What should it call you?"
            onChange={(e) => onChange({ ...settings, userName: e.target.value })}
            onBlur={(e) => save({ userName: e.target.value })}
          />
        </label>
      </section>

      <section>
        <h3>Voice</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.speakReplies}
            onChange={(e) => save({ speakReplies: e.target.checked })}
          />
          Speak replies out loud
        </label>
        <label>
          Voice engine
          <select
            value={settings.voice}
            onChange={(e) => save({ voice: e.target.value as Settings['voice'] })}
          >
            <option value="system">Windows voice (instant)</option>
            <option value="kokoro">
              Natural voice, Kokoro (runs on your PC, 90 MB download once)
            </option>
          </select>
        </label>
        {settings.voice === 'system' ? (
          <label>
            Windows voice
            <select
              value={settings.systemVoiceName}
              onChange={(e) => save({ systemVoiceName: e.target.value })}
            >
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Natural voice
            <select
              value={settings.kokoroVoice}
              onChange={(e) => save({ kokoroVoice: e.target.value })}
            >
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="hint">
          Hold Space (or the mic button) to talk. Speech is turned into text on your PC with Whisper
          (80 MB download once).
        </p>
      </section>

      <section>
        <h3>Your apps</h3>
        <p className="hint">
          Nova can open common apps already. Add others by their .exe path, for example C:\Program
          Files\Figma\Figma.exe.
        </p>
        {settings.customApps.map((a) => (
          <div key={a.name} className="list-row">
            <span>
              <strong>{a.name}</strong> <small>{a.path}</small>
            </span>
            <button
              className="icon-btn"
              aria-label={`Remove ${a.name}`}
              onClick={() =>
                save({ customApps: settings.customApps.filter((x) => x.name !== a.name) })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <input
            placeholder="Name"
            value={app.name}
            maxLength={40}
            onChange={(e) => setApp({ ...app, name: e.target.value })}
            aria-label="App name"
          />
          <input
            placeholder="Path to .exe"
            value={app.path}
            onChange={(e) => setApp({ ...app, path: e.target.value })}
            aria-label="App path"
          />
          <button
            className="btn"
            disabled={!app.name.trim() || !/\.(exe|lnk|url)$/i.test(app.path.trim())}
            onClick={async () => {
              await save({ customApps: [...settings.customApps, app] })
              setApp({ name: '', path: '' })
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section>
        <h3>Memory</h3>
        <p className="hint">
          What Nova remembers about you. It is stored only on this PC and sent to Claude with each
          message.
        </p>
        {facts.length === 0 && (
          <p className="hint">Nothing yet. Tell Nova about yourself and it will remember.</p>
        )}
        {facts.map((f) => (
          <div key={f.id} className="list-row">
            <span>{f.text}</span>
            <button
              className="icon-btn"
              aria-label={`Forget: ${f.text}`}
              onClick={async () => setFacts(await nova.deleteFact(f.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </section>
    </aside>
  )
}
