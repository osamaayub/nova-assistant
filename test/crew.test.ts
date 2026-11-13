import { describe, expect, it } from 'vitest'
import { crewFrom, elapsed, progress } from '../src/renderer/src/features/crew/crew'
import type { Step } from '../src/renderer/src/features/chat/useAgent'

const step = (s: Partial<Step> & Pick<Step, 'id' | 'label' | 'status'>): Step => ({
  at: 1000,
  ...s
})

describe('crew board', () => {
  it('shows a specialist as working from its handoff, before it has run any tool', () => {
    const crew = crewFrom([step({ id: '1', label: 'Asking the PC agent', status: 'running' })])
    expect(crew).toHaveLength(1)
    expect(crew[0]).toMatchObject({ name: 'PC agent', status: 'working', line: '', steps: 0, feed: [] })
    expect(crew[0].endedAt).toBeUndefined()
  })

  it('tracks several specialists and marks each done, working or stuck', () => {
    const crew = crewFrom([
      step({ id: '1', label: 'Asking the PC agent', status: 'done', summary: 'PC agent reported back', ended: 5000 }),
      step({ id: '2', label: 'Finding music', status: 'done', summary: 'Searched YouTube', agent: 'PC agent', at: 1200, ended: 3000 }),
      step({ id: '3', label: 'Asking the Files agent', status: 'done', at: 1100, ended: 4000 }),
      step({ id: '4', label: 'Opening a folder', status: 'error', agent: 'Files agent', at: 1300, ended: 3500 }),
      step({ id: '5', label: 'Asking the Research agent', status: 'running', at: 1400 })
    ])
    expect(crew.map((c) => [c.name, c.status])).toEqual([
      ['PC agent', 'done'],
      ['Files agent', 'failed'],
      ['Research agent', 'working']
    ])
    expect(crew[0]).toMatchObject({ line: 'Searched YouTube', steps: 1 })
  })

  it('keeps a live feed per agent, oldest first, and times each agent', () => {
    const crew = crewFrom([
      step({ id: '1', label: 'Asking the PC agent', status: 'done', at: 1000, ended: 9000 }),
      step({ id: '2', label: 'Checking your PC', status: 'done', summary: 'CPU 31%', agent: 'PC agent', at: 1500, ended: 2000 }),
      step({ id: '3', label: 'Finding music', status: 'running', agent: 'PC agent', at: 2500 })
    ])
    expect(crew[0].feed).toEqual([
      { id: '2', text: 'CPU 31%', status: 'done' },
      { id: '3', text: 'Finding music', status: 'running' }
    ])
    expect(crew[0].startedAt).toBe(1000)
    // Still working, so no end time yet.
    expect(crew[0].endedAt).toBeUndefined()
    const finished = crewFrom([
      step({ id: '1', label: 'Asking the PC agent', status: 'done', at: 1000, ended: 9000 }),
      step({ id: '2', label: 'Checking your PC', status: 'done', agent: 'PC agent', at: 1500, ended: 2000 })
    ])
    expect(finished[0].endedAt).toBe(9000)
  })

  it('ignores the lead agent tools and unknown names', () => {
    expect(
      crewFrom([
        step({ id: '1', label: 'Remembering', status: 'done' }),
        step({ id: '2', label: 'Something', status: 'done', agent: 'Mystery agent' })
      ])
    ).toEqual([])
  })
})

describe('timers and progress', () => {
  it('writes elapsed time in plain units and never goes negative', () => {
    expect(elapsed(0)).toBe('0s')
    expect(elapsed(7400)).toBe('7s')
    expect(elapsed(65_000)).toBe('1m 05s')
    expect(elapsed(-500)).toBe('0s')
  })

  it('moves forward as agents finish, and never shows done while still busy', () => {
    const card = (status: 'working' | 'done') => ({
      name: 'PC agent', status, line: '', steps: 0, feed: [], startedAt: 0
    })
    expect(progress([], true)).toBeLessThan(0.2)
    expect(progress([card('working'), card('working')], true)).toBe(0.1)
    expect(progress([card('done'), card('working')], true)).toBe(0.5)
    expect(progress([card('done'), card('done')], true)).toBe(0.95)
    expect(progress([card('done'), card('done')], false)).toBe(1)
    expect(progress([], false)).toBe(1)
  })
})
