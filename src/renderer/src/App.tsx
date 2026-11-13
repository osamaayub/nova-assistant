import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, CharacterId, PublicSettings } from '../../shared/types'
import { Transcript } from './features/chat/Transcript'
import { useAgentState } from './features/chat/useAgent'
import { CrewBoard } from './features/crew/CrewBoard'
import { Orb, type OrbState } from './features/orb/Orb'
import { Monitor } from './features/monitor/Monitor'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { Listener } from './features/voice/listener'
import { Speaker } from './features/voice/speaker'
import { WakeListener } from './features/voice/wakeWord'
import { nova } from './lib/api'
import { SentenceSplitter } from './lib/sentences'

const COLORS: Record<CharacterId, [string, string]> = {
  nova: ['#7dd3fc', '#6366f1'],
  jarvis: ['#fca5a5', '#f59e0b'],
  mentor: ['#fde68a', '#f97316'],
  friend: ['#86efac', '#0ea5e9'],
  custom: ['#f5d0fe', '#a855f7']
}
/** Claude needs a key; the free local brain (Ollama) does not. */
const needsKey = (s: PublicSettings | null): boolean =>
  !!s && s.provider === 'claude' && !s.hasApiKey

const NAMES: Record<Exclude<CharacterId, 'custom'>, string> = {
  nova: 'Nova',
  jarvis: 'Jarvis',
  mentor: 'Sage',
  friend: 'Max'
}

export default function App(): React.JSX.Element {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [panel, setPanel] = useState(false)
  const [section, setSection] = useState<string | undefined>()
  const [monitor, setMonitor] = useState(false)
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [level, setLevel] = useState(0)
  const [download, setDownload] = useState<string | null>(null)
  const [micError, setMicError] = useState('')
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const splitter = useRef(new SentenceSplitter())
  const speaker = useMemo(
    () =>
      new Speaker(setLevel, setSpeaking, (p) =>
        setDownload(p == null ? null : `Downloading natural voice… ${Math.round(p)}%`)
      ),
    []
  )
  const listener = useMemo(
    () =>
      new Listener(setLevel, (p) =>
        setDownload(p == null ? null : `Downloading speech model… ${Math.round(p)}%`)
      ),
    []
  )
  const wakeRef = useRef<WakeListener | null>(null)

  useEffect(() => {
    void nova.getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (!settings) return
    speaker.configure(settings.voice, settings.systemVoiceName, settings.kokoroVoice)
    if (settings.voice === 'kokoro') speaker.warmKokoro()
  }, [settings, speaker])

  // Speak each sentence as soon as it has streamed in.
  const onEvent = useCallback(
    (e: AgentEvent) => {
      const speak = settingsRef.current?.speakReplies
      if (e.type === 'start') {
        speaker.stop()
        splitter.current.flush()
      } else if (e.type === 'text' && speak)
        splitter.current.push(e.delta).forEach((s) => speaker.say(s))
      else if (e.type === 'done' && speak) splitter.current.flush().forEach((s) => speaker.say(s))
      else if (e.type === 'error' && speak) speaker.say(e.message)
      else if (e.type === 'notify' && speak) speaker.say(`Reminder: ${e.body}`)
    },
    [speaker]
  )
  const { state, dispatch } = useAgentState(onEvent, nova.onEvent)

  const send = useCallback(
    (raw: string) => {
      const msg = raw.trim()
      if (!msg || !settingsRef.current) return
      if (needsKey(settingsRef.current)) return setPanel(true)
      speaker.stop()
      dispatch({ type: 'user', text: msg })
      void nova.send(msg)
    },
    [dispatch, speaker]
  )

  const startTalk = useCallback(async () => {
    if (listening) return
    setMicError('')
    speaker.stop()
    try {
      await listener.start()
      setListening(true)
    } catch {
      setMicError(
        'Nova could not use the microphone. Check Windows Settings > Privacy > Microphone.'
      )
    }
  }, [listener, listening, speaker])

  const endTalk = useCallback(async () => {
    if (!listening) return
    setListening(false)
    setTranscribing(true)
    try {
      const words = await listener.finish()
      if (words) send(words)
    } catch {
      setMicError(
        'Speech recognition failed. The first use needs internet to download the speech model.'
      )
    } finally {
      setTranscribing(false)
    }
  }, [listener, listening, send])

  // "Hey Nova": capture the command that follows the wake phrase, then send it.
  const captureCommand = useCallback(async () => {
    setMicError('')
    speaker.stop()
    try {
      await listener.start()
      setListening(true)
      const t0 = Date.now()
      await new Promise<void>((resolve) => {
        const iv = setInterval(() => {
          // Wait for the first sound, then end 1.5 s after the voice stops. Hard cap: 12 s.
          const heard =
            listener.lastVoiceAt > 0 && Date.now() - listener.lastVoiceAt > 1500
          if ((heard && Date.now() - t0 > 800) || Date.now() - t0 > 12000) {
            clearInterval(iv)
            resolve()
          }
        }, 200)
      })
      setListening(false)
      setTranscribing(true)
      const words = await listener.finish()
      if (words) send(words)
    } catch {
      setMicError(
        'Nova could not use the microphone. Check Windows Settings > Privacy > Microphone.'
      )
    } finally {
      setListening(false)
      setTranscribing(false)
    }
  }, [listener, send, speaker])

  // Always-listening wake word. It pauses during push-to-talk and while Settings is open.
  useEffect(() => {
    if (!settings?.wakeWord || listening || panel || transcribing) {
      wakeRef.current?.stop()
      wakeRef.current = null
      return
    }
    const wake = new WakeListener(
      (audio) => listener.transcribe(audio),
      (command) => {
        void nova.showWindow()
        if (command) send(command)
        else void captureCommand()
      },
      setLevel
    )
    wakeRef.current = wake
    wake
      .start()
      .catch(() => setMicError('Wake word needs the microphone. Check Windows privacy settings.'))
    return () => {
      wake.stop()
      if (wakeRef.current === wake) wakeRef.current = null
    }
  }, [settings?.wakeWord, listening, panel, transcribing, listener, send, captureCommand])

  // Hold Space to talk (when not typing), Esc to stop.
  useEffect(() => {
    const typing = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat && !typing(e.target) && !panel) {
        e.preventDefault()
        void startTalk()
      }
      if (e.key === 'Escape') {
        if (panel) setPanel(false)
        else {
          speaker.stop()
          void nova.stop()
        }
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !typing(e.target)) void endTalk()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [startTalk, endTalk, panel, speaker])

  // Load Whisper early only when the wake word needs it. Otherwise it loads on first use.
  useEffect(() => {
    listener.setKeepLoaded(!!settings?.wakeWord)
    if (!settings?.wakeWord) return
    const t = setTimeout(() => listener.warm(), 1500)
    return () => clearTimeout(t)
  }, [listener, settings?.wakeWord])

  if (!settings) return <div className="app" />

  const name =
    settings.character === 'custom' ? settings.customName || 'Atlas' : NAMES[settings.character]
  const blocked = needsKey(settings)
  const lastItem = state.items.at(-1)
  const lastTurn = lastItem?.kind === 'assistant' ? lastItem : undefined
  const lastSteps = lastTurn?.steps ?? []
  const lastCommand = [...state.items].reverse().find((i) => i.kind === 'user')?.text ?? ''
  const orbState: OrbState = blocked
    ? 'offline'
    : listening
      ? 'listening'
      : speaking
        ? 'speaking'
        : state.busy || transcribing
          ? 'thinking'
          : 'idle'
  const status = blocked
    ? 'Pick a brain to start'
    : listening
      ? 'Listening…'
      : transcribing
        ? 'Catching that…'
        : speaking
          ? 'Speaking'
          : state.busy
            ? 'Thinking…'
            : 'Hold Space to talk'

  return (
    <div className="app" data-character={settings.character}>
      <header className="top">
        <div>
          <h1>{name}</h1>
          <p className="status" role="status">
            {status}
          </p>
        </div>
        <div className="top-actions">
          <button
            className="icon-btn"
            onClick={() => setMonitor(true)}
            aria-label="World monitor"
            title="World monitor"
          >
            ◉
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              speaker.stop()
              void nova.newChat()
              dispatch({ type: 'clear' })
            }}
            aria-label="New chat"
            title="New chat"
          >
            ＋
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setSection(undefined)
              setPanel(true)
            }}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <div className={`stage ${state.items.length ? 'compact' : ''}`}>
        <Orb state={orbState} level={level} colors={COLORS[settings.character]} />
        <nav className="circuits" aria-label="Quick settings">
          {(
            [
              ['Memory', 'memory'],
              ['Skills', 'skills'],
              ['Character', 'character'],
              ['Settings', 'brain']
            ] as const
          ).map(([label, id]) => (
            <button
              key={id}
              className="chip circuit"
              onClick={() => {
                setSection(id)
                setPanel(true)
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {blocked && (
          <div className="onboard">
            <p>
              Claude is selected but no key is saved. Use the free local brain instead, or add your
              key.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button
                className="btn primary"
                onClick={async () => setSettings(await nova.saveSettings({ provider: 'ollama' }))}
              >
                Use free local AI
              </button>
              <button className="btn" onClick={() => setPanel(true)}>
                Add Claude key
              </button>
            </div>
          </div>
        )}
        {!blocked && !state.items.length && (
          <div className="suggestions">
            {[
              'What can you do?',
              'Play some lofi music',
              'How is my PC doing?',
              'Tidy my Downloads folder'
            ].map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <CrewBoard
        steps={lastSteps}
        busy={state.busy}
        lead={name}
        command={lastCommand}
        startedAt={lastTurn?.startedAt}
        endedAt={lastTurn?.endedAt}
      />

      <Transcript
        items={state.items}
        busy={state.busy}
        name={name}
        onConfirm={(id, ok) => {
          dispatch({ type: 'answered' })
          void nova.confirm(id, ok)
        }}
      />

      {(download || micError) && (
        <p className={micError ? 'banner error' : 'banner'}>{micError || download}</p>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
          setText('')
        }}
      >
        <button
          type="button"
          className={`mic ${listening ? 'on' : ''}`}
          aria-label={listening ? 'Release to send' : 'Hold to talk'}
          aria-pressed={listening}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            void startTalk()
          }}
          onPointerUp={() => void endTalk()}
          onPointerCancel={() => {
            listener.cancel()
            setListening(false)
          }}
          disabled={blocked || transcribing}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"
            />
          </svg>
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message ${name}`}
          aria-label={`Message ${name}`}
          maxLength={4000}
        />
        {state.busy || speaking ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              speaker.stop()
              void nova.stop()
            }}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={!text.trim()}>
            Send
          </button>
        )}
      </form>

      {monitor && <Monitor onClose={() => setMonitor(false)} />}
      {panel && (
        <SettingsPanel
          settings={settings}
          section={section}
          onChange={setSettings}
          onClose={() => {
            setPanel(false)
            setSection(undefined)
          }}
        />
      )}
    </div>
  )
}
