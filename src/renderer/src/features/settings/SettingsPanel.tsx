import { useEffect, useState } from 'react'
import type {
  CharacterId,
  Fact,
  McpServerConfig,
  McpServerStatus,
  ModelId,
  PublicSettings,
  Settings
} from '../../../../shared/types'
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
  const [ollama, setOllama] = useState<{ checking?: boolean; models?: string[]; error?: string }>(
    {}
  )
  const [mcp, setMcp] = useState<McpServerStatus[]>([])
  const [mcpForm, setMcpForm] = useState({ name: '', command: '', args: '' })

  const refreshMcp = (): void => void nova.listMcp().then(setMcp)

  const checkOllama = async (): Promise<void> => {
    setOllama({ checking: true })
    const res = await nova.checkOllama(settings.ollamaUrl)
    setOllama(res.ok ? { models: res.models } : { error: res.error })
  }

  useEffect(() => {
    void systemVoices().then((v) => setVoices(v.filter((x) => x.lang.startsWith('en'))))
    void nova.listFacts().then(setFacts)
    void refreshMcp()
  }, [])

  const save = async (patch: Partial<Settings>): Promise<void> =>
    onChange(await nova.saveSettings(patch))

  const saveMcp = async (servers: McpServerConfig[]): Promise<void> => {
    onChange(await nova.saveSettings({ mcpServers: servers }))
    // Give the manager a moment to start the new processes, then show real status.
    setTimeout(() => void refreshMcp(), 800)
  }

  const addMcp = async (): Promise<void> => {
    const server: McpServerConfig = {
      name: mcpForm.name.trim(),
      command: mcpForm.command.trim(),
      args: mcpForm.args.trim() ? mcpForm.args.trim().split(/\s+/) : [],
      env: {}
    }
    await saveMcp([...settings.mcpServers, server])
    setMcpForm({ name: '', command: '', args: '' })
  }

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
        <h3>Brain</h3>
        <div className="chips" role="radiogroup" aria-label="Brain">
          <button
            className={`chip ${settings.provider === 'ollama' ? 'on' : ''}`}
            role="radio"
            aria-checked={settings.provider === 'ollama'}
            onClick={() => save({ provider: 'ollama' })}
          >
            Free local AI (Ollama)
          </button>
          <button
            className={`chip ${settings.provider === 'flm' ? 'on' : ''}`}
            role="radio"
            aria-checked={settings.provider === 'flm'}
            onClick={() => save({ provider: 'flm' })}
          >
            Free cloud (no key)
          </button>
          <button
            className={`chip ${settings.provider === 'claude' ? 'on' : ''}`}
            role="radio"
            aria-checked={settings.provider === 'claude'}
            onClick={() => save({ provider: 'claude' })}
          >
            Claude
          </button>
        </div>

        {settings.provider === 'ollama' ? (
          <>
            <p className="hint" style={{ marginTop: 10 }}>
              Runs on your PC: no key, no cost, works offline. Slower and less clever than Claude,
              and it can&apos;t search the web.
            </p>
            <ol className="steps">
              <li>Install Ollama from ollama.com and open it.</li>
              <li>
                In a terminal, run <code>ollama pull {settings.ollamaModel || 'qwen3:8b'}</code>{' '}
                (about 5 GB, once).
              </li>
              <li>Click Check connection below.</li>
            </ol>
            <label>
              Ollama address
              <input
                value={settings.ollamaUrl}
                onChange={(e) => onChange({ ...settings, ollamaUrl: e.target.value })}
                onBlur={(e) => save({ ollamaUrl: e.target.value })}
                spellCheck={false}
              />
            </label>
            <label>
              Model
              {ollama.models?.length ? (
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => save({ ollamaModel: e.target.value })}
                >
                  {!ollama.models.includes(settings.ollamaModel) && (
                    <option value={settings.ollamaModel}>
                      {settings.ollamaModel} (not installed)
                    </option>
                  )}
                  {ollama.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={settings.ollamaModel}
                  onChange={(e) => onChange({ ...settings, ollamaModel: e.target.value })}
                  onBlur={(e) => save({ ollamaModel: e.target.value })}
                  spellCheck={false}
                />
              )}
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" disabled={ollama.checking} onClick={checkOllama}>
                {ollama.checking ? 'Checking…' : 'Check connection'}
              </button>
            </div>
            {ollama.error && <p className="error">{ollama.error}</p>}
            {ollama.models && (
              <p className="ok">
                {ollama.models.length
                  ? `Connected. ${ollama.models.length} model${ollama.models.length === 1 ? '' : 's'} installed.`
                  : 'Connected, but no models are installed yet. Run the ollama pull command above.'}
              </p>
            )}
            <p className="hint">
              Good models with tools: qwen3:8b (recommended), llama3.1:8b, or qwen3:4b for slower
              PCs.
            </p>
          </>
        ) : settings.provider === 'flm' ? (
          <>
            <p className="hint" style={{ marginTop: 10 }}>
              No key and no Ollama. Uses api.jarvisclaw.ai, a free hosted API, so your chats go to
              that service. Free per-IP limits apply.
            </p>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 10 }}>
              {settings.hasApiKey
                ? 'A key is saved and encrypted with Windows.'
                : 'Smarter and faster, with web search. Needs your own key from the Claude Console; you pay Anthropic for what you use.'}
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
          </>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={settings.agentMode === 'team'}
            onChange={(e) => save({ agentMode: e.target.checked ? 'team' : 'single' })}
          />
          <span>
            Team of agents. Nova hands jobs to PC, Files, Research and a coding crew: Architect,
            Developer, Reviewer and Tester. Better at multi-step requests; turn off for quicker
            single commands.
          </span>
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
        <h3>Always on</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.wakeWord}
            onChange={(e) => save({ wakeWord: e.target.checked })}
          />
          <span>
            Wake word. Say <strong>&quot;Hey Nova&quot;</strong> from anywhere, then your command.
            Uses the microphone constantly, so it costs some battery.
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.startWithWindows}
            onChange={(e) => save({ startWithWindows: e.target.checked })}
          />
          Start with Windows. Nova also lives in the system tray; closing the window keeps it
          running.
        </label>
      </section>

      <section>
        <h3>Connectors (MCP)</h3>
        <p className="hint">
          Connect external apps Nova can use, like a calendar or email server. Each server is a
          program that speaks MCP over stdio, for example{' '}
          <code>npx -y @modelcontextprotocol/server-filesystem C:\Users\You\Documents</code>.
          Anything that changes data asks you first.
        </p>
        {settings.mcpServers.map((s) => {
          const st = mcp.find((m) => m.name === s.name)
          return (
            <div key={s.name} className="list-row">
              <span>
                <strong>{s.name}</strong>{' '}
                <small>
                  {st?.state === 'connected'
                    ? `${st.tools.length} tool${st.tools.length === 1 ? '' : 's'}`
                    : st?.state === 'connecting'
                      ? 'connecting…'
                      : (st?.error ?? 'not connected')}
                </small>
              </span>
              <button
                className="icon-btn"
                aria-label={`Remove ${s.name}`}
                onClick={() =>
                  saveMcp(settings.mcpServers.filter((x) => x.name !== s.name))
                }
              >
                ✕
              </button>
            </div>
          )
        })}
        {settings.mcpServers.some((s) => mcp.find((m) => m.name === s.name)?.state === 'error') && (
          <button className="link" onClick={async () => setMcp(await nova.reconnectMcp())}>
            Retry failed servers
          </button>
        )}
        <div className="row">
          <input
            placeholder="Name (e.g. calendar)"
            value={mcpForm.name}
            maxLength={40}
            onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
            aria-label="Connector name"
          />
          <input
            placeholder="Command (e.g. npx)"
            value={mcpForm.command}
            onChange={(e) => setMcpForm({ ...mcpForm, command: e.target.value })}
            aria-label="Connector command"
            spellCheck={false}
          />
          <input
            placeholder="Args (space separated)"
            value={mcpForm.args}
            onChange={(e) => setMcpForm({ ...mcpForm, args: e.target.value })}
            aria-label="Connector arguments"
            spellCheck={false}
          />
          <button
            className="btn"
            disabled={!mcpForm.name.trim() || !mcpForm.command.trim()}
            onClick={addMcp}
          >
            Add
          </button>
        </div>
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
