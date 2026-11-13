import { useEffect, useState } from 'react'
import type { Step } from '../chat/useAgent'
import { crewFrom, elapsed, progress, ROLES } from './crew'

const MARK: Record<Step['status'], string> = { running: '…', done: '✓', error: '!', declined: '–' }

/**
 * The agents at work. Appears as soon as a command is running: who is doing what, for how long,
 * and what each agent has done so far. Stays after the work ends so the result can be checked.
 */
export function CrewBoard({
  steps,
  busy,
  lead,
  command,
  startedAt,
  endedAt
}: {
  steps: Step[]
  busy: boolean
  lead: string
  /** What the user asked, shown as "Working on". */
  command: string
  startedAt?: number
  endedAt?: number
}): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (!busy) return
    const iv = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(iv)
  }, [busy])

  const crew = crewFrom(steps)
  const end = busy ? now : (endedAt ?? now)
  const total = startedAt ? end - startedAt : 0
  // A quick chat answer needs no board. Show it once real work starts, or if the wait gets long.
  if (!crew.length && !(busy && total > 1500)) return null

  const working = crew.filter((c) => c.status === 'working')
  const leadLine = !busy
    ? `Finished in ${elapsed(total)}`
    : working.length
      ? `Waiting for the ${working.map((c) => c.name).join(' and the ')}`
      : crew.length
        ? 'Putting the answer together'
        : 'Deciding who should do this'
  const pct = Math.round(progress(crew, busy) * 100)

  return (
    <section className="crew" aria-label="Agents at work">
      <button
        className="crew-lead"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show agents' : 'Hide agents'}
      >
        <span className={`crew-dot ${busy ? 'on pulse' : ''}`} />
        <strong>{lead}</strong>
        <span className="crew-tag">Lead</span>
        <span className="crew-line">{leadLine}</span>
        <span className="crew-count">{busy ? elapsed(total) : collapsed ? '▸' : '▾'}</span>
      </button>
      {command && (
        <p className="crew-task" title={command}>
          Working on: “{command}”
        </p>
      )}
      <div
        className="crew-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`crew-fill ${busy ? 'live' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {!collapsed && (
        <ul className="crew-cards">
          {!crew.length && (
            <li className="crew-card placeholder" aria-hidden="true">
              <div className="crew-head">
                <span className="crew-dot on pulse" />
                <strong>Choosing agents…</strong>
              </div>
              <div className="crew-role">Picking the right ones for the job</div>
            </li>
          )}
          {crew.map((c) => (
            <li
              key={c.name}
              className={`crew-card ${c.status}`}
              style={{ '--agent': ROLES[c.name].color } as React.CSSProperties}
            >
              <div className="crew-head">
                <span className={`crew-dot on ${c.status === 'working' ? 'pulse' : ''}`} />
                <strong>{c.name.replace(' agent', '')}</strong>
                <span className="crew-state">
                  {c.status === 'working' ? 'Working' : c.status === 'failed' ? 'Stuck' : 'Done'}
                </span>
              </div>
              <div className="crew-role">
                {ROLES[c.name].role} · {elapsed((c.endedAt ?? now) - c.startedAt)}
              </div>
              <ul className="crew-feed">
                {c.feed.length === 0 && <li className="running">Getting started…</li>}
                {c.feed.slice(-3).map((f) => (
                  <li key={f.id} className={f.status} title={f.text}>
                    <span>{MARK[f.status]}</span> {f.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
