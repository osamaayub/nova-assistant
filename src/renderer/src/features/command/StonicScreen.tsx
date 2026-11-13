import { useState } from 'react'
import type { Fact } from '../../../../shared/types'
import type { Step } from '../chat/useAgent'

type Tab = 'voice' | 'agent' | 'notes'
const TABS: { id: Tab; label: string }[] = [
  { id: 'voice', label: 'VOICE' },
  { id: 'agent', label: 'AGENT' },
  { id: 'notes', label: 'NOTES' }
]

const MARK: Record<Step['status'], string> = { running: '…', done: '✓', error: '!', declined: '–' }

/** Everything the agents did in the latest request, newest last. */
function AgentLog({ steps }: { steps: Step[] }): React.JSX.Element {
  if (!steps.length)
    return <p className="side-empty">No agent activity yet. Ask for something to see them work.</p>
  return (
    <ol className="agent-log">
      {steps.map((s) => (
        <li key={s.id} className={s.status}>
          <span className="log-mark">{MARK[s.status]}</span>
          <span>
            {s.agent && <b>{s.agent} · </b>}
            {s.summary || s.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** What Nova remembers about the user. */
function Notes({ facts }: { facts: Fact[] }): React.JSX.Element {
  if (!facts.length)
    return <p className="side-empty">Nothing remembered yet. Tell me something about you.</p>
  return (
    <ol className="agent-log notes">
      {facts.map((f) => (
        <li key={f.id}>
          <span className="log-mark">{String(f.id).padStart(2, '0')}</span>
          <span>{f.text}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The wide screen, laid out like a control room: world feed on the left; the circuits and the
 * framed avatar over the agent hub in the middle; voice, agent log and notes on the right.
 */
export function StonicScreen({
  sat,
  wires,
  avatar,
  hub,
  hubStatus,
  voice,
  steps,
  facts
}: {
  sat: React.ReactNode
  wires: React.ReactNode
  avatar: React.ReactNode
  hub: React.ReactNode
  hubStatus: string
  voice: React.ReactNode
  steps: Step[]
  facts: Fact[]
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('voice')
  return (
    <div className="stonic">
      {sat}
      <main className="stonic-mid">
        <div className="top-row">
          {wires}
          {avatar}
        </div>
        <section className="panel-hud hub">
          <h4>
            AGENT HUB <span className="hub-status">{hubStatus}</span>
          </h4>
          {hub}
        </section>
      </main>
      <aside className="panel-hud side">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'agent' && steps.length > 0 && <i className="tab-count">{steps.length}</i>}
              {t.id === 'notes' && facts.length > 0 && <i className="tab-count">{facts.length}</i>}
            </button>
          ))}
        </div>
        <div className="side-body">
          {tab === 'voice' && voice}
          {tab === 'agent' && <AgentLog steps={steps} />}
          {tab === 'notes' && <Notes facts={facts} />}
        </div>
      </aside>
    </div>
  )
}
