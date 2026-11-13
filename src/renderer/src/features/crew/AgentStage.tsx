import type { CSSProperties } from 'react'
import { AgentIcon } from './AgentIcon'
import { ROLES, type CrewCard } from './crew'
import { Figure, type Mode } from './Figure'
import {
  bubbleFor,
  deskOf,
  indexOf,
  LEAD,
  leadBubble,
  phaseOf,
  route,
  screenLines,
  TEAM,
  type Phase,
  type Point
} from './stage'

const vars = (from: Point, to: Point, color?: string): CSSProperties =>
  ({
    '--fx': `${from.x}%`,
    '--fy': `${from.y}%`,
    '--tx': `${to.x}%`,
    '--ty': `${to.y}%`,
    ...(color ? { '--c': color } : {})
  }) as CSSProperties

const MODE: Record<Phase, Mode> = {
  idle: 'stand',
  wake: 'alert',
  work: 'work',
  stuck: 'stuck',
  report: 'walk',
  return: 'walk',
  rest: 'stand'
}

const WORDS: Record<Phase, string> = {
  idle: 'standing by',
  wake: 'working',
  work: 'working',
  stuck: 'stuck',
  report: 'done',
  return: 'done',
  rest: 'done'
}

/**
 * The agent office. Every agent has its own desk and monitor. The lead stands in the middle.
 * When the lead hands out a job, that agent reacts, types, and its monitor shows what it is doing.
 * When it finishes it walks to the lead to report, then walks back to its desk.
 */
export function AgentStage({
  crew,
  now,
  busy,
  lead
}: {
  crew: CrewCard[]
  now: number
  busy: boolean
  lead: string
}): React.JSX.Element {
  const byName = new Map(crew.map((c) => [c.name, c]))
  // The connectors agent only has a desk when it has work, so the office stays tidy.
  const team = TEAM.filter((n) => n !== 'Connectors agent' || byName.has(n))
  const seats = team.map((name) => {
    const card = byName.get(name)
    return { name, card, phase: phaseOf(card, now), index: indexOf(name) }
  })
  const talking = seats.some((s) => s.phase === 'wake')
  const active = seats.filter((s) => s.phase === 'wake' || s.phase === 'work').length
  const summary = seats.map((s) => `${s.name} ${WORDS[s.phase]}`).join(', ')

  return (
    <div className="world" role="img" aria-label={`Agent office. ${summary}.`}>
      <div className="floor" />
      <div className="hud-tag left">AGENT OPS</div>
      <div className="hud-tag right">
        {active} / {seats.length} ACTIVE
      </div>
      <div
        className="ring-wrap"
        style={{ left: `${LEAD.x}%`, top: `${LEAD.y}%` }}
        aria-hidden="true"
      >
        <div className="ring a" />
        <div className="ring b" />
      </div>
      <svg className="beams" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {seats
          .filter((s) => s.phase === 'wake' || s.phase === 'work')
          .map((s) => {
            const d = deskOf(s.index)
            return (
              <line
                key={s.name}
                className="beam"
                x1={LEAD.x}
                y1={LEAD.y - 8}
                x2={d.x}
                y2={d.y - 12}
                stroke={ROLES[s.name].color}
              />
            )
          })}
      </svg>

      {seats.map(({ name, card, phase, index }) => {
        const desk = deskOf(index)
        const role = ROLES[name]
        return (
          <div
            key={`desk-${name}`}
            className={`station ${phase}`}
            style={{ left: `${desk.x}%`, top: `${desk.y}%`, '--c': role.color } as CSSProperties}
          >
            <div className={`screen ${phase === 'idle' ? '' : 'lit'}`}>
              <div className="screen-title">
                <AgentIcon id={role.icon} /> {name.replace(' agent', '')}
              </div>
              <ul>
                {screenLines(phase, card).map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ul>
              {phase === 'work' && <span className="cursor" aria-hidden="true" />}
            </div>
            <div className="deskplate" />
          </div>
        )
      })}

      {seats.map(({ name, card, phase, index }) => {
        const r = route(phase, index)
        const role = ROLES[name]
        const bubble = bubbleFor(phase, card)
        return (
          <div key={`${name}-${phase}`}>
            <div
              className={`actor ${phase} col${index % 4} ${r.moving ? 'go' : ''} ${r.to.x < r.from.x ? 'flip' : ''}`}
              style={vars(r.from, r.to, role.color)}
            >
              {bubble && (
                <div className="bubble" title={card?.line}>
                  {bubble}
                </div>
              )}
              <Figure color={role.color} hat={role.hat} mode={MODE[phase]} />
              <span className="nameplate">{name.replace(' agent', '')}</span>
              {phase === 'rest' && <span className="badge ok">✓</span>}
              {phase === 'stuck' && <span className="badge bad">!</span>}
            </div>
            {phase === 'wake' && (
              <span className="packet go" style={vars(LEAD, deskOf(index))} aria-hidden="true">
                ✉
              </span>
            )}
          </div>
        )
      })}

      <div className="actor lead" style={vars(LEAD, LEAD)}>
        <div className="bubble">
          {leadBubble(
            seats.filter((s) => s.card).map((s) => ({ name: s.name, phase: s.phase })),
            busy
          )}
        </div>
        <Figure color="var(--accent)" hat="crown" mode={talking ? 'talk' : 'stand'} />
        <span className="nameplate">{lead}</span>
      </div>
    </div>
  )
}
