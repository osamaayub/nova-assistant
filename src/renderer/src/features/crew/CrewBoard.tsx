import type { Step } from '../chat/useAgent'
import { ROLES, crewFrom } from './crew'

/** Live board of the agents working on the current request: the lead on top, specialists below. */
export function CrewBoard({
  steps,
  busy,
  lead
}: {
  steps: Step[]
  busy: boolean
  lead: string
}): React.JSX.Element | null {
  const crew = crewFrom(steps)
  if (!crew.length) return null
  const working = crew.filter((c) => c.status === 'working')
  const done = crew.filter((c) => c.status === 'done').length
  const leadLine = !busy
    ? 'Finished'
    : working.length
      ? `Waiting for the ${working.map((c) => c.name).join(' and the ')}`
      : 'Planning the next step'
  return (
    <section className="crew" aria-label="Agents at work">
      <div className="crew-lead">
        <span className={`crew-dot ${busy ? 'on' : ''}`} />
        <strong>{lead}</strong>
        <span className="crew-tag">Lead</span>
        <span className="crew-line">{leadLine}</span>
        <span className="crew-count">
          {done}/{crew.length} done
        </span>
      </div>
      <ul className="crew-cards">
        {crew.map((c) => (
          <li
            key={c.name}
            className={`crew-card ${c.status}`}
            style={{ '--agent': ROLES[c.name].color } as React.CSSProperties}
          >
            <div className="crew-head">
              <span className="crew-dot on" />
              <strong>{c.name.replace(' agent', '')}</strong>
              <span className="crew-state">
                {c.status === 'working' ? 'Working' : c.status === 'failed' ? 'Stuck' : 'Done'}
              </span>
            </div>
            <div className="crew-role">{ROLES[c.name].role}</div>
            <div className="crew-line" title={c.line}>
              {c.line || 'Getting started…'}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
