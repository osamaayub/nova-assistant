import { ROLES, type CrewCard } from './crew'

/**
 * Where an agent is in its little story. Each phase has its own look:
 * idle: sitting at its desk, screen dim. wake: just got a job. work: typing, screen lit.
 * stuck: something went wrong. report: walking to the lead with the result.
 * return: walking back to its desk. rest: back at the desk, result on the screen.
 */
export type Phase = 'idle' | 'wake' | 'work' | 'stuck' | 'report' | 'return' | 'rest'

/** How long a walk takes, in ms. Matches the CSS animation. */
export const WALK_MS = 1200
/** How long an agent reacts to a new job before it starts typing. */
export const WAKE_MS = 700

export interface Point {
  x: number
  y: number
}

/** Where the lead stands: the middle of the office, in percent of its width and height. */
export const LEAD: Point = { x: 50, y: 66 }

/** Every agent in the team, in desk order. The connectors agent only appears when it has work. */
export const TEAM = Object.keys(ROLES)

export const indexOf = (name: string): number => Math.max(0, TEAM.indexOf(name))

const COLUMNS = [13, 37.5, 62.5, 87]

/** Each agent has its own desk: four across, two rows. It never moves, so you always find an agent in the same place. */
export function deskOf(index: number): Point {
  return { x: COLUMNS[index % 4], y: index < 4 ? 40 : 92 }
}

/** Where an agent stands next to the lead to report. */
export function spotOf(index: number): Point {
  const left = deskOf(index).x < 50
  return { x: LEAD.x + (left ? -12 : 12), y: LEAD.y + (index < 4 ? -2 : 6) }
}

export function phaseOf(card: CrewCard | undefined, now: number): Phase {
  if (!card) return 'idle'
  if (card.status === 'working') return now - card.startedAt < WAKE_MS ? 'wake' : 'work'
  if (card.status === 'failed') return 'stuck'
  if (!card.endedAt) return 'rest'
  const since = now - card.endedAt
  if (since < WALK_MS) return 'report'
  return since < WALK_MS * 2 ? 'return' : 'rest'
}

/** Where the character is drawn, and where it walked from (the same point when it is standing still). */
export function route(phase: Phase, index: number): { from: Point; to: Point; moving: boolean } {
  const desk = deskOf(index)
  const spot = spotOf(index)
  if (phase === 'report') return { from: desk, to: spot, moving: true }
  if (phase === 'return') return { from: spot, to: desk, moving: true }
  return { from: desk, to: desk, moving: false }
}

/** What an agent says in its speech bubble. Short, because the bubble is small. */
export function bubbleFor(phase: Phase, card?: CrewCard): string {
  if (phase === 'wake') return 'On it!'
  if (phase === 'work') return clip(card?.line || 'Working…', 30)
  if (phase === 'stuck') return 'I am stuck'
  if (phase === 'report') return 'Done!'
  return ''
}

/** The lines on an agent's monitor: its latest steps, or a note when it has nothing to show. */
export function screenLines(phase: Phase, card?: CrewCard): string[] {
  if (phase === 'idle') return ['Standing by']
  const feed = (card?.feed ?? []).map((f) => clip(f.text, 20))
  if (phase === 'wake' || (phase === 'work' && !feed.length)) return ['Starting…']
  if (phase === 'work') return feed.slice(-2)
  return [...feed.slice(-1), phase === 'stuck' ? 'Stuck' : 'Done']
}

/** What the lead says: who it just sent off, that it is waiting, or that everything is done. */
export function leadBubble(cards: { name: string; phase: Phase }[], busy: boolean): string {
  const waking = cards.find((c) => c.phase === 'wake')
  if (waking) return `${waking.name.replace(' agent', '')}, you're up`
  const reporting = cards.find((c) => c.phase === 'report')
  if (reporting) return `Thanks, ${reporting.name.replace(' agent', '')}`
  if (!busy) return 'All done'
  return cards.some((c) => c.phase === 'work') ? 'Waiting on the team…' : 'Let me think…'
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
