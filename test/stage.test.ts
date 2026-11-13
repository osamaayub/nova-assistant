import { describe, expect, it } from 'vitest'
import type { CrewCard } from '../src/renderer/src/features/crew/crew'
import {
  bubbleFor,
  deskOf,
  indexOf,
  LEAD,
  leadBubble,
  phaseOf,
  route,
  screenLines,
  spotOf,
  TEAM,
  WAKE_MS,
  WALK_MS
} from '../src/renderer/src/features/crew/stage'

const card = (over: Partial<CrewCard> = {}): CrewCard => ({
  name: 'PC agent',
  status: 'working',
  line: '',
  steps: 0,
  feed: [],
  startedAt: 10_000,
  ...over
})

describe('agent office', () => {
  it('shows an agent with no work as idle, then walks the whole story', () => {
    expect(phaseOf(undefined, 5000)).toBe('idle')
    expect(phaseOf(card(), 10_000 + 100)).toBe('wake')
    expect(phaseOf(card(), 10_000 + WAKE_MS + 1)).toBe('work')
    const done = card({ status: 'done', endedAt: 20_000 })
    expect(phaseOf(done, 20_000 + 100)).toBe('report')
    expect(phaseOf(done, 20_000 + WALK_MS + 100)).toBe('return')
    expect(phaseOf(done, 20_000 + WALK_MS * 2 + 100)).toBe('rest')
    expect(phaseOf(card({ status: 'failed' }), 99_999)).toBe('stuck')
  })

  it('treats a finished agent with no end time as resting, not walking forever', () => {
    expect(phaseOf(card({ status: 'done' }), 50_000)).toBe('rest')
  })

  it('gives every agent its own desk, four across in two rows, all inside the office', () => {
    expect(TEAM).toHaveLength(8)
    const desks = TEAM.map((_, i) => deskOf(i))
    expect(new Set(desks.map((d) => `${d.x},${d.y}`)).size).toBe(8)
    expect(new Set(desks.map((d) => d.y)).size).toBe(2)
    for (const p of [...desks, ...TEAM.map((_, i) => spotOf(i)), LEAD]) {
      expect(p.x).toBeGreaterThanOrEqual(5)
      expect(p.x).toBeLessThanOrEqual(95)
      expect(p.y).toBeGreaterThanOrEqual(30)
      expect(p.y).toBeLessThanOrEqual(98)
    }
  })

  it('keeps each agent at the same desk, found by name', () => {
    expect(indexOf('PC agent')).toBe(0)
    expect(indexOf('Files agent')).toBe(1)
    expect(indexOf('Nobody agent')).toBe(0)
  })

  it('walks to the lead to report and back to the desk, and stays put otherwise', () => {
    const out = route('report', 1)
    expect(out.from).toEqual(deskOf(1))
    expect(out.to).toEqual(spotOf(1))
    expect(out.moving).toBe(true)
    const back = route('return', 1)
    expect(back.from).toEqual(spotOf(1))
    expect(back.to).toEqual(deskOf(1))
    for (const p of ['idle', 'wake', 'work', 'stuck', 'rest'] as const)
      expect(route(p, 2)).toEqual({ from: deskOf(2), to: deskOf(2), moving: false })
    // The reporting spot is next to the lead, on the same side as the desk.
    expect(spotOf(0).x).toBeLessThan(LEAD.x)
    expect(spotOf(3).x).toBeGreaterThan(LEAD.x)
  })

  it('shows what the agent is doing on its monitor, two lines at most', () => {
    const feed = [
      { id: '1', text: 'Checking your PC', status: 'done' as const },
      { id: '2', text: 'CPU 31%, RAM 9.1 GB / 15.9 GB total', status: 'done' as const },
      { id: '3', text: 'Looking in a folder', status: 'running' as const }
    ]
    expect(screenLines('idle')).toEqual(['Standing by'])
    expect(screenLines('wake', card())).toEqual(['Starting…'])
    expect(screenLines('work', card())).toEqual(['Starting…'])
    const lines = screenLines('work', card({ feed }))
    expect(lines).toHaveLength(2)
    expect(lines[0].length).toBeLessThanOrEqual(20)
    expect(screenLines('rest', card({ status: 'done', feed }))).toEqual([
      'Looking in a folder',
      'Done'
    ])
    expect(screenLines('stuck', card({ status: 'failed', feed })).at(-1)).toBe('Stuck')
  })

  it('says short, useful things', () => {
    expect(bubbleFor('wake', card())).toBe('On it!')
    expect(bubbleFor('work', card({ line: 'CPU 31%, RAM 9.1 GB' }))).toBe('CPU 31%, RAM 9.1 GB')
    expect(bubbleFor('work', card({ line: 'x'.repeat(80) }))).toHaveLength(30)
    expect(bubbleFor('rest', card())).toBe('')
    expect(bubbleFor('report', card())).toBe('Done!')
    expect(bubbleFor('stuck', card())).toMatch(/stuck/)
  })

  it('lets the lead announce who goes next, thank who reports, wait, then finish', () => {
    expect(leadBubble([{ name: 'PC agent', phase: 'wake' }], true)).toBe("PC, you're up")
    expect(leadBubble([{ name: 'Files agent', phase: 'report' }], true)).toBe('Thanks, Files')
    expect(leadBubble([{ name: 'PC agent', phase: 'work' }], true)).toMatch(/waiting/i)
    expect(leadBubble([], true)).toMatch(/think/i)
    expect(leadBubble([{ name: 'PC agent', phase: 'rest' }], false)).toBe('All done')
  })
})
