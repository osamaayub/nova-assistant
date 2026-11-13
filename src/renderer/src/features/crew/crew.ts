import type { Step } from '../chat/useAgent'

export type CrewStatus = 'working' | 'done' | 'failed'
export type FeedLine = { id: string; text: string; status: Step['status'] }
export type CrewCard = {
  name: string
  status: CrewStatus
  /** Latest thing this agent did, in a few words. */
  line: string
  steps: number
  /** Everything this agent did, oldest first. */
  feed: FeedLine[]
  startedAt: number
  /** Set once the agent stopped working. */
  endedAt?: number
}

/** Roles shown on the board: a short job title and an accent color for each specialist. */
export const ROLES: Record<string, { role: string; color: string }> = {
  'PC agent': { role: 'Apps, music, PC health', color: '#7dd3fc' },
  'Files agent': { role: 'Folders and tidying', color: '#fcd34d' },
  'Research agent': { role: 'Facts from the web', color: '#86efac' },
  'Architect agent': { role: 'Plans the work', color: '#c4b5fd' },
  'Developer agent': { role: 'Makes the changes', color: '#fda4af' },
  'Reviewer agent': { role: 'Checks for problems', color: '#fdba74' },
  'Tester agent': { role: 'Runs the checks', color: '#5eead4' },
  'Connectors agent': { role: 'Calendar, email, more', color: '#f0abfc' }
}

const nameIn = (label: string): string | undefined =>
  Object.keys(ROLES).find((n) => label.toLowerCase().includes(n.toLowerCase()))

/**
 * Works out one card per specialist that has been involved in this turn, from the steps the
 * team already reports. A specialist is "working" while its handoff or one of its tools runs.
 */
export function crewFrom(steps: Step[]): CrewCard[] {
  const cards = new Map<string, CrewCard>()
  const lastEnd = new Map<string, number>()
  for (const s of steps) {
    const name = s.agent || nameIn(s.label)
    if (!name || !ROLES[name]) continue
    const card = cards.get(name) ?? {
      name,
      status: 'done' as CrewStatus,
      line: '',
      steps: 0,
      feed: [],
      startedAt: s.at
    }
    card.startedAt = Math.min(card.startedAt, s.at)
    if (s.agent) {
      card.steps += 1
      card.line = s.summary || s.label
      card.feed.push({ id: s.id, text: s.summary || s.label, status: s.status })
    }
    if (s.status === 'running') card.status = 'working'
    else if ((s.status === 'error' || s.status === 'declined') && card.status !== 'working')
      card.status = 'failed'
    lastEnd.set(name, Math.max(lastEnd.get(name) ?? 0, s.ended ?? 0))
    cards.set(name, card)
  }
  for (const card of cards.values())
    if (card.status !== 'working') card.endedAt = lastEnd.get(card.name) || undefined
  return [...cards.values()]
}

/** "7s", "1m 05s". Never negative. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

/** 0 to 1: how much of the team's work is finished. Counts agents, so it only moves forward. */
export function progress(crew: CrewCard[], busy: boolean): number {
  if (!crew.length) return busy ? 0.05 : 1
  const done = crew.filter((c) => c.status !== 'working').length
  return busy ? Math.min(0.95, Math.max(0.1, done / crew.length)) : 1
}
