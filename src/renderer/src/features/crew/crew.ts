import type { Step } from '../chat/useAgent'

export type CrewStatus = 'working' | 'done' | 'failed'
export type CrewCard = { name: string; status: CrewStatus; line: string; steps: number }

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
  for (const s of steps) {
    const name = s.agent || nameIn(s.label)
    if (!name || !ROLES[name]) continue
    const card = cards.get(name) ?? { name, status: 'done' as CrewStatus, line: '', steps: 0 }
    if (s.agent) {
      card.steps += 1
      card.line = s.summary || s.label
    }
    if (s.status === 'running') card.status = 'working'
    else if ((s.status === 'error' || s.status === 'declined') && card.status !== 'working')
      card.status = 'failed'
    cards.set(name, card)
  }
  return [...cards.values()]
}
