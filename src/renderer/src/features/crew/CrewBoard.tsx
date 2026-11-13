import { useEffect, useState } from 'react'
import type { Step } from '../chat/useAgent'
import { AgentStage } from './AgentStage'
import { crewFrom, elapsed, progress } from './crew'
import { WALK_MS } from './stage'

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
  endedAt,
  always = false
}: {
  steps: Step[]
  busy: boolean
  lead: string
  /** What the user asked, shown as "Working on". */
  command: string
  startedAt?: number
  endedAt?: number
  /** Keep the office on screen even when nothing is happening (the wide screen's agent hub). */
  always?: boolean
}): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(false)
  // Tick while working, and for a few seconds after, so the last agent can finish its walks.
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 400)
    const stop = busy ? null : setTimeout(() => clearInterval(iv), WALK_MS * 2 + 600)
    return () => {
      clearInterval(iv)
      if (stop) clearTimeout(stop)
    }
  }, [busy])

  const crew = crewFrom(steps)
  const end = busy ? now : (endedAt ?? now)
  const total = startedAt ? end - startedAt : 0
  // A quick chat answer needs no board. Show it once real work starts, or if the wait gets long.
  if (!always && !crew.length && !(busy && total > 1500)) return null

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
      {!collapsed && <AgentStage crew={crew} now={now} busy={busy} lead={lead} />}
      <ul className="sr-only">
        {crew.map((c) => (
          <li key={c.name}>
            {c.name}:{' '}
            {c.status === 'working' ? 'working' : c.status === 'failed' ? 'stuck' : 'done'}.{' '}
            {c.line}
          </li>
        ))}
      </ul>
    </section>
  )
}
